import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

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

    expect(res).toHaveSuccessfulTx({
        from: seller.address,
        to: contract.address,
    });

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

    expect(res).toHaveSuccessfulTx({
        from: seller.address,
        to: contract.address,
    });

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

fun setupMockNFTTest(): (MockNFTItem, Treasury, Treasury) {
    val seller = testing.treasury("mockNftSeller");
    val buyer = testing.treasury("mockNftBuyer");

    val contract = MockNFTItem.fromStorage({
        owner: seller.address,
    });

    val res = contract.deploy(
        seller.address,
        { value: grams("0.05") },
    );

    expect(res).toHaveSuccessfulDeploy({
        to: contract.address,
    });

    return (contract, seller, buyer);
}
