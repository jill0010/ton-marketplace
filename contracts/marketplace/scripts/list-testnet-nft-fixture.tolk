import "@acton/env"
import "@acton/fmt"
import "@acton/io"
import "@acton/emulation/network"
import "@acton/emulation/scripts"
import "@acton/testing/expect"
import "@contracts/types"
import "@wrappers/MarketplaceV2.gen"
import "@wrappers/NFTEscrowV2.gen"

fun listTestFixture(
    marketplace: MarketplaceV2,
    escrow: NFTEscrowV2,
    seller: address,
    nftItem: address,
    collection: address,
    administrator: address,
    itemIndex: uint256,
) {
    assert (collection != seller) throw 409;
    assert (marketplace.ownerV2() == administrator && escrow.owner() == administrator) throw 401;
    assert (marketplace.escrowV2() == escrow.address) throw 401;
    assert (escrow.marketplace() == marketplace.address) throw 401;
    val before = net.runGetMethod<tuple>(nftItem, "get_nft_data");
    assert ((before.get(0) as int) == -1) throw 402;
    assert ((before.get(1) as int) == itemIndex) throw 402;
    assert ((before.get(2) as address) == collection) throw 402;
    assert ((before.get(3) as address) == seller) throw 402;
    // Single-use guard: stop before spending if this asset has a reservation.
    assert (marketplace.assetProductIdV2(nftItem) == null) throw 403;

    val code = parseCellFromHex("b5ee9c720101010100230008420291d9e2ac169fc785ce00de0a81af27622b9b7d1764415c775e7e50c03ce98aa2");
    assert (
        code.hash() == 0x30dcd7d5b6fcf5968c2791e1e31ad732f2672f2986e1d6970eb03cca22d23251
    ) throw 402;
    val paused = escrow.sendSetCollectionStatusV2(
        administrator,
        collection,
        2,
        { value: grams("0.05") },
    );
    assert (paused.waitForFirstTransaction() != null) throw 404;
    val configured = escrow.sendSetCollectionItemCodeV2(
        administrator,
        collection,
        3,
        code,
        { value: grams("0.05") },
    );
    assert (configured.waitForFirstTransaction() != null) throw 404;
    val enabled = escrow.sendSetCollectionStatusV2(
        administrator,
        collection,
        1,
        { value: grams("0.05") },
    );
    assert (enabled.waitForFirstTransaction() != null) throw 404;

    val productId = marketplace.nextProductIdV2();
    val queryId = marketplace.nextQueryIdV2();
    val published = marketplace.sendPublishProductV2(
        seller,
        productId,
        queryId,
        nftItem,
        collection,
        itemIndex,
        3,
        grams("0.01"),
        { value: grams("0.2") },
    );
    assert (published.waitForFirstTransaction() != null) throw 404;
    // Prove the reservation exists before giving up NFT ownership.
    assert (marketplace.productStatusV2(productId)!! == 1) throw 405;
    val escrowId = escrow.escrowIdForQueryV2(queryId);
    assert (escrowId > 0) throw 405;
    val payload = beginCell()
        .storeUint(1, 1)
        .storeRef(beginCell().storeUint(0x53564950, 32).storeUint(queryId, 64).endCell())
        .endCell();
    val transfer = createMessage({
        bounce: true,
        value: grams("0.2"),
        dest: nftItem,
        body: NftTransfer {
            queryId,
            newOwner: escrow.address,
            responseDestination: seller,
            customPayload: null,
            forwardAmount: grams("0.05"),
            forwardPayload: payload.beginParse(),
        },
    });
    val deposited = net.send(seller, transfer);
    assert (deposited.waitForFirstTransaction() != null) throw 404;
    if (env<bool>("FIXTURE_EMULATION") ?? false) {
        expect(deposited).toHaveSuccessfulTx({ from: seller, to: nftItem });
    }
    val after = net.runGetMethod<tuple>(nftItem, "get_nft_data");
    println("Observed NFT owner: {}", after.get(3) as address);
    println("Expected escrow: {}", escrow.address);
    println("Observed product status: {}", marketplace.productStatusV2(productId)!!);
    assert ((after.get(3) as address) == escrow.address) throw 406;
    assert (marketplace.productStatusV2(productId)!! == 2) throw 407;
    assert (marketplace.productEscrowIdV2(productId)!! == escrowId) throw 408;
    println("Test listing active; product ID: {}", productId);
    println("Test listing escrow ID: {}", escrowId);
    println("NFT custody verified: {}", nftItem);
    println("Test price: 0.01 TON. No purchase or reserve refund performed.");
}

fun runTestnetFixtureListing() {
    assert (env<bool>("TESTNET_LISTING_ENABLED") ?? false) throw 401;
    val seller = scripts.wallet("seller");
    val administrator = scripts.wallet("deployer");
    assert (
        seller.address == parseAddress("kQASRB4XGtN81Pwaef6fWnSJyRwwJEvbbPn-ksz0KQI-bAtx")
    ) throw 401;
    assert (
        administrator.address == parseAddress("kQDQEewIr69mGcq6uDIlAtibxW37gm7rJfKWru7o4_hSPeEr")
    ) throw 401;
    val marketplace = MarketplaceV2 {
        address: parseAddress("kQCvvuBddeebgdI08jUkTGzfulLRg2B8hqXWZrlHigKUsdNZ"),
    };
    val escrow = NFTEscrowV2 {
        address: parseAddress("kQD0jzR2NK-s4rbvczeHdmYJedfsRge9PsdWbT52NGsEdTB4"),
    };
    listTestFixture(
        marketplace,
        escrow,
        seller.address,
        parseAddress("kQCq13VYJqQ0Oov-a2-MKE57MWIuEtiQaoF_lYNCAEnAofhm"),
        administrator.address,
        administrator.address,
        1,
    );
}
