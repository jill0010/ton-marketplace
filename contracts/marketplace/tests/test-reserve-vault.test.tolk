import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@contracts/TestReserveVault"

fun reserveSetup(buyerOverride: address? = null): (address, address, address, address) {
    val owner = testing.treasury("reserveOwner").address;
    val funder = testing.treasury("reserveFunder").address;
    val buyer = buyerOverride ?? testing.treasury("reserveBuyer").address;
    val storage = TestReserveVaultStorage {
        owner,
        identity: TestReserveIdentity {
            fundingSource: funder,
            buyer,
            orderId: 1,
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
