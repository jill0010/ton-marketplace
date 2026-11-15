import "@acton/env"
import "@acton/io"
import "@acton/emulation/network"
import "@acton/emulation/scripts"

import "@contracts/types"
import "@wrappers/NFTEscrowV2.gen"

// S07: isolated production-code NFTEscrowV2 proof deployment.
// TESTNET ONLY. This script does not deploy Marketplace or alter any live binding.
fun main() {
    val deployer = scripts.wallet("deployer");
    val marketplaceAddress = env<address>("S07_TESTNET_MARKETPLACE_ADDRESS");

    if (marketplaceAddress == null) {
        println("S07 aborted: S07_TESTNET_MARKETPLACE_ADDRESS is required");
        return;
    }
    if (deployer.address == marketplaceAddress) {
        println("S07 aborted: marketplace must differ from escrow owner");
        return;
    }

    val escrow = NFTEscrowV2.fromStorage(NFTEscrowV2Storage {
        owner: deployer.address,
        marketplace: marketplaceAddress,
        records: [],
        assetToEscrow: [],
        nextEscrowId: 1,
        queryToEscrow: [],
        callbacks: NFTEscrowV2CallbackStorage {
            depositCallbacks: [],
            releaseStorage: NFTEscrowV2ReleaseCallbackStorage {
                pendingReleases: [],
                releaseCallbacks: [],
                releaseFailureCallbacks: [],
            }.toCell(),
            refundStorage: NFTEscrowV2RefundCallbackStorage {
                pendingRefunds: [],
                refundCallbacks: [],
            }.toCell(),
            collectionStorage: NFTEscrowV2CollectionStorage {
                collections: [],
                collectionItemCodes: [],
            }.toCell(),
        }.toCell(),
    });

    println("S07 production-code NFTEscrowV2 testnet candidate: {}", escrow.address);
    val deployed = escrow.deploy(deployer.address, { value: grams("0.2") });
    if (deployed.waitForFirstTransaction() == null) {
        println("S07 escrow deployment not confirmed");
        return;
    }
    if (escrow.owner() != deployer.address || escrow.marketplace() != marketplaceAddress) {
        println("S07 escrow owner/marketplace binding mismatch");
        return;
    }
    println("S07_TESTNET_PRODUCTION_ESCROW_ADDRESS={}", escrow.address);
    println("S07 deployment and getters succeeded; run read-only code-hash proof separately");
}
