import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

import "@contracts/types"
import "@wrappers/MockNFTItem.gen"
import "@wrappers/NFTEscrow.gen"

get fun `test real Mock NFT transfer deposits NFT into Escrow`() {
    val deployer = testing.treasury("integrationDeployer");
    val marketplace = testing.treasury("integrationMarketplace");
    val seller = testing.treasury("integrationSeller");
    val collection = testing.treasury("integrationCollection");

    // 部署 Escrow
    val escrow = NFTEscrow.fromStorage({
        owner: deployer.address,
        marketplace: marketplace.address,
        paused: false,
        nextEscrowId: 1,
        records: [],
        collections: [],
        queryToEscrow: [],
    });

    val escrowDeploy = escrow.deploy(
        deployer.address,
        { value: grams("0.05") },
    );

    expect(escrowDeploy).toHaveSuccessfulDeploy({
        to: escrow.address,
    });

    // 部署 Mock NFT Item，初始所有者为卖家
    val nftItem = MockNFTItem.fromStorage({
        owner: seller.address,
    });

    val nftDeploy = nftItem.deploy(
        seller.address,
        { value: grams("0.05") },
    );

    expect(nftDeploy).toHaveSuccessfulDeploy({
        to: nftItem.address,
    });

    expect(nftItem.owner()).toEqual(seller.address);

    // 启用 Collection 白名单
    val whitelistRes = escrow.sendSetCollectionStatus(
        deployer.address,
        collection.address,
        1,
        { value: grams("0.05") },
    );

    expect(whitelistRes).toHaveSuccessfulTx<SetCollectionStatus>({
        from: deployer.address,
        to: escrow.address,
    });

    // 创建 Pending 托管记录
    val queryId: uint64 = 3001;

    val extra = CreateEscrowExtra {
        queryId: queryId,
        createdAt: 1782792000,
    };

    val createRes = escrow.sendCreateEscrow(
        marketplace.address,
        nftItem.address,
        collection.address,
        seller.address,
        9001,
        extra,
        { value: grams("0.05") },
    );

    expect(createRes).toHaveSuccessfulTx<CreateEscrow>({
        from: marketplace.address,
        to: escrow.address,
    });

    val pendingRecord = escrow.escrowRecord(1);

    assert (pendingRecord != null) throw Errors.InvalidEscrow;

    expect(pendingRecord!!.status).toEqual(1);

    // 构造 Escrow 识别的转移关联 Payload
    val payloadCell = beginCell().storeUint(0x53564950, 32).storeUint(queryId, 64).endCell();

    val forwardPayload = beginCell().storeUint(1, 1).storeRef(payloadCell).endCell().beginParse();

    // 卖家通过真实 Mock NFT Item 合约转移 NFT
    // newOwner 为 Escrow，forwardAmount 大于零
    val transferRes = nftItem.sendNftTransfer(
        seller.address,
        queryId,
        escrow.address,
        seller.address,
        null,
        grams("0.01"),
        forwardPayload,
        { value: grams("0.05") },
    );

    // 验证卖家向 NFT Item 发起的转移成功
    expect(transferRes).toHaveSuccessfulTx({
        from: seller.address,
        to: nftItem.address,
    });

    // 验证 NFT Item 自动向 Escrow 发送通知
    expect(transferRes).toHaveSuccessfulTx({
        from: nftItem.address,
        to: escrow.address,
    });

    // 验证 NFT 所有权已经转给 Escrow
    expect(nftItem.owner()).toEqual(escrow.address);

    // 验证 Escrow 已经完成入库
    val depositedRecord = escrow.escrowRecord(1);

    assert (depositedRecord != null) throw Errors.InvalidEscrow;

    expect(depositedRecord!!.status).toEqual(2);
    expect(depositedRecord!!.nftItem).toEqual(nftItem.address);
    expect(depositedRecord!!.seller).toEqual(seller.address);

    // 验证 Query ID 与托管记录正确关联
    expect(escrow.escrowIdByQueryId(queryId)).toEqual(1);
}
