import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/types/message"

import "@contracts/MockNFTItem"
import "@contracts/types"
import "@wrappers/MockNFTItem.gen"

get fun `test deploy exposes initial NFT owner`() {
    val (contract, seller, _) = setupMockNFTTest();
    expect(contract.owner()).toEqual(seller.address);
}

get fun `test current owner can transfer NFT with notification`() {
    val (contract, seller, buyer) = setupMockNFTTest();
    val payload = beginCell().storeUint(0x53564950, 32).storeUint(1001, 64).endCell();
    val forwardPayload = beginCell().storeUint(1, 1).storeRef(payload).endCell().beginParse();
    val res = contract.sendNftTransfer(
        seller.address,
        1001,
        buyer.address,
        seller.address,
        null,
        grams("0.01"),
        forwardPayload,
        { value: grams("0.05") },
    );
    expect(res).toHaveSuccessfulTx({ from: seller.address, to: contract.address });
    expect(contract.owner()).toEqual(buyer.address);
}

get fun `test current owner can transfer NFT without notification`() {
    val (contract, seller, buyer) = setupMockNFTTest();
    val emptyPayload = beginCell().endCell().beginParse();
    val res = contract.sendNftTransfer(
        seller.address,
        1002,
        buyer.address,
        seller.address,
        null,
        grams("0"),
        emptyPayload,
        { value: grams("0.05") },
    );
    expect(res).toHaveSuccessfulTx({ from: seller.address, to: contract.address });
    expect(contract.owner()).toEqual(buyer.address);
}

get fun `test non-owner cannot transfer NFT`() {
    val (contract, seller, notOwner) = setupMockNFTTest();
    val emptyPayload = beginCell().endCell().beginParse();
    val res = contract.sendNftTransfer(
        notOwner.address,
        1003,
        notOwner.address,
        notOwner.address,
        null,
        grams("0"),
        emptyPayload,
        { value: grams("0.05") },
    );
    expect(res).toHaveFailedTx({
        from: notOwner.address,
        to: contract.address,
        exitCode: Errors.NotOwner,
    });
    expect(contract.owner()).toEqual(seller.address);
}

get fun `test NFT transfer sends excesses to response destination`() {
    val (contract, seller, buyer) = setupMockNFTTest();
    val emptyPayload = beginCell().endCell().beginParse();
    val queryId = 1004;
    val res = contract.sendNftTransfer(
        seller.address,
        queryId,
        buyer.address,
        seller.address,
        null,
        grams("0"),
        emptyPayload,
        { value: grams("0.05") },
    );

    expect(res).toHaveSuccessfulTx({ from: seller.address, to: contract.address });
    expect(contract.owner()).toEqual(buyer.address);

    val nftTx = res.findTransaction({ to: contract.address });
    expect(nftTx).toBeNotNull();

    val messages = nftTx!!.messages.load();
    val excessLookup = messages.outMsgs.get(0);
    expect(excessLookup.isFound).toEqual(true);

    val excessCell = excessLookup.loadValue();
    val excessMessage = (excessCell as cell as Cell<TlbMessageRelaxed<NftExcesses>>).load();

    expect(excessMessage.info.dest).toEqual(seller.address);

    val excess = excessMessage.loadBody();
    expect(excess.queryId).toEqual(queryId);
}

get fun `test NFT transfer skips excesses for none response destination`() {
    val (contract, seller, buyer) = setupMockNFTTest();
    val emptyPayload = beginCell().endCell().beginParse();

    val res = contract.sendNftTransfer(
        seller.address,
        1005,
        buyer.address,
        null,
        null,
        grams("0"),
        emptyPayload,
        { value: grams("0.05") },
    );

    expect(res).toHaveSuccessfulTx({ from: seller.address, to: contract.address });
    expect(contract.owner()).toEqual(buyer.address);

    val nftTx = res.findTransaction({ to: contract.address });
    expect(nftTx).toBeNotNull();

    val messages = nftTx!!.messages.load();
    val excessLookup = messages.outMsgs.get(0);
    expect(excessLookup.isFound).toEqual(false);
}

get fun `test NFT transfer sends notification and excesses together`() {
    val (contract, seller, buyer) = setupMockNFTTest();

    val payload = beginCell().storeUint(0x53564950, 32).endCell();
    val forwardPayload = beginCell().storeUint(1, 1).storeRef(payload).endCell().beginParse();
    val queryId = 1006;

    val res = contract.sendNftTransfer(
        seller.address,
        queryId,
        buyer.address,
        seller.address,
        null,
        grams("0.01"),
        forwardPayload,
        { value: grams("0.1") },
    );

    expect(res).toHaveSuccessfulTx({ from: seller.address, to: contract.address });
    expect(contract.owner()).toEqual(buyer.address);

    val nftTx = res.findTransaction({ to: contract.address });
    expect(nftTx).toBeNotNull();

    val messages = nftTx!!.messages.load();

    val notificationLookup = messages.outMsgs.get(0);
    expect(notificationLookup.isFound).toEqual(true);

    val notificationCell = notificationLookup.loadValue();
    val notificationMessage = (notificationCell as cell as Cell<TlbMessageRelaxed<NftOwnershipAssigned>>).load();

    expect(notificationMessage.info.dest).toEqual(buyer.address);

    val notification = notificationMessage.loadBody();
    expect(notification.queryId).toEqual(queryId);
    expect(notification.prevOwner).toEqual(seller.address);

    val excessLookup = messages.outMsgs.get(1);
    expect(excessLookup.isFound).toEqual(true);

    val excessCell = excessLookup.loadValue();
    val excessMessage = (excessCell as cell as Cell<TlbMessageRelaxed<NftExcesses>>).load();

    expect(excessMessage.info.dest).toEqual(seller.address);

    val excess = excessMessage.loadBody();
    expect(excess.queryId).toEqual(queryId);
}

get fun `test NFT transfer rejects insufficient balance`() {
    val (contract, seller, buyer) = setupMockNFTTest();

    val payload = beginCell().storeUint(0x53564950, 32).endCell();
    val forwardPayload = beginCell().storeUint(1, 1).storeRef(payload).endCell().beginParse();

    val res = contract.sendNftTransfer(
        seller.address,
        1007,
        buyer.address,
        seller.address,
        null,
        grams("0.01"),
        forwardPayload,
        { value: grams("0.001") },
    );

    expect(res).toHaveFailedTx({
        from: seller.address,
        to: contract.address,
        exitCode: 402,
    });

    expect(contract.owner()).toEqual(seller.address);
}

fun setupMockNFTTest(): (MockNFTItem, Treasury, Treasury) {
    val seller = testing.treasury("mockNftSeller");
    val buyer = testing.treasury("mockNftBuyer");
    val contract = MockNFTItem.fromStorage({ owner: seller.address });
    val res = contract.deploy(seller.address, { value: grams("0.05") });
    expect(res).toHaveSuccessfulDeploy({ to: contract.address });
    return (contract, seller, buyer);
}
