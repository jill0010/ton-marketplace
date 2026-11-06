import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@contracts/TestReserveCoordinator"
import "@contracts/TestReserveVault"

fun coordinatorSetup(vaultCode: cell? = null): (address, address, address, address) {
    val owner = testing.treasury("coordinatorOwner").address;
    val marketplace = testing.treasury("emulatedMarketplace").address;
    val buyer = testing.treasury("coordinatorBuyer").address;
    val state: ContractState = {
        code: build("TestReserveCoordinator"),
        data: TestReserveCoordinatorStorage {
            owner,
            marketplace,
            vaultCode: vaultCode ?? build("TestReserveVault"),
            bindings: [],
        }.toCell(),
    };
    val destination = AutoDeployAddress {
        workchain: 0,
        stateInit: state,
    };
    val address = destination.calculateAddress();
    expect(
        net.send(
            owner,
            createMessage({
                bounce: false,
                value: grams("0.1"),
                dest: destination,
            }),
        ),
    ).toHaveSuccessfulDeploy({ to: address });
    return (address, owner, marketplace, buyer);
}

fun coordinatorSend(
    from: address,
    coordinator: address,
    orderId: uint64,
    buyer: address,
    value: coins,
): SendResultList {
    return net.send(
        from,
        createMessage({
            bounce: BounceMode.RichBounce,
            value,
            dest: coordinator,
            body: AllocateTestReserve {
                orderId,
                buyer,
                paymentHash: 12345,
            },
        }),
    );
}

get fun `test coordinator allocates reserve deploys vault and accepts exact funding acknowledgement`() {
    val (coordinator, owner, marketplace, buyer) = coordinatorSetup();
    expect(
        coordinatorSend(marketplace, coordinator, 1, buyer, grams("0.28")),
    ).toHaveSuccessfulTx({ to: coordinator });
    val binding = net.runGetMethod<TestReserveBinding?>(coordinator, "testReserveBinding", [1]);
    assert (binding != null) throw 799;
    expect(binding!!.status).toEqual(2);
    expect(binding.buyer).toEqual(buyer);
    expect(net.runGetMethod<uint8>(binding.vault, "testReserveStatus")).toEqual(1);
    expect(
        net.send(
            owner,
            createMessage({
                bounce: BounceMode.RichBounce,
                value: grams("0.05"),
                dest: binding.vault,
                body: ReviewTestReserve {
                    orderId: 1,
                    evidenceHash: 6789,
                    attributedCosts: grams("0.006"),
                    terminalKind: 1,
                },
            }),
        ),
    ).toHaveSuccessfulTx({ from: binding.vault, to: buyer });
    expect(net.runGetMethod<coins>(binding.vault, "testReserveRefund")).toEqual(grams("0.194"));
}

get fun `test coordinator blocks wrong source amount and duplicate order before any allocation`() {
    val (coordinator, owner, marketplace, buyer) = coordinatorSetup();
    expect(
        coordinatorSend(owner, coordinator, 1, buyer, grams("0.28")),
    ).toHaveFailedTx({ to: coordinator, exitCode: 721 });
    expect(
        coordinatorSend(marketplace, coordinator, 1, buyer, grams("0.27")),
    ).toHaveFailedTx({ to: coordinator, exitCode: 724 });
    expect(
        net.runGetMethod<TestReserveBinding?>(coordinator, "testReserveBinding", [1]) == null,
    ).toEqual(true);
    expect(
        coordinatorSend(marketplace, coordinator, 1, buyer, grams("0.28")),
    ).toHaveSuccessfulTx({ to: coordinator });
    expect(
        coordinatorSend(marketplace, coordinator, 1, buyer, grams("0.28")),
    ).toHaveFailedTx({ to: coordinator, exitCode: 723 });
}

get fun `test coordinator rejects forged ACK and accepts exact idempotent replay`() {
    val (coordinator, owner, marketplace, buyer) = coordinatorSetup();
    expect(
        coordinatorSend(marketplace, coordinator, 1, buyer, grams("0.28")),
    ).toHaveSuccessfulTx({ to: coordinator });
    val binding = net.runGetMethod<TestReserveBinding?>(coordinator, "testReserveBinding", [1])!!;
    expect(
        net.send(
            owner,
            createMessage({
                bounce: false,
                value: grams("0.01"),
                dest: coordinator,
                body: TestReserveFunded {
                    orderId: 1,
                    paymentHash: 12345,
                },
            }),
        ),
    ).toHaveFailedTx({ to: coordinator, exitCode: 721 });
    // Use the vault's real owner-only callback retry, not an impersonated sender.
    expect(
        net.send(
            owner,
            createMessage({
                bounce: false,
                value: grams("0.02"),
                dest: binding.vault,
                body: RetryTestReserveFundingAck { orderId: 1 },
            }),
        ),
    ).toHaveSuccessfulTx({ from: binding.vault, to: coordinator });
    expect(
        net.runGetMethod<TestReserveBinding?>(coordinator, "testReserveBinding", [1])!!.status,
    ).toEqual(2);
}

get fun `test coordinator derives separate vaults for separate orders`() {
    val (coordinator, _, marketplace, buyer) = coordinatorSetup();
    expect(
        coordinatorSend(marketplace, coordinator, 1, buyer, grams("0.28")),
    ).toHaveSuccessfulTx({ to: coordinator });
    expect(
        coordinatorSend(marketplace, coordinator, 2, buyer, grams("0.28")),
    ).toHaveSuccessfulTx({ to: coordinator });
    val first = net.runGetMethod<TestReserveBinding?>(coordinator, "testReserveBinding", [1])!!;
    val second = net.runGetMethod<TestReserveBinding?>(coordinator, "testReserveBinding", [2])!!;
    expect(first.vault == second.vault).toEqual(false);
    expect(first.status).toEqual(2);
    expect(second.status).toEqual(2);
}

get fun `test coordinator records failed vault funding without marking it funded`() {
    val (coordinator, _, marketplace, buyer) = coordinatorSetup(build("Empty"));
    val result = coordinatorSend(marketplace, coordinator, 1, buyer, grams("0.28"));
    expect(result).toHaveSuccessfulTx({ to: coordinator });
    val binding = net.runGetMethod<TestReserveBinding?>(coordinator, "testReserveBinding", [1])!!;
    expect(binding.status).toEqual(4);
    expect(binding.returnedNano > 200000000).toEqual(true);
    expect(
        coordinatorSend(marketplace, coordinator, 1, buyer, grams("0.28")),
    ).toHaveFailedTx({ to: coordinator, exitCode: 723 });
}

get fun `test coordinator quarantines insufficient returned principal despite pooled balance`() {
    val (coordinator, _, marketplace, buyer) = coordinatorSetup();
    val cursor = testing.createTraceIterationCursor(
        marketplace,
        createMessage({
            bounce: BounceMode.RichBounce,
            value: grams("0.28"),
            dest: coordinator,
            body: AllocateTestReserve {
                orderId: 1,
                buyer,
                paymentHash: 12345,
            },
        }),
    );
    expect(cursor.executeN(1)).toHaveSuccessfulTx({ to: coordinator });
    val binding = net.runGetMethod<TestReserveBinding?>(coordinator, "testReserveBinding", [1])!!;
    // Fault injection models a costly failed receiver returning too little.
    val bounced = RichBounceBody {
        originalBody: FundTestReserve { orderId: 1 }.toCell(),
        originalInfo: RichBounceOriginalMsgInfo {
            valueCoins: grams("0.25"),
            valueExtra: [],
            createdLt: 0,
            createdAt: 0,
        }.toCell(),
        bouncedByPhase: 1,
        exitCode: 42,
        computePhase: RichBounceComputePhaseInfo {
            gasUsed: 100,
            vmSteps: 10,
        },
    };
    testing.processSingleTraceStep(
        binding.vault,
        createMessage({
            bounce: false,
            value: grams("0.19"),
            dest: coordinator,
            body: bounced,
        }).bounced(),
    );
    cursor.close();
    val saved = net.runGetMethod<TestReserveBinding?>(coordinator, "testReserveBinding", [1])!!;
    expect(saved.status).toEqual(3);
    expect(saved.returnedNano).toEqual(190000000);
}

get fun `test coordinator rejects bounce with mismatched original funding amount`() {
    val (coordinator, _, marketplace, buyer) = coordinatorSetup();
    val cursor = testing.createTraceIterationCursor(
        marketplace,
        createMessage({
            bounce: BounceMode.RichBounce,
            value: grams("0.28"),
            dest: coordinator,
            body: AllocateTestReserve {
                orderId: 1,
                buyer,
                paymentHash: 12345,
            },
        }),
    );
    expect(cursor.executeN(1)).toHaveSuccessfulTx({ to: coordinator });
    val binding = net.runGetMethod<TestReserveBinding?>(coordinator, "testReserveBinding", [1])!!;
    val forged = RichBounceBody {
        originalBody: FundTestReserve { orderId: 1 }.toCell(),
        originalInfo: RichBounceOriginalMsgInfo {
            valueCoins: grams("0.24"),
            valueExtra: [],
            createdLt: 0,
            createdAt: 0,
        }.toCell(),
        bouncedByPhase: 1,
        exitCode: 42,
        computePhase: RichBounceComputePhaseInfo {
            gasUsed: 100,
            vmSteps: 10,
        },
    };
    testing.processSingleTraceStep(
        binding.vault,
        createMessage({
            bounce: false,
            value: grams("0.24"),
            dest: coordinator,
            body: forged,
        }).bounced(),
    );
    val saved = net.runGetMethod<TestReserveBinding?>(coordinator, "testReserveBinding", [1])!!;
    expect(saved.status).toEqual(1);
    expect(saved.returnedNano).toEqual(0);
    cursor.close();
}

get fun `test coordinator quarantines forged failed-allocation bounce with wrong original amount`() {
    val (coordinator, _, marketplace, buyer) = coordinatorSetup(build("Empty"));
    expect(
        coordinatorSend(marketplace, coordinator, 1, buyer, grams("0.28")),
    ).toHaveSuccessfulTx({ to: coordinator });
    val binding = net.runGetMethod<TestReserveBinding?>(coordinator, "testReserveBinding", [1])!!;
    expect(binding.status).toEqual(4);
    val originalReturned = binding.returnedNano;
    val forged = RichBounceBody {
        originalBody: TestReserveAllocationFailed {
            orderId: 1,
            paymentHash: 12345,
            vault: binding.vault,
        }.toCell(),
        originalInfo: RichBounceOriginalMsgInfo {
            valueCoins: grams("0.19"),
            valueExtra: [],
            createdLt: 0,
            createdAt: 0,
        }.toCell(),
        bouncedByPhase: 1,
        exitCode: 42,
        computePhase: RichBounceComputePhaseInfo {
            gasUsed: 100,
            vmSteps: 10,
        },
    };
    testing.processSingleTraceStep(
        marketplace,
        createMessage({
            bounce: false,
            value: grams("0.19"),
            dest: coordinator,
            body: forged,
        }).bounced(),
    );
    val after = net.runGetMethod<TestReserveBinding?>(coordinator, "testReserveBinding", [1])!!;
    expect(after.status).toEqual(4);
    expect(after.returnedNano).toEqual(originalReturned);
}

get fun `test owner may retry funding confirmation without reallocating reserve`() {
    val (coordinator, owner, marketplace, buyer) = coordinatorSetup();
    expect(
        coordinatorSend(marketplace, coordinator, 1, buyer, grams("0.28")),
    ).toHaveSuccessfulTx({ to: coordinator });
    val first = net.runGetMethod<TestReserveBinding?>(coordinator, "testReserveBinding", [1])!!;
    val request = RetryTestReserveAllocationAck { orderId: 1 }.toCell();
    expect(
        net.send(
            buyer,
            createMessage({
                bounce: false,
                value: grams("0.02"),
                dest: coordinator,
                body: request,
            }),
        ),
    ).toHaveFailedTx({ to: coordinator, exitCode: 721 });
    val retry = net.send(
        owner,
        createMessage({
            bounce: false,
            value: grams("0.02"),
            dest: coordinator,
            body: request,
        }),
    );
    expect(
        retry,
    ).toHaveSuccessfulTx<TestReserveAllocationConfirmed>({ from: coordinator, to: marketplace });
    expect(retry.findTransaction<FundTestReserve>({}) == null).toEqual(true);
    val after = net.runGetMethod<TestReserveBinding?>(coordinator, "testReserveBinding", [1])!!;
    expect(after.vault).toEqual(first.vault);
    expect(after.status).toEqual(2);
}
