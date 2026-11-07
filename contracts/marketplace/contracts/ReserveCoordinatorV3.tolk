import "ReserveVaultV3"

struct ReserveCoordinatorBindingV3 {
    vault: address
    buyer: address
    paymentHash: uint256
    status: uint8
    returnedNano: uint64
}

struct ReserveCoordinatorStorageV3 {
    owner: address
    marketplace: address
    verifier: address
    vaultCode: cell
    bindings: map<uint64, Cell<ReserveCoordinatorBindingV3>>
}

struct (0x72730601) AllocateReserveV3 {
    orderId: uint64
    buyer: address
    paymentHash: uint256
}

struct (0x72730602) ReserveAllocationConfirmedV3 {
    orderId: uint64
    paymentHash: uint256
    vault: address
}

struct (0x72730603) ReserveAllocationFailedV3 {
    orderId: uint64
    paymentHash: uint256
    vault: address
}

struct (0x72730604) RetryReserveAllocationAckV3 {
    orderId: uint64
}

type ReserveCoordinatorMessageV3 =
    | AllocateReserveV3
    | ReserveFundedV3
    | RetryReserveAllocationAckV3

contract ReserveCoordinatorV3 {
    author: "TON Market"
    version: "3.0.0"
    description: "Production V3 per-order reserve vault allocator"
    storage: ReserveCoordinatorStorageV3
    incomingMessages: ReserveCoordinatorMessageV3
}

fun ReserveCoordinatorStorageV3.load(): ReserveCoordinatorStorageV3 {
    return ReserveCoordinatorStorageV3.fromCell(contract.getData());
}

fun ReserveCoordinatorStorageV3.save(self) {
    contract.setData(self.toCell());
}

fun sendReserveAllocationConfirmedV3(
    marketplace: address,
    binding: ReserveCoordinatorBindingV3,
    orderId: uint64,
) {
    createMessage({
        bounce: BounceMode.RichBounce,
        value: grams("0.005"),
        dest: marketplace,
        body: ReserveAllocationConfirmedV3 {
            orderId,
            paymentHash: binding.paymentHash,
            vault: binding.vault,
        },
    }).send(SEND_MODE_PAY_FEES_SEPARATELY);
}

fun onInternalMessage(in: InMessage) {
    if (in.body.isEmpty()) {
        return;
    }
    val msg = lazy ReserveCoordinatorMessageV3.fromSlice(in.body);
    var storage = ReserveCoordinatorStorageV3.load();
    match (msg) {
        AllocateReserveV3 => {
            assert (in.senderAddress == storage.marketplace) throw 781;
            assert (msg.orderId > 0 && msg.paymentHash != 0) throw 782;
            assert (msg.buyer != contract.getAddress() && msg.buyer != storage.marketplace) throw 782;
            assert (!storage.bindings.get(msg.orderId).isFound) throw 783;
            // Buyer reserve principal is 0.2 TON. 0.08 TON is an explicit,
            // separate per-order vault operational budget; network execution
            // fees are paid from the coordinator's independently funded balance.
            assert (in.valueCoins == grams("0.28")) throw 784;
            val vaultState: ContractState = {
                code: storage.vaultCode,
                data: ReserveVaultStorageV3 {
                    owner: storage.owner,
                    identity: ReserveVaultIdentityV3 {
                        funding: ReserveVaultFundingIdentityV3 {
                            fundingSource: contract.getAddress(),
                            marketplace: storage.marketplace,
                        }.toCell(),
                        parties: ReserveVaultPartiesV3 {
                            verifier: storage.verifier,
                            buyer: msg.buyer,
                        }.toCell(),
                        order: ReserveVaultOrderIdentityV3 {
                            orderId: msg.orderId,
                            paymentHash: msg.paymentHash,
                        }.toCell(),
                    }.toCell(),
                    balances: ReserveVaultBalancesV3 {
                        principal: grams("0.2"),
                        available: 0,
                        inFlight: 0,
                        paid: 0,
                        operationalBudget: 0,
                    }.toCell(),
                    operation: ReserveVaultOperationV3 {
                        operationId: 0,
                        queryId: 0,
                        activeStatementHash: 0,
                        status: 0,
                        retryCount: 0,
                    }.toCell(),
                    consumedStatements: [],
                }.toCell(),
                    principal: grams("0.2"),
                    available: 0,
                    inFlight: 0,
                    paid: 0,
                    operationalBudget: 0,
                    operationId: 0,
                    queryId: 0,
                    activeStatementHash: 0,
                    status: 0,
                    retryCount: 0,
                    consumedStatements: [],
                }.toCell(),
            };
            val destination = AutoDeployAddress {
                workchain: 0,
                stateInit: vaultState,
            };
            val vault = destination.calculateAddress();
            storage.bindings.set(
                msg.orderId,
                ReserveCoordinatorBindingV3 {
                    vault,
                    buyer: msg.buyer,
                    paymentHash: msg.paymentHash,
                    status: 1,
                    returnedNano: 0,
                }.toCell(),
            );
            storage.save();
            createMessage({
                bounce: BounceMode.RichBounce,
                value: grams("0.28"),
                dest: destination,
                body: FundReserveV3 {
                    orderId: msg.orderId,
                    paymentHash: msg.paymentHash,
                },
            }).send(SEND_MODE_PAY_FEES_SEPARATELY);
        }
        ReserveFundedV3 => {
            val found = storage.bindings.get(msg.orderId);
            assert (found.isFound) throw 782;
            var binding = ReserveCoordinatorBindingV3.fromCell(found.loadValue());
            assert (in.senderAddress == binding.vault) throw 781;
            assert (msg.paymentHash == binding.paymentHash && msg.vault == binding.vault) throw 782;
            assert (binding.status == 1 || binding.status == 2) throw 783;
            if (binding.status == 1) {
                binding.status = 2;
                storage.bindings.set(msg.orderId, binding.toCell());
                storage.save();
            }
            sendReserveAllocationConfirmedV3(storage.marketplace, binding, msg.orderId);
        }
        RetryReserveAllocationAckV3 => {
            assert (in.senderAddress == storage.owner) throw 781;
            val found = storage.bindings.get(msg.orderId);
            assert (found.isFound) throw 782;
            val binding = ReserveCoordinatorBindingV3.fromCell(found.loadValue());
            assert (binding.status == 2) throw 783;
            assert (in.valueCoins >= grams("0.01")) throw 784;
            sendReserveAllocationConfirmedV3(storage.marketplace, binding, msg.orderId);
        }
    }
}

fun onBouncedMessage(in: InMessageBounced) {
    if (in.bouncedBody.remainingBitsCount() < 32) {
        return;
    }
    if (in.bouncedBody.preloadUint(32) != 0xfffffffe) {
        return;
    }
    try {
        val rich = lazy RichBounceBody.fromSlice(in.bouncedBody);
        val originalInfo = RichBounceOriginalMsgInfo.fromCell(rich.originalInfo);
        val funded = FundReserveV3.fromCell(rich.originalBody);
        var storage = ReserveCoordinatorStorageV3.load();
        val found = storage.bindings.get(funded.orderId);
        if (!found.isFound) {
            return;
        }
        var binding = ReserveCoordinatorBindingV3.fromCell(found.loadValue());
        if (
            in.senderAddress != binding.vault || binding.status != 1 ||
            funded.paymentHash != binding.paymentHash ||
            originalInfo.valueCoins != grams("0.28") ||
            in.valueCoins < grams("0.19")
        ) {
            return;
        }
        binding.status = 3;
        binding.returnedNano = in.valueCoins as uint64;
        storage.bindings.set(funded.orderId, binding.toCell());
        storage.save();
        // Only return the reserve principal after the exact original 0.28 TON
        // funding transfer bounced back to this coordinator. The 0.08 TON
        // operational allocation remains separately accounted.
        if (in.valueCoins >= grams("0.2")) {
            createMessage({
                bounce: BounceMode.RichBounce,
                value: grams("0.2"),
                dest: storage.marketplace,
                body: ReserveAllocationFailedV3 {
                    orderId: funded.orderId,
                    paymentHash: binding.paymentHash,
                    vault: binding.vault,
                },
            }).send(SEND_MODE_PAY_FEES_SEPARATELY);
        }
    } catch {}
}

get fun reserveCoordinatorBindingV3(orderId: uint64): ReserveCoordinatorBindingV3? {
    val result = ReserveCoordinatorStorageV3.load().bindings.get(orderId);
    if (!result.isFound) {
        return null;
    }
    return ReserveCoordinatorBindingV3.fromCell(result.loadValue());
}

get fun reserveCoordinatorMarketplaceV3(): address {
    return ReserveCoordinatorStorageV3.load().marketplace;
}

get fun reserveCoordinatorVerifierV3(): address {
    return ReserveCoordinatorStorageV3.load().verifier;
}
