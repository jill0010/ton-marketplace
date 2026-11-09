import "ReserveVaultV3"
// S04-P001 ONLY. Synthetic Testnet buyer endpoint: initially rejects a
// reserve refund; owner can explicitly arm it to accept ONE subsequent refund.
// Never deploy this test fixture on Mainnet.
struct S04P001RecipientStorage {
    owner: address
    vault: address
    enabled: bool
    received: coins
    acceptedCount: uint32
}
struct (0x50400101) S04P001EnableReceipt {}
type S04P001RecipientMessage = S04P001EnableReceipt | ReserveRefundDispatchedV3

contract S04P001RejectOnceRecipient {
    author: "TON Market"
    version: "0.1.0"
    description: "Testnet-only reject-then-accept reserve refund recipient"
    storage: S04P001RecipientStorage
    incomingMessages: S04P001RecipientMessage
}

fun onInternalMessage(in: InMessage) {
    var storage = S04P001RecipientStorage.fromCell(contract.getData());
    val msg = lazy S04P001RecipientMessage.fromSlice(in.body);
    match (msg) {
        S04P001EnableReceipt => {
            assert (in.senderAddress == storage.owner) throw 811;
            assert (!storage.enabled && storage.acceptedCount == 0) throw 812;
            storage.enabled = true;
            contract.setData(storage.toCell());
        }
        ReserveRefundDispatchedV3 => {
            assert (in.senderAddress == storage.vault) throw 813;
            assert (storage.enabled) throw 814;
            assert (storage.acceptedCount == 0) throw 815;
            assert (msg.amount == grams("0.2")) throw 816;
            assert (in.valueCoins == msg.amount) throw 817;
            assert (msg.orderId > 0 && msg.operationId > 0 && msg.queryId > 0) throw 818;
            storage.received += in.valueCoins;
            storage.acceptedCount += 1;
            contract.setData(storage.toCell());
        }
    }
}

fun onBouncedMessage(_in: InMessageBounced) {}

get fun s04P001RecipientEnabled(): bool {
    return S04P001RecipientStorage.fromCell(contract.getData()).enabled;
}
get fun s04P001RecipientReceived(): coins {
    return S04P001RecipientStorage.fromCell(contract.getData()).received;
}
get fun s04P001RecipientAcceptedCount(): uint32 {
    return S04P001RecipientStorage.fromCell(contract.getData()).acceptedCount;
}
