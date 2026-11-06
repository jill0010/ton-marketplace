import "TestReserveVault"

// Experimental integration adapter. The configured marketplace is emulated;
// deployed Marketplace V2 has no allocation entrypoint.
contract TestReserveCoordinator {
    author: "TON Market"
    version: "0.1.0"
    description: "Simulation-only per-order reserve allocation coordinator"
    storage: TestReserveCoordinatorStorage
    incomingMessages: TestReserveCoordinatorMessage
}

struct TestReserveBinding {
    vault: address
    buyer: address
    paymentHash: uint256
    // 1 allocation sent; 2 funding ACK verified; 3 bounced, manual review.
    status: uint8
    returnedNano: uint64
}

struct TestReserveCoordinatorStorage {
    owner: address
    marketplace: address
    vaultCode: cell
    bindings: map<uint64, Cell<TestReserveBinding>>
}

struct (0x72730201) AllocateTestReserve {
    orderId: uint64
    buyer: address
    paymentHash: uint256
}

struct (0x72730202) TestReserveAllocationConfirmed {
    orderId: uint64
    paymentHash: uint256
    vault: address
}

struct (0x72730203) TestReserveAllocationFailed {
    orderId: uint64
    paymentHash: uint256
    vault: address
}

struct (0x72730204) RetryTestReserveAllocationAck {
    orderId: uint64
}

type TestReserveCoordinatorMessage =
    | AllocateTestReserve
    | TestReserveFunded
    | RetryTestReserveAllocationAck

fun TestReserveCoordinatorStorage.load(): TestReserveCoordinatorStorage {
    return TestReserveCoordinatorStorage.fromCell(contract.getData());
}

fun TestReserveCoordinatorStorage.save(self) {
    contract.setData(self.toCell());
}

fun onInternalMessage(in: InMessage) {
    if (in.body.isEmpty()) {
        return;
    }
    val msg = lazy TestReserveCoordinatorMessage.fromSlice(in.body);
    var storage = TestReserveCoordinatorStorage.load();
    match (msg) {
        AllocateTestReserve => {
            assert (in.senderAddress == storage.marketplace) throw 721;
            assert (msg.orderId > 0 && msg.paymentHash != 0) throw 722;
            assert (msg.buyer != contract.getAddress()) throw 722;
            assert (!storage.bindings.get(msg.orderId).isFound) throw 723;
            // 0.2 reserve + 0.05 vault operations + 0.03 adapter operations.
            assert (in.valueCoins == grams("0.28")) throw 724;
            val vaultState: ContractState = {
                code: storage.vaultCode,
                data: TestReserveVaultStorage {
                    owner: storage.owner,
                    identity: TestReserveIdentity {
                        fundingSource: contract.getAddress(),
                        buyer: msg.buyer,
                        orderId: msg.orderId,
                        paymentHash: msg.paymentHash,
                    }.toCell(),
                    funded: false,
                    status: 0,
                    refundAmount: 0,
                    reviewedCosts: 0,
                    queryId: 0,
                    evidenceHash: 0,
                    receiptHash: 0,
                }.toCell(),
            };
            val destination = AutoDeployAddress {
                workchain: 0,
                stateInit: vaultState,
            };
            val vault = destination.calculateAddress();
            storage
                .bindings
                .set(
                    msg.orderId,
                    TestReserveBinding {
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
                value: grams("0.25"),
                dest: destination,
                body: FundTestReserve { orderId: msg.orderId },
            }).send(SEND_MODE_PAY_FEES_SEPARATELY);
        }
        RetryTestReserveAllocationAck => {
            assert (in.senderAddress == storage.owner) throw 721;
            val found = storage.bindings.get(msg.orderId);
            assert (found.isFound) throw 722;
            val binding = TestReserveBinding.fromCell(found.loadValue());
            assert (binding.status == 2) throw 723;
            assert (in.valueCoins >= grams("0.01")) throw 724;
            createMessage({
                bounce: BounceMode.NoBounce,
                value: grams("0.005"),
                dest: storage.marketplace,
                body: TestReserveAllocationConfirmed {
                    orderId: msg.orderId,
                    paymentHash: binding.paymentHash,
                    vault: binding.vault,
                },
            }).send(SEND_MODE_PAY_FEES_SEPARATELY);
        }
        TestReserveFunded => {
            val found = storage.bindings.get(msg.orderId);
            assert (found.isFound) throw 722;
            var binding = TestReserveBinding.fromCell(found.loadValue());
            assert (in.senderAddress == binding.vault) throw 721;
            assert (msg.paymentHash == binding.paymentHash) throw 722;
            assert (binding.status == 1 || binding.status == 2) throw 723;
            if (binding.status == 1) {
                binding.status = 2;
                storage.bindings.set(msg.orderId, binding.toCell());
                storage.save();
            }
            createMessage({
                bounce: BounceMode.NoBounce,
                value: grams("0.005"),
                dest: storage.marketplace,
                body: TestReserveAllocationConfirmed {
                    orderId: msg.orderId,
                    paymentHash: binding.paymentHash,
                    vault: binding.vault,
                },
            }).send(SEND_MODE_PAY_FEES_SEPARATELY);
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
        // A failed marketplace notification can return the entire 0.2 TON
        // principal. Quarantine it; never mark the buyer refunded or resend
        // automatically without reconciling the returned value.
        try {
            val failure = TestReserveAllocationFailed.fromCell(rich.originalBody);
            var failedStorage = TestReserveCoordinatorStorage.load();
            val failedFound = failedStorage.bindings.get(failure.orderId);
            if (failedFound.isFound) {
                var failedBinding = TestReserveBinding.fromCell(failedFound.loadValue());
                if (
                    failedBinding.status == 4 && in.senderAddress == failedStorage.marketplace &&
                    failedBinding.paymentHash == failure.paymentHash &&
                    failedBinding.vault == failure.vault &&
                    originalInfo.valueCoins == grams("0.2")
                ) {
                    failedBinding.status = 3;
                    failedBinding.returnedNano = in.valueCoins as uint64;
                    failedStorage.bindings.set(failure.orderId, failedBinding.toCell());
                    failedStorage.save();
                }
            }
            return;
        } catch {}
        val funded = FundTestReserve.fromCell(rich.originalBody);
        var storage = TestReserveCoordinatorStorage.load();
        val found = storage.bindings.get(funded.orderId);
        if (!found.isFound) {
            return;
        }
        var binding = TestReserveBinding.fromCell(found.loadValue());
        if (
            in.senderAddress != binding.vault || binding.status != 1 ||
            originalInfo.valueCoins != grams("0.25")
        ) {
            return;
        }
        // Only a failed, still-pending allocation may return the buyer reserve.
        // Costs are subsidized by operator funds in this experimental path.
        binding.status = 3;
        binding.returnedNano = in.valueCoins as uint64;
        storage.bindings.set(funded.orderId, binding.toCell());
        storage.save();
        if (in.valueCoins >= grams("0.21")) {
            binding.status = 4; // Reserve return dispatched once; not a receipt claim.
            storage.bindings.set(funded.orderId, binding.toCell());
            storage.save();
            createMessage({
                bounce: BounceMode.RichBounce,
                value: grams("0.2"),
                dest: storage.marketplace,
                body: TestReserveAllocationFailed {
                    orderId: funded.orderId,
                    paymentHash: binding.paymentHash,
                    vault: binding.vault,
                },
            }).send(SEND_MODE_PAY_FEES_SEPARATELY);
        }
    } catch {}
}

get fun testReserveBinding(orderId: uint64): TestReserveBinding? {
    val result = TestReserveCoordinatorStorage.load().bindings.get(orderId);
    if (!result.isFound) {
        return null;
    }
    return TestReserveBinding.fromCell(result.loadValue());
}
