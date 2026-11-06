// Experimental, owner-attested single-order vault. No deployed V2 integration.
// A review signature is NOT a cryptographic proof of external fees or delivery.
contract TestReserveVault {
    author: "TON Market"
    version: "0.1.0"
    description: "Simulation-only per-order reserve refund prototype"
    storage: TestReserveVaultStorage
    incomingMessages: TestReserveVaultMessage
}

struct TestReserveIdentity {
    fundingSource: address
    buyer: address
    orderId: uint64
    paymentHash: uint256
}

struct TestReserveVaultStorage {
    owner: address
    identity: Cell<TestReserveIdentity>
    funded: bool
    // 0 unfunded; 1 funded; 2 dispatched; 3 owner-confirmed credited;
    // 4 unverified bounce candidate; 5 reviewed zero refund. Costs remain locked.
    status: uint8
    refundAmount: uint32
    reviewedCosts: uint32
    queryId: uint64
    evidenceHash: uint256
    receiptHash: uint256
}

struct (0x72730101) FundTestReserve {
    orderId: uint64
}

struct (0x72730102) ReviewTestReserve {
    orderId: uint64
    evidenceHash: uint256
    attributedCosts: coins
    terminalKind: uint8
}

struct (0x72730103) RetryTestReserve {
    orderId: uint64
    returnEvidenceHash: uint256
}

struct (0x72730104) ConfirmTestReserveReceipt {
    orderId: uint64
    queryId: uint64
    receiptHash: uint256
}

struct (0x72730105) TestReserveBuyerPayment {
    orderId: uint64
    queryId: uint64
    amount: coins
}

struct (0x72730106) TestReserveFunded {
    orderId: uint64
    paymentHash: uint256
}

struct (0x72730107) RetryTestReserveFundingAck {
    orderId: uint64
}

type TestReserveVaultMessage =
    | FundTestReserve
    | ReviewTestReserve
    | RetryTestReserve
    | ConfirmTestReserveReceipt
    | RetryTestReserveFundingAck

fun TestReserveVaultStorage.load(): TestReserveVaultStorage {
    return TestReserveVaultStorage.fromCell(contract.getData());
}

fun TestReserveVaultStorage.save(self) {
    contract.setData(self.toCell());
}

fun sendTestReserveFundingAck(storage: TestReserveVaultStorage) {
    val identity = storage.identity.load();
    assert (storage.funded && storage.status == 1) throw 703;
    assert (contract.getOriginalBalance() >= grams("0.21")) throw 705;
    createMessage({
        bounce: BounceMode.NoBounce,
        value: grams("0.005"),
        dest: identity.fundingSource,
        body: TestReserveFunded {
            orderId: identity.orderId,
            paymentHash: identity.paymentHash,
        },
    }).send(SEND_MODE_PAY_FEES_SEPARATELY);
}

fun dispatchTestReserve(mutate storage: TestReserveVaultStorage) {
    val identity = storage.identity.load();
    assert (storage.refundAmount > 0) throw 704;
    // Operational funding pays dispatch/retry fees; protect reviewed costs.
    assert (
        contract.getOriginalBalance() >=
        storage.refundAmount + storage.reviewedCosts + grams("0.03")
    ) throw 705;
    storage.queryId += 1;
    storage.status = 2;
    storage.save();
    createMessage({
        bounce: BounceMode.RichBounce,
        value: storage.refundAmount as coins,
        dest: identity.buyer,
        body: TestReserveBuyerPayment {
            orderId: identity.orderId,
            queryId: storage.queryId,
            amount: storage.refundAmount as coins,
        },
    }).send(SEND_MODE_PAY_FEES_SEPARATELY);
}

fun onInternalMessage(in: InMessage) {
    if (in.body.isEmpty()) {
        return;
    } // operational donations change no liability.
    val msg = lazy TestReserveVaultMessage.fromSlice(in.body);
    var storage = TestReserveVaultStorage.load();
    val identity = storage.identity.load();
    match (msg) {
        FundTestReserve => {
            assert (in.senderAddress == identity.fundingSource) throw 701;
            assert (msg.orderId == identity.orderId && identity.paymentHash != 0) throw 702;
            assert (!storage.funded && storage.status == 0) throw 703;
            // 0.2 TON reserve plus at least 0.05 TON separate operational funds.
            assert (in.valueCoins >= grams("0.25")) throw 705;
            storage.funded = true;
            storage.status = 1;
            storage.save();
            sendTestReserveFundingAck(storage);
        }
        RetryTestReserveFundingAck => {
            assert (in.senderAddress == storage.owner) throw 701;
            assert (msg.orderId == identity.orderId) throw 702;
            sendTestReserveFundingAck(storage);
        }
        ReviewTestReserve => {
            assert (in.senderAddress == storage.owner) throw 701;
            assert (msg.orderId == identity.orderId) throw 702;
            assert (storage.funded && storage.status == 1) throw 703;
            assert (msg.evidenceHash != 0) throw 702;
            assert (msg.terminalKind == 1 || msg.terminalKind == 2) throw 702;
            assert (msg.attributedCosts <= grams("0.2")) throw 704;
            storage.evidenceHash = msg.evidenceHash;
            storage.reviewedCosts = msg.attributedCosts as uint32;
            storage.refundAmount = (grams("0.2") - msg.attributedCosts) as uint32;
            if (storage.refundAmount == 0) {
                storage.status = 5;
                storage.save();
            } else {
                dispatchTestReserve(mutate storage);
            }
        }
        RetryTestReserve => {
            assert (in.senderAddress == storage.owner) throw 701;
            assert (msg.orderId == identity.orderId) throw 702;
            assert (storage.status == 4) throw 703;
            assert (msg.returnEvidenceHash != 0) throw 702;
            assert (msg.returnEvidenceHash != storage.evidenceHash) throw 702;
            assert (msg.returnEvidenceHash != storage.receiptHash) throw 702;
            assert (msg.returnEvidenceHash != identity.paymentHash) throw 702;
            storage.receiptHash = msg.returnEvidenceHash;
            dispatchTestReserve(mutate storage);
        }
        ConfirmTestReserveReceipt => {
            assert (in.senderAddress == storage.owner) throw 701;
            // A bounced transfer cannot be attested as credited; require
            // a new dispatch and independently verified receiver receipt.
            assert (storage.status == 2) throw 703;
            assert (msg.orderId == identity.orderId && msg.queryId == storage.queryId) throw 702;
            assert (msg.receiptHash != 0) throw 702;
            assert (msg.receiptHash != storage.evidenceHash) throw 702;
            assert (msg.receiptHash != storage.receiptHash) throw 702;
            assert (msg.receiptHash != identity.paymentHash) throw 702;
            storage.status = 3;
            storage.receiptHash = msg.receiptHash;
            storage.save();
        }
    }
}

fun onBouncedMessage(in: InMessageBounced) {
    var storage = TestReserveVaultStorage.load();
    val identity = storage.identity.load();
    if (storage.status != 2 || in.senderAddress != identity.buyer) {
        return;
    }
    if (in.bouncedBody.remainingBitsCount() < 32) {
        return;
    }
    if (in.bouncedBody.preloadUint(32) != 0xfffffffe) {
        return;
    }
    try {
        val rich = lazy RichBounceBody.fromSlice(in.bouncedBody);
        val original = rich.originalBody;
        val payment = TestReserveBuyerPayment.fromCell(original);
        val originalInfo = RichBounceOriginalMsgInfo.fromCell(rich.originalInfo);
        if (
            originalInfo.valueCoins != storage.refundAmount ||
            payment.orderId != identity.orderId ||
            payment.queryId != storage.queryId ||
            payment.amount != storage.refundAmount
        ) {
            return;
        }
        // A bounced message must carry back the principal (minus bounded
        // network fees). A tiny fabricated bounce is not proof of return.
        val bounceFeeAllowance = grams("0.01");
        var minimumReturned = storage.refundAmount;
        if (storage.refundAmount > bounceFeeAllowance) {
            minimumReturned = storage.refundAmount - bounceFeeAllowance;
        }
        if (in.valueCoins < minimumReturned) {
            return;
        }
        storage.status = 4;
        storage.save();
    } catch {}
}

get fun testReserveStatus(): uint8 {
    return TestReserveVaultStorage.load().status;
}

get fun testReserveRefund(): coins {
    return TestReserveVaultStorage.load().refundAmount as coins;
}

get fun testReserveQuery(): uint64 {
    return TestReserveVaultStorage.load().queryId;
}
