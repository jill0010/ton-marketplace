import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

import "@contracts/RejectingNFTItem"
import "@contracts/types"
import "@wrappers/MarketplaceV2.gen"
import "@wrappers/NFTEscrowV2.gen"
import "@wrappers/RejectingNFTItem.gen"

get fun `test Marketplace V2 listing is activated only after the authenticated Escrow deposit callback`() {
    val seller = testing.treasury("marketplaceV2ListingSeller");
    val owner = testing.treasury("marketplaceV2ListingOwner");
    val attacker = testing.treasury("marketplaceV2ListingAttacker");

    val nftItem = RejectingNFTItem.fromStorage({
        owner: seller.address,
        controller: seller.address,
        rejectOwner: attacker.address,
        rejectReturn: false,
    });

    val marketplace = MarketplaceV2.fromStorage(MarketplaceV2Storage {
        owner: owner.address,
        escrow: owner.address,
        escrowConfigured: false,
        nextProductId: 1,
        nextQueryId: 1,
        products: [],
        assetListings: [],
        queryToProduct: [],
    });

    val escrow = NFTEscrowV2.fromStorage(NFTEscrowV2Storage {
        owner: owner.address,
        marketplace: marketplace.address,
        records: [],
        assetToEscrow: [],
        nextEscrowId: 1,
        queryToEscrow: [],
        callbacks: NFTEscrowV2CallbackStorage {
            depositCallbacks: [],
            pendingReleases: [],
            releaseCallbacks: [],
        }.toCell(),
    });

    expect(
        nftItem.deploy(seller.address, { value: grams("0.1") }),
    ).toHaveSuccessfulDeploy({ to: nftItem.address });
    expect(
        marketplace.deploy(owner.address, { value: grams("0.2") }),
    ).toHaveSuccessfulDeploy({ to: marketplace.address });
    expect(
        escrow.deploy(owner.address, { value: grams("0.2") }),
    ).toHaveSuccessfulDeploy({ to: escrow.address });

    // Only the Marketplace owner may bind the isolated V2 Escrow.
    val forgedConfig = marketplace.sendSetMarketplaceV2Escrow(
        attacker.address,
        escrow.address,
        { value: grams("0.02") },
    );
    expect(forgedConfig).toHaveFailedTx({
        from: attacker.address,
        to: marketplace.address,
        exitCode: ErrorsV2.NotOwner,
    });

    val configure = marketplace.sendSetMarketplaceV2Escrow(
        owner.address,
        escrow.address,
        { value: grams("0.02") },
    );
    expect(configure).toHaveSuccessfulTx();
    expect(marketplace.escrowV2()).toEqual(escrow.address);
    expect(marketplace.escrowConfiguredV2()).toEqual(true);

    // Publishing reserves the NFT Item and creates a pending custody record.
    val publish = marketplace.sendPublishProductV2(
        seller.address,
        nftItem.address,
        grams("2"),
        { value: grams("0.2") },
    );
    expect(publish).toHaveSuccessfulTx();

    val pending = marketplace.productV2(1);
    assert (pending != null) throw ErrorsV2.InvalidRelease;
    expect(pending!!.seller).toEqual(seller.address);
    expect(pending.price).toEqual(grams("2"));
    expect(pending.status).toEqual(1);
    expect(pending.queryId).toEqual(1);
    expect(marketplace.assetProductIdV2(nftItem.address)).toEqual(1);

    val custodyPending = escrow.escrowRecordV2(1);
    assert (custodyPending != null) throw ErrorsV2.InvalidRelease;
    expect(custodyPending!!.nftItem).toEqual(nftItem.address);
    expect(custodyPending.seller).toEqual(seller.address);
    expect(custodyPending.status).toEqual(0);

    // A second seller cannot reserve the same NFT Item through Marketplace V2.
    val duplicateListing = marketplace.sendPublishProductV2(
        attacker.address,
        nftItem.address,
        grams("3"),
        { value: grams("0.2") },
    );
    expect(duplicateListing).toHaveFailedTx({
        from: attacker.address,
        to: marketplace.address,
        exitCode: ErrorsV2.AssetAlreadyEscrowed,
    });
    expect(marketplace.productV2(1)!!.status).toEqual(1);

    // The seller proves custody by transferring the NFT Item to the configured Escrow.
    val deposit = nftItem.sendNftTransfer(
        seller.address,
        1,
        escrow.address,
        null,
        null,
        grams("0.01"),
        beginCell().endCell().beginParse(),
        { value: grams("0.1") },
    );
    expect(deposit).toHaveSuccessfulTx();
    expect(nftItem.owner()).toEqual(escrow.address);

    // Marketplace activates only after the Escrow's authenticated callback.
    val active = marketplace.productV2(1);
    assert (active != null) throw ErrorsV2.InvalidReleaseConfirmation;
    expect(active!!.status).toEqual(2);
    expect(active.escrowId).toEqual(1);
    expect(active.nftItem).toEqual(nftItem.address);
    expect(active.seller).toEqual(seller.address);
    expect(marketplace.assetProductIdV2(nftItem.address)).toEqual(1);

    // The exact ACK clears Escrow's durable deposit callback.
    expect(escrow.depositCallbackV2(1) == null).toEqual(true);
    val depositedRecord = escrow.escrowRecordV2(1);
    assert (depositedRecord != null) throw ErrorsV2.InvalidReleaseConfirmation;
    expect(depositedRecord!!.status).toEqual(1);
}
