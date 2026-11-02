import "types"

contract MockNFTItem {
    author: "Acton User"
    version: "1.0.0"
    description: "Local TEP-62 NFT Item Simulator"
    storage: MockNFTItemStorage
    incomingMessages: MockNFTItemAllowedMessage
}

struct MockNFTItemStorage {
    owner: address
}

fun MockNFTItemStorage.load(): MockNFTItemStorage {
    return MockNFTItemStorage.fromCell(contract.getData());
}

fun MockNFTItemStorage.save(self) {
    contract.setData(self.toCell());
}

type MockNFTItemAllowedMessage = NftTransfer

fun onInternalMessage(in: InMessage) {
    val msg = lazy MockNFTItemAllowedMessage.fromSlice(in.body);

    match (msg) {
        NftTransfer => {
            var storage = lazy MockNFTItemStorage.load();

            assert (in.senderAddress == storage.owner) throw Errors.NotOwner;

            val previousOwner = storage.owner;

            // Match the official TON NFT reference implementation:
            // reserve 0.05 TON for contract storage.
            var restAmount = contract.getOriginalBalance() - grams("0.05");

            // Estimate outgoing forwarding fees using the incoming
            // message's original forwarding fee.
            val fwdFees = in.originalForwardFee * 3 / 2;

            if (msg.forwardAmount > 0) {
                restAmount -= msg.forwardAmount + fwdFees;
            }

            if (msg.responseDestination != null) {
                restAmount -= fwdFees;
            }

            // Official NFT reference error code for insufficient balance.
            assert (restAmount >= 0) throw 402;

            // Send ownership notification when forward amount is non-zero.
            if (msg.forwardAmount > 0) {
                val notification = NftOwnershipAssigned {
                    queryId: msg.queryId,
                    prevOwner: previousOwner,
                    forwardPayload: msg.forwardPayload,
                };

                val outMsg = createMessage({
                    bounce: BounceMode.Only256BitsOfBody,
                    value: msg.forwardAmount,
                    dest: msg.newOwner,
                    body: notification,
                });

                outMsg.send(SEND_MODE_PAY_FEES_SEPARATELY);
            }

            // Return the remaining balance to the response destination.
            // Do not send Excesses when response destination is addr_none.
            if (msg.responseDestination != null) {
                val excesses = NftExcesses {
                    queryId: msg.queryId,
                };

                val excessesMessage = createMessage({
                    bounce: BounceMode.NoBounce,
                    value: restAmount,
                    dest: msg.responseDestination!!,
                    body: excesses,
                });

                excessesMessage.send(SEND_MODE_PAY_FEES_SEPARATELY);
            }

            storage.owner = msg.newOwner;
            storage.save();
        }

        else => {
            assert (in.body.isEmpty()) throw Errors.InvalidMessage;
        }
    }
}

fun onBouncedMessage(_in: InMessageBounced) {}

get fun owner(): address {
    val storage = lazy MockNFTItemStorage.load();
    return storage.owner;
}
