import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@contracts/TestReserveVault"

fun reserveSetup(buyerOverride: address? = null, orderId: uint64 = 1): (
    address,
    address,
    address,
    address,
) {
    val owner = testing.treasury("reserveOwner").address;
    val funder = testing.treasury("reserveFunder").address;
    val buyer = buyerOverride ?? testing.treasury("reserveBuyer").address;
    val storage = TestReserveVaultStorage {
        owner,
        identity: TestReserveIdentity {
            fundingSource: funder,
            buyer,
            orderId,
            paymentHash: 123,
        }.toCell(),
        funded: false,
        status: 0,
        refundAmount: 0,
        reviewedCosts: 0,
        queryId: 0,
        evidenceHash: 0,
        receiptHash: 0,
    };
    val state: ContractState = { code: build("TestReserveVault"), data: storage.toCell() };
    val destination = AutoDeployAddress {
        workchain: 0,
        stateInit: state,
    };
    val vault = destination.calculateAddress();
    expect(
        net.send(owner, createMessage({ bounce: false, value: grams("0.1"), dest: destination })),
    ).toHaveSuccessfulDeploy({ to: vault });
    return (vault, owner, funder, buyer);
}

fun reserveSend(from: address, to: address, body: cell, value: coins): SendResultList {
    return net.send(from, createMessage({ bounce: BounceMode.RichBounce, value, dest: to, body }));
}

get fun `test experimental vault enforces funding source amount and one-time funding`() {
    val (vault, owner, funder, _) = reserveSetup();
    val body = FundTestReserve { orderId: 1 }.toCell();
    expect(
        reserveSend(owner, vault, body, grams("0.3")),
    ).toHaveFailedTx({ to: vault, exitCode: 701 });
    expect(
        reserveSend(funder, vault, body, grams("0.2")),
    ).toHaveFailedTx({ to: vault, exitCode: 705 });
    expect(reserveSend(funder, vault, body, grams("0.3"))).toHaveSuccessfulTx({ to: vault });
    expect(
        reserveSend(funder, vault, body, grams("0.3")),
    ).toHaveFailedTx({ to: vault, exitCode: 703 });
}

get fun `test experimental vault binds review to owner order evidence and costs`() {
    val (vault, owner, funder, buyer) = reserveSetup();
    expect(
        reserveSend(funder, vault, FundTestReserve { orderId: 1 }.toCell(), grams("0.3")),
    ).toHaveSuccessfulTx({ to: vault });
    val review = ReviewTestReserve {
        orderId: 1,
        evidenceHash: 456,
        attributedCosts: grams("0.006"),
        terminalKind: 1,
    };
    expect(
        reserveSend(buyer, vault, review.toCell(), grams("0.05")),
    ).toHaveFailedTx({ to: vault, exitCode: 701 });
    expect(
        reserveSend(
            owner,
            vault,
            ReviewTestReserve {
                orderId: 2,
                evidenceHash: 456,
                attributedCosts: grams("0.006"),
                terminalKind: 1,
            }.toCell(),
            grams("0.05"),
        ),
    ).toHaveFailedTx({ to: vault, exitCode: 702 });
    expect(
        reserveSend(
            owner,
            vault,
            ReviewTestReserve {
                orderId: 1,
                evidenceHash: 0,
                attributedCosts: grams("0.006"),
                terminalKind: 1,
            }.toCell(),
            grams("0.05"),
        ),
    ).toHaveFailedTx({ to: vault, exitCode: 702 });
    expect(
        reserveSend(
            owner,
            vault,
            ReviewTestReserve {
                orderId: 1,
                evidenceHash: 456,
                attributedCosts: grams("0.21"),
                terminalKind: 1,
            }.toCell(),
            grams("0.05"),
        ),
    ).toHaveFailedTx({ to: vault, exitCode: 704 });
    val result = reserveSend(owner, vault, review.toCell(), grams("0.05"));
    expect(result).toHaveSuccessfulTx({ to: vault });
    expect(result).toHaveSuccessfulTx({ from: vault, to: buyer });
    expect(net.runGetMethod<uint8>(vault, "testReserveStatus")).toEqual(2);
    expect(net.runGetMethod<coins>(vault, "testReserveRefund")).toEqual(grams("0.194"));
    expect(
        reserveSend(owner, vault, review.toCell(), grams("0.05")),
    ).toHaveFailedTx({ to: vault, exitCode: 703 });
    expect(
        reserveSend(
            owner,
            vault,
            RetryTestReserve {
                orderId: 1,
                returnEvidenceHash: 1234,
            }.toCell(),
            grams("0.05"),
        ),
    ).toHaveFailedTx({ to: vault, exitCode: 703 });
    expect(
        reserveSend(
            owner,
            vault,
            ConfirmTestReserveReceipt {
                orderId: 1,
                queryId: 2,
                receiptHash: 789,
            }.toCell(),
            grams("0.05"),
        ),
    ).toHaveFailedTx({ to: vault, exitCode: 702 });
    val confirm = ConfirmTestReserveReceipt {
        orderId: 1,
        queryId: 1,
        receiptHash: 789,
    }.toCell();
    expect(reserveSend(owner, vault, confirm, grams("0.05"))).toHaveSuccessfulTx({ to: vault });
    expect(net.runGetMethod<uint8>(vault, "testReserveStatus")).toEqual(3);
    expect(
        reserveSend(owner, vault, confirm, grams("0.05")),
    ).toHaveFailedTx({ to: vault, exitCode: 703 });
}

get fun `test experimental vault records zero residual without refund transfer`() {
    val (vault, owner, funder, _) = reserveSetup();
    expect(
        reserveSend(funder, vault, FundTestReserve { orderId: 1 }.toCell(), grams("0.3")),
    ).toHaveSuccessfulTx({ to: vault });
    expect(
        reserveSend(
            owner,
            vault,
            ReviewTestReserve {
                orderId: 1,
                evidenceHash: 456,
                attributedCosts: grams("0.2"),
                terminalKind: 2,
            }.toCell(),
            grams("0.05"),
        ),
    ).toHaveSuccessfulTx({ to: vault });
    expect(net.runGetMethod<uint8>(vault, "testReserveStatus")).toEqual(5);
    expect(net.runGetMethod<coins>(vault, "testReserveRefund")).toEqual(0);
}

get fun `test experimental vault genuine bounced refund enables only exact retry`() {
    val owner = testing.treasury("reserveOwner").address;
    val rejectState: ContractState = {
        code: build("Empty"),
        data: beginCell().storeAddress(owner).endCell(),
    };
    val rejectDest = AutoDeployAddress {
        workchain: 0,
        stateInit: rejectState,
    };
    val rejector = rejectDest.calculateAddress();
    expect(
        net.send(owner, createMessage({ bounce: false, value: grams("0.1"), dest: rejectDest })),
    ).toHaveSuccessfulDeploy({ to: rejector });
    val (vault, _, funder, _) = reserveSetup(rejector);
    expect(
        reserveSend(funder, vault, FundTestReserve { orderId: 1 }.toCell(), grams("0.3")),
    ).toHaveSuccessfulTx({ to: vault });
    val reviewed = reserveSend(
        owner,
        vault,
        ReviewTestReserve {
            orderId: 1,
            evidenceHash: 456,
            attributedCosts: grams("0.006"),
            terminalKind: 1,
        }.toCell(),
        grams("0.05"),
    );
    expect(reviewed).toHaveFailedTx({ from: vault, to: rejector, exitCode: 65535 });
    expect(net.runGetMethod<uint8>(vault, "testReserveStatus")).toEqual(4);
    expect(net.runGetMethod<uint64>(vault, "testReserveQuery")).toEqual(1);
    expect(
        reserveSend(
            funder,
            vault,
            RetryTestReserve {
                orderId: 1,
                returnEvidenceHash: 1234,
            }.toCell(),
            grams("0.05"),
        ),
    ).toHaveFailedTx({ to: vault, exitCode: 701 });
    expect(
        reserveSend(
            owner,
            vault,
            RetryTestReserve {
                orderId: 2,
                returnEvidenceHash: 1234,
            }.toCell(),
            grams("0.05"),
        ),
    ).toHaveFailedTx({ to: vault, exitCode: 702 });
    val retried = reserveSend(
        owner,
        vault,
        RetryTestReserve {
            orderId: 1,
            returnEvidenceHash: 1234,
        }.toCell(),
        grams("0.05"),
    );
    expect(retried).toHaveFailedTx({ from: vault, to: rejector, exitCode: 65535 });
    expect(net.runGetMethod<uint8>(vault, "testReserveStatus")).toEqual(4);
    expect(net.runGetMethod<uint64>(vault, "testReserveQuery")).toEqual(2);
    expect(net.runGetMethod<coins>(vault, "testReserveRefund")).toEqual(grams("0.194"));
}

fun reserveRichBounce(orderId: uint64, queryId: uint64, amount: coins): cell {
    return RichBounceBody {
        originalBody: TestReserveBuyerPayment { orderId, queryId, amount }.toCell(),
        originalInfo: RichBounceOriginalMsgInfo {
            valueCoins: amount,
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
    }.toCell();
}

fun reserveInFlight(): (address, address, address, address) {
    val (vault, owner, funder, buyer) = reserveSetup();
    expect(
        reserveSend(funder, vault, FundTestReserve { orderId: 1 }.toCell(), grams("0.3")),
    ).toHaveSuccessfulTx({ to: vault });
    expect(
        reserveSend(
            owner,
            vault,
            ReviewTestReserve {
                orderId: 1,
                evidenceHash: 456,
                attributedCosts: grams("0.006"),
                terminalKind: 1,
            }.toCell(),
            grams("0.05"),
        ),
    ).toHaveSuccessfulTx({ to: buyer });
    return (vault, owner, funder, buyer);
}

get fun `test vault ignores forged stale malformed and wrong-amount bounced messages`() {
    val (vault, owner, _, buyer) = reserveInFlight();
    testing.processSingleTraceStep(
        owner,
        createMessage({
            bounce: false,
            value: grams("0.01"),
            dest: vault,
            body: reserveRichBounce(1, 1, grams("0.194")),
        }).bounced(),
    );
    expect(net.runGetMethod<uint8>(vault, "testReserveStatus")).toEqual(2);
    testing.processSingleTraceStep(
        buyer,
        createMessage({
            bounce: false,
            value: grams("0.01"),
            dest: vault,
            body: reserveRichBounce(2, 1, grams("0.194")),
        }).bounced(),
    );
    testing.processSingleTraceStep(
        buyer,
        createMessage({
            bounce: false,
            value: grams("0.01"),
            dest: vault,
            body: reserveRichBounce(1, 2, grams("0.194")),
        }).bounced(),
    );
    testing.processSingleTraceStep(
        buyer,
        createMessage({
            bounce: false,
            value: grams("0.01"),
            dest: vault,
            body: reserveRichBounce(1, 1, grams("0.193")),
        }).bounced(),
    );
    testing.processSingleTraceStep(
        buyer,
        createMessage({
            bounce: false,
            value: grams("0.01"),
            dest: vault,
            body: beginCell().storeUint(0xfffffffe, 32).endCell(),
        }).bounced(),
    );
    expect(net.runGetMethod<uint8>(vault, "testReserveStatus")).toEqual(2);
    expect(net.runGetMethod<uint64>(vault, "testReserveQuery")).toEqual(1);
}

get fun `test confirmed refund ignores even matching late bounced messages`() {
    val (vault, owner, _, buyer) = reserveInFlight();
    expect(
        reserveSend(
            owner,
            vault,
            ConfirmTestReserveReceipt {
                orderId: 1,
                queryId: 1,
                receiptHash: 789,
            }.toCell(),
            grams("0.05"),
        ),
    ).toHaveSuccessfulTx({ to: vault });
    testing.processSingleTraceStep(
        buyer,
        createMessage({
            bounce: false,
            value: grams("0.01"),
            dest: vault,
            body: reserveRichBounce(1, 1, grams("0.194")),
        }).bounced(),
    );
    expect(net.runGetMethod<uint8>(vault, "testReserveStatus")).toEqual(3);
    expect(
        reserveSend(
            owner,
            vault,
            RetryTestReserve {
                orderId: 1,
                returnEvidenceHash: 1234,
            }.toCell(),
            grams("0.05"),
        ),
    ).toHaveFailedTx({ to: vault, exitCode: 703 });
}

get fun `test underfunded retry preserves liability and succeeds after operational topup`() {
    val owner = testing.treasury("reserveOwner").address;
    val buyer = testing.treasury("reserveBuyer").address;
    val funder = testing.treasury("reserveFunder").address;
    // Synthetic depleted state represents storage/operational losses; no live funds.
    val state: ContractState = {
        code: build("TestReserveVault"),
        data: TestReserveVaultStorage {
            owner,
            identity: TestReserveIdentity {
                fundingSource: funder,
                buyer,
                orderId: 1,
                paymentHash: 123,
            }.toCell(),
            funded: true,
            status: 4,
            refundAmount: 194000000,
            reviewedCosts: 6000000,
            queryId: 1,
            evidenceHash: 456,
            receiptHash: 0,
        }.toCell(),
    };
    val destination = AutoDeployAddress {
        workchain: 0,
        stateInit: state,
    };
    val vault = destination.calculateAddress();
    expect(
        net.send(
            owner,
            createMessage({
                bounce: false,
                value: grams("0.01"),
                dest: destination,
            }),
        ),
    ).toHaveSuccessfulDeploy({ to: vault });
    val retry = RetryTestReserve {
        orderId: 1,
        returnEvidenceHash: 1234,
    }.toCell();
    expect(
        reserveSend(owner, vault, retry, grams("0.001")),
    ).toHaveFailedTx({ to: vault, exitCode: 705 });
    expect(net.runGetMethod<uint8>(vault, "testReserveStatus")).toEqual(4);
    expect(net.runGetMethod<uint64>(vault, "testReserveQuery")).toEqual(1);
    expect(net.runGetMethod<coins>(vault, "testReserveRefund")).toEqual(grams("0.194"));
    expect(
        net.send(
            owner,
            createMessage({
                bounce: false,
                value: grams("0.3"),
                dest: vault,
            }),
        ),
    ).toHaveSuccessfulTx({ to: vault });
    expect(
        reserveSend(owner, vault, retry, grams("0.01")),
    ).toHaveSuccessfulTx({ from: vault, to: buyer });
    expect(net.runGetMethod<uint64>(vault, "testReserveQuery")).toEqual(2);
    expect(net.runGetMethod<coins>(vault, "testReserveRefund")).toEqual(grams("0.194"));
}

get fun `test two per-order vault liabilities remain isolated`() {
    val (first, owner, funder, _) = reserveSetup();
    val (second, _, _, _) = reserveSetup(null, 2);
    expect(first == second).toEqual(false);
    expect(
        reserveSend(funder, first, FundTestReserve { orderId: 1 }.toCell(), grams("0.3")),
    ).toHaveSuccessfulTx({ to: first });
    expect(
        reserveSend(funder, second, FundTestReserve { orderId: 2 }.toCell(), grams("0.3")),
    ).toHaveSuccessfulTx({ to: second });
    expect(
        reserveSend(
            owner,
            second,
            ReviewTestReserve {
                orderId: 1,
                evidenceHash: 456,
                attributedCosts: grams("0.006"),
                terminalKind: 1,
            }.toCell(),
            grams("0.05"),
        ),
    ).toHaveFailedTx({ to: second, exitCode: 702 });
    expect(
        reserveSend(
            owner,
            first,
            ReviewTestReserve {
                orderId: 1,
                evidenceHash: 456,
                attributedCosts: grams("0.006"),
                terminalKind: 1,
            }.toCell(),
            grams("0.05"),
        ),
    ).toHaveSuccessfulTx({ to: first });
    expect(net.runGetMethod<uint8>(first, "testReserveStatus")).toEqual(2);
    expect(net.runGetMethod<uint8>(second, "testReserveStatus")).toEqual(1);
    expect(net.runGetMethod<uint64>(second, "testReserveQuery")).toEqual(0);
}

get fun `test buyer-controlled bounce candidate quarantines receipt pending reconciliation`() {
    val (vault, owner, _, buyer) = reserveInFlight();
    // Fault injection: an exact-looking bounce is not evidence funds returned.
    testing.processSingleTraceStep(
        buyer,
        createMessage({
            bounce: false,
            value: grams("0.001"),
            dest: vault,
            body: reserveRichBounce(1, 1, grams("0.194")),
        }).bounced(),
    );
    expect(net.runGetMethod<uint8>(vault, "testReserveStatus")).toEqual(2);
    expect(
        reserveSend(
            buyer,
            vault,
            RetryTestReserve {
                orderId: 1,
                returnEvidenceHash: 1234,
            }.toCell(),
            grams("0.05"),
        ),
    ).toHaveFailedTx({ to: vault, exitCode: 701 });
    expect(net.runGetMethod<uint64>(vault, "testReserveQuery")).toEqual(1);
    // The forged tiny-value bounce did not return the refund principal.
    // The real in-flight transfer may still be independently confirmed.
    expect(
        reserveSend(
            owner,
            vault,
            ConfirmTestReserveReceipt {
                orderId: 1,
                queryId: 1,
                receiptHash: 789,
            }.toCell(),
            grams("0.05"),
        ),
    ).toHaveSuccessfulTx({ to: vault });
    expect(net.runGetMethod<uint8>(vault, "testReserveStatus")).toEqual(3);
    expect(
        reserveSend(
            owner,
            vault,
            RetryTestReserve {
                orderId: 1,
                returnEvidenceHash: 1234,
            }.toCell(),
            grams("0.05"),
        ),
    ).toHaveFailedTx({ to: vault, exitCode: 703 });
}

get fun `test sub 0.01 reserve refund ignores tiny forged bounce without arithmetic underflow`() {
    val (vault, owner, funder, buyer) = reserveSetup();
    expect(
        reserveSend(funder, vault, FundTestReserve { orderId: 1 }.toCell(), grams("0.3")),
    ).toHaveSuccessfulTx({ to: vault });
    expect(
        reserveSend(
            owner,
            vault,
            ReviewTestReserve {
                orderId: 1,
                evidenceHash: 456,
                attributedCosts: grams("0.195"),
                terminalKind: 1,
            }.toCell(),
            grams("0.05"),
        ),
    ).toHaveSuccessfulTx({ to: buyer });
    expect(net.runGetMethod<coins>(vault, "testReserveRefund")).toEqual(grams("0.005"));
    expect(net.runGetMethod<uint8>(vault, "testReserveStatus")).toEqual(2);
    testing.processSingleTraceStep(
        buyer,
        createMessage({
            bounce: false,
            value: grams("0.001"),
            dest: vault,
            body: reserveRichBounce(1, 1, grams("0.005")),
        }).bounced(),
    );
    expect(net.runGetMethod<uint8>(vault, "testReserveStatus")).toEqual(2);
    expect(net.runGetMethod<uint64>(vault, "testReserveQuery")).toEqual(1);
    // A rejected forged bounce must not block legitimate receipt reconciliation.
    expect(
        reserveSend(
            owner,
            vault,
            ConfirmTestReserveReceipt {
                orderId: 1,
                queryId: 1,
                receiptHash: 789,
            }.toCell(),
            grams("0.05"),
        ),
    ).toHaveSuccessfulTx({ to: vault });
    expect(net.runGetMethod<uint8>(vault, "testReserveStatus")).toEqual(3);
    expect(
        reserveSend(
            owner,
            vault,
            RetryTestReserve {
                orderId: 1,
                returnEvidenceHash: 1234,
            }.toCell(),
            grams("0.05"),
        ),
    ).toHaveFailedTx({ to: vault, exitCode: 703 });
}

get fun `test adequately funded fabricated bounce remains unverified and never auto retries`() {
    val (vault, owner, _, buyer) = reserveInFlight();
    // Adversarial fault injection: buyer can fund a matching synthetic bounce.
    // Status 4 is a quarantine candidate, NOT verified returned principal.
    testing.processSingleTraceStep(
        buyer,
        createMessage({
            bounce: false,
            value: grams("0.194"),
            dest: vault,
            body: reserveRichBounce(1, 1, grams("0.194")),
        }).bounced(),
    );
    expect(net.runGetMethod<uint8>(vault, "testReserveStatus")).toEqual(4);
    expect(net.runGetMethod<uint64>(vault, "testReserveQuery")).toEqual(1);
    expect(
        reserveSend(
            buyer,
            vault,
            RetryTestReserve {
                orderId: 1,
                returnEvidenceHash: 1234,
            }.toCell(),
            grams("0.05"),
        ),
    ).toHaveFailedTx({ to: vault, exitCode: 701 });
    expect(
        reserveSend(
            owner,
            vault,
            ConfirmTestReserveReceipt {
                orderId: 1,
                queryId: 1,
                receiptHash: 789,
            }.toCell(),
            grams("0.05"),
        ),
    ).toHaveFailedTx({ to: vault, exitCode: 703 });
    expect(net.runGetMethod<uint64>(vault, "testReserveQuery")).toEqual(1);
}

get fun `test stale bounce after retry cannot change new refund operation`() {
    val owner = testing.treasury("reserveOwner").address;
    val rejectState: ContractState = {
        code: build("Empty"),
        data: beginCell().storeAddress(owner).endCell(),
    };
    val rejectDest = AutoDeployAddress {
        workchain: 0,
        stateInit: rejectState,
    };
    val rejector = rejectDest.calculateAddress();
    expect(
        net.send(owner, createMessage({ bounce: false, value: grams("0.1"), dest: rejectDest })),
    ).toHaveSuccessfulDeploy({ to: rejector });
    val (vault, _, funder, _) = reserveSetup(rejector);
    expect(
        reserveSend(funder, vault, FundTestReserve { orderId: 1 }.toCell(), grams("0.3")),
    ).toHaveSuccessfulTx({ to: vault });
    expect(
        reserveSend(
            owner,
            vault,
            ReviewTestReserve {
                orderId: 1,
                evidenceHash: 456,
                attributedCosts: grams("0.006"),
                terminalKind: 1,
            }.toCell(),
            grams("0.05"),
        ),
    ).toHaveFailedTx({ from: vault, to: rejector, exitCode: 65535 });
    expect(net.runGetMethod<uint8>(vault, "testReserveStatus")).toEqual(4);
    expect(
        reserveSend(
            owner,
            vault,
            RetryTestReserve {
                orderId: 1,
                returnEvidenceHash: 1234,
            }.toCell(),
            grams("0.05"),
        ),
    ).toHaveFailedTx({ from: vault, to: rejector, exitCode: 65535 });
    expect(net.runGetMethod<uint64>(vault, "testReserveQuery")).toEqual(2);
    expect(net.runGetMethod<uint8>(vault, "testReserveStatus")).toEqual(4);
    testing.processSingleTraceStep(
        rejector,
        createMessage({
            bounce: false,
            value: grams("0.194"),
            dest: vault,
            body: reserveRichBounce(1, 1, grams("0.194")),
        }).bounced(),
    );
    expect(net.runGetMethod<uint64>(vault, "testReserveQuery")).toEqual(2);
    expect(net.runGetMethod<uint8>(vault, "testReserveStatus")).toEqual(4);
    expect(
        reserveSend(
            owner,
            vault,
            ConfirmTestReserveReceipt {
                orderId: 1,
                queryId: 1,
                receiptHash: 789,
            }.toCell(),
            grams("0.05"),
        ),
    ).toHaveFailedTx({ to: vault, exitCode: 703 });
}
