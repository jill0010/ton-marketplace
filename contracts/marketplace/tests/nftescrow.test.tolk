import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

import "@contracts/types"
import "@wrappers/NFTEscrow.gen"

// 测试1：部署后正确读取初始管理员
get fun `test deploy exposes initial owner`() {
    val (contract, deployer, _, _) = setupEscrowTest();
    expect(contract.owner()).toEqual(deployer.address);
}

// 测试2：正确读取 Marketplace 地址
get fun `test exposes marketplace address`() {
    val (contract, _, _, marketplace) = setupEscrowTest();
    expect(contract.marketplace()).toEqual(marketplace.address);
}

// 测试3：管理员可以转移所有权
get fun `test owner can transfer ownership`() {
    val (contract, deployer, notDeployer, _) = setupEscrowTest();

    val res = contract.sendChangeOwner(
        deployer.address,
        notDeployer.address,
        { value: grams("0.05") },
    );

    expect(res).toHaveSuccessfulTx<ChangeOwner>({
        from: deployer.address,
        to: contract.address,
    });

    expect(contract.owner()).toEqual(notDeployer.address);
}

// 测试4：非管理员不能转移所有权
get fun `test non-owner cannot transfer ownership`() {
    val (contract, deployer, notDeployer, _) = setupEscrowTest();

    val res = contract.sendChangeOwner(
        notDeployer.address,
        notDeployer.address,
        { value: grams("0.05") },
    );

    expect(res).toHaveFailedTx({
        from: notDeployer.address,
        to: contract.address,
        exitCode: Errors.NotOwner,
    });

    expect(contract.owner()).toEqual(deployer.address);
}

// 测试5：NFT 托管记录序列化
get fun `test escrow record serialization`() {
    val seller = testing.treasury("escrowSeller");
    val nftItem = testing.treasury("nftItem");
    val collection = testing.treasury("nftCollection");

    val recordExtra = EscrowRecordExtra {
        queryId: 1001,
        createdAt: 1782792000,
    };

    val record = EscrowRecord {
        escrowId: 1,
        nftItem: nftItem.address,
        collection: collection.address,
        seller: seller.address,
        productId: 100,
        status: 1,
        extra: recordExtra.toCell(),
    };

    val decoded = EscrowRecord.fromCell(record.toCell());
    val decodedExtra = decoded.extra.load();

    expect(decoded.escrowId).toEqual(1);
    expect(decodedExtra.queryId).toEqual(1001);
    expect(decoded.nftItem).toEqual(nftItem.address);
    expect(decoded.collection).toEqual(collection.address);
    expect(decoded.seller).toEqual(seller.address);
    expect(decoded.productId).toEqual(100);
    expect(decoded.status).toEqual(1);
    expect(decodedExtra.createdAt).toEqual(1782792000);
}

// 测试6：管理员可以批准 Collection
get fun `test owner can activate collection`() {
    val (contract, deployer, _, _) = setupEscrowTest();

    val collection = testing.treasury("approvedCollection");

    val res = contract.sendSetCollectionStatus(
        deployer.address,
        collection.address,
        1,
        { value: grams("0.05") },
    );

    expect(res).toHaveSuccessfulTx<SetCollectionStatus>({
        from: deployer.address,
        to: contract.address,
    });

    expect(contract.collectionStatus(collection.address)).toEqual(1);
}

// 测试7：管理员可以暂停 Collection
get fun `test owner can pause collection`() {
    val (contract, deployer, _, _) = setupEscrowTest();

    val collection = testing.treasury("pausedCollection");

    contract.sendSetCollectionStatus(
        deployer.address,
        collection.address,
        1,
        { value: grams("0.05") },
    );

    val res = contract.sendSetCollectionStatus(
        deployer.address,
        collection.address,
        2,
        { value: grams("0.05") },
    );

    expect(res).toHaveSuccessfulTx<SetCollectionStatus>({
        from: deployer.address,
        to: contract.address,
    });

    expect(contract.collectionStatus(collection.address)).toEqual(2);
}

// 测试8：管理员可以撤销 Collection
get fun `test owner can revoke collection`() {
    val (contract, deployer, _, _) = setupEscrowTest();

    val collection = testing.treasury("revokedCollection");

    contract.sendSetCollectionStatus(
        deployer.address,
        collection.address,
        1,
        { value: grams("0.05") },
    );

    val res = contract.sendSetCollectionStatus(
        deployer.address,
        collection.address,
        3,
        { value: grams("0.05") },
    );

    expect(res).toHaveSuccessfulTx<SetCollectionStatus>({
        from: deployer.address,
        to: contract.address,
    });

    expect(contract.collectionStatus(collection.address)).toEqual(3);
}

// 测试9：非管理员不能修改 Collection 白名单
get fun `test non-owner cannot change collection status`() {
    val (contract, _, notDeployer, _) = setupEscrowTest();

    val collection = testing.treasury("unauthorizedCollection");

    val res = contract.sendSetCollectionStatus(
        notDeployer.address,
        collection.address,
        1,
        { value: grams("0.05") },
    );

    expect(res).toHaveFailedTx({
        from: notDeployer.address,
        to: contract.address,
        exitCode: Errors.NotOwner,
    });

    expect(contract.collectionStatus(collection.address)).toEqual(0);
}

// 测试10：无效状态不能写入白名单
get fun `test invalid collection status is rejected`() {
    val (contract, deployer, _, _) = setupEscrowTest();

    val collection = testing.treasury("invalidStatusCollection");

    val res = contract.sendSetCollectionStatus(
        deployer.address,
        collection.address,
        4,
        { value: grams("0.05") },
    );

    expect(res).toHaveFailedTx({
        from: deployer.address,
        to: contract.address,
        exitCode: Errors.InvalidCollectionStatus,
    });

    expect(contract.collectionStatus(collection.address)).toEqual(0);
}

// 测试11：未批准的 Collection 不能创建托管
get fun `test unapproved collection cannot create escrow`() {
    val (contract, _, _, marketplace) = setupEscrowTest();

    val seller = testing.treasury("unapprovedSeller");
    val nftItem = testing.treasury("unapprovedNft");
    val collection = testing.treasury("unapprovedCollection");

    val extra = CreateEscrowExtra {
        queryId: 1001,
        createdAt: 1782792000,
    };

    val res = contract.sendCreateEscrow(
        marketplace.address,
        nftItem.address,
        collection.address,
        seller.address,
        100,
        extra,
        { value: grams("0.05") },
    );

    expect(res).toHaveFailedTx({
        from: marketplace.address,
        to: contract.address,
        exitCode: Errors.CollectionNotApproved,
    });

    expect(contract.escrowRecord(1)).toEqual(null);
}

// 测试12：Active Collection 可以创建托管记录
get fun `test active collection can create escrow`() {
    val (contract, deployer, _, marketplace) = setupEscrowTest();

    val seller = testing.treasury("testSeller");
    val nftItem = testing.treasury("testNftItem");
    val collection = testing.treasury("testCollection");

    contract.sendSetCollectionStatus(
        deployer.address,
        collection.address,
        1,
        { value: grams("0.05") },
    );

    val extra = CreateEscrowExtra {
        queryId: 1002,
        createdAt: 1782792000,
    };

    val res = contract.sendCreateEscrow(
        marketplace.address,
        nftItem.address,
        collection.address,
        seller.address,
        100,
        extra,
        { value: grams("0.05") },
    );

    expect(res).toHaveSuccessfulTx<CreateEscrow>({
        from: marketplace.address,
        to: contract.address,
    });

    val saved = contract.escrowRecord(1);

    assert (saved != null) throw Errors.InvalidEscrow;

    val savedExtra = saved!!.extra.load();

    expect(saved!!.escrowId).toEqual(1);
    expect(savedExtra.queryId).toEqual(1002);
    expect(saved!!.nftItem).toEqual(nftItem.address);
    expect(saved!!.collection).toEqual(collection.address);
    expect(saved!!.seller).toEqual(seller.address);
    expect(saved!!.productId).toEqual(100);
    expect(saved!!.status).toEqual(1);
    expect(savedExtra.createdAt).toEqual(1782792000);

    expect(contract.escrowIdByQueryId(1002)).toEqual(1);
}

// 测试13：Paused Collection 不能创建新托管
get fun `test paused collection cannot create escrow`() {
    val (contract, deployer, _, marketplace) = setupEscrowTest();

    val seller = testing.treasury("pausedSeller");
    val nftItem = testing.treasury("pausedNft");
    val collection = testing.treasury("pausedTestCollection");

    contract.sendSetCollectionStatus(
        deployer.address,
        collection.address,
        1,
        { value: grams("0.05") },
    );

    contract.sendSetCollectionStatus(
        deployer.address,
        collection.address,
        2,
        { value: grams("0.05") },
    );

    val extra = CreateEscrowExtra {
        queryId: 1003,
        createdAt: 1782792000,
    };

    val res = contract.sendCreateEscrow(
        marketplace.address,
        nftItem.address,
        collection.address,
        seller.address,
        101,
        extra,
        { value: grams("0.05") },
    );

    expect(res).toHaveFailedTx({
        from: marketplace.address,
        to: contract.address,
        exitCode: Errors.CollectionNotApproved,
    });

    expect(contract.escrowRecord(1)).toEqual(null);
}

// 测试14：Revoked Collection 不能创建新托管
get fun `test revoked collection cannot create escrow`() {
    val (contract, deployer, _, marketplace) = setupEscrowTest();

    val seller = testing.treasury("revokedSeller");
    val nftItem = testing.treasury("revokedNft");
    val collection = testing.treasury("revokedTestCollection");

    contract.sendSetCollectionStatus(
        deployer.address,
        collection.address,
        1,
        { value: grams("0.05") },
    );

    contract.sendSetCollectionStatus(
        deployer.address,
        collection.address,
        3,
        { value: grams("0.05") },
    );

    val extra = CreateEscrowExtra {
        queryId: 1004,
        createdAt: 1782792000,
    };

    val res = contract.sendCreateEscrow(
        marketplace.address,
        nftItem.address,
        collection.address,
        seller.address,
        102,
        extra,
        { value: grams("0.05") },
    );

    expect(res).toHaveFailedTx({
        from: marketplace.address,
        to: contract.address,
        exitCode: Errors.CollectionNotApproved,
    });

    expect(contract.escrowRecord(1)).toEqual(null);
}

// 测试15：非 Marketplace 地址不能创建托管
get fun `test non-marketplace cannot create escrow`() {
    val (contract, deployer, notDeployer, _) = setupEscrowTest();

    val seller = testing.treasury("testSeller2");
    val nftItem = testing.treasury("testNftItem2");
    val collection = testing.treasury("testCollection2");

    contract.sendSetCollectionStatus(
        deployer.address,
        collection.address,
        1,
        { value: grams("0.05") },
    );

    val extra = CreateEscrowExtra {
        queryId: 1005,
        createdAt: 1782792000,
    };

    val res = contract.sendCreateEscrow(
        notDeployer.address,
        nftItem.address,
        collection.address,
        seller.address,
        101,
        extra,
        { value: grams("0.05") },
    );

    expect(res).toHaveFailedTx({
        from: notDeployer.address,
        to: contract.address,
        exitCode: Errors.NotOwner,
    });

    expect(contract.escrowRecord(1)).toEqual(null);
}

// 测试16：不存在的 Collection 返回未登记状态
get fun `test unknown collection returns zero status`() {
    val (contract, _, _, _) = setupEscrowTest();

    val collection = testing.treasury("unknownCollection");

    expect(contract.collectionStatus(collection.address)).toEqual(0);
}

// 测试17：不存在的托管编号返回空值
get fun `test missing escrow record returns null`() {
    val (contract, _, _, _) = setupEscrowTest();

    val saved = contract.escrowRecord(999);

    expect(saved).toEqual(null);
}

// 测试环境：部署 NFT Escrow
fun setupEscrowTest(): (NFTEscrow, Treasury, Treasury, Treasury) {
    val deployer = testing.treasury("escrowDeployer");
    val notDeployer = testing.treasury("escrowNotDeployer");
    val marketplace = testing.treasury("marketplace");

    val contract = NFTEscrow.fromStorage({
        owner: deployer.address,
        marketplace: marketplace.address,
        paused: false,
        nextEscrowId: 1,
        records: [],
        collections: [],
        queryToEscrow: [],
    });

    val res = contract.deploy(
        deployer.address,
        { value: grams("0.05") },
    );

    expect(res).toHaveSuccessfulDeploy({
        to: contract.address,
    });

    return (contract, deployer, notDeployer, marketplace);
}

// 构造 TEP-62 ownership_assigned 标准通知
fun buildOwnershipAssignedBody(
    queryId: uint64,
    prevOwner: address,
): cell {
    val payload = beginCell().storeUint(0x53564950, 32).storeUint(queryId, 64).endCell();

    return beginCell()
        .storeUint(0x05138d91, 32)
        .storeUint(queryId, 64)
        .storeAddress(prevOwner)
        .storeUint(1, 1)
        .storeRef(payload)
        .endCell();
}

// 创建一个已经登记、等待 NFT 入库的托管记录
fun setupPendingEscrowTest(): (NFTEscrow, Treasury, Treasury) {
    val (contract, deployer, _, marketplace) = setupEscrowTest();

    val seller = testing.treasury("notificationSeller");
    val nftItem = testing.treasury("notificationNftItem");
    val collection = testing.treasury("notificationCollection");

    contract.sendSetCollectionStatus(
        deployer.address,
        collection.address,
        1,
        { value: grams("0.05") },
    );

    val extra = CreateEscrowExtra {
        queryId: 2001,
        createdAt: 1782792000,
    };

    val createRes = contract.sendCreateEscrow(
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
        to: contract.address,
    });

    return (contract, seller, nftItem);
}

// 测试18：正确的 NFT Item 通知可以完成入库
get fun `test valid ownership notification deposits nft`() {
    val (contract, seller, nftItem) = setupPendingEscrowTest();

    val body = buildOwnershipAssignedBody(
        2001,
        seller.address,
    );

    val res = contract.sendAny(
        nftItem.address,
        body,
        { value: grams("0.05") },
    );

    expect(res).toHaveSuccessfulTx({
        from: nftItem.address,
        to: contract.address,
    });

    val saved = contract.escrowRecord(1);

    assert (saved != null) throw Errors.InvalidEscrow;

    expect(saved!!.status).toEqual(2);
}

// 测试19：错误的 NFT Item 不能伪造入库通知
get fun `test wrong nft item notification is rejected`() {
    val (contract, seller, _) = setupPendingEscrowTest();

    val wrongNftItem = testing.treasury("wrongNotificationNftItem");

    val body = buildOwnershipAssignedBody(
        2001,
        seller.address,
    );

    val res = contract.sendAny(
        wrongNftItem.address,
        body,
        { value: grams("0.05") },
    );

    expect(res).toHaveFailedTx({
        from: wrongNftItem.address,
        to: contract.address,
        exitCode: Errors.InvalidNftItem,
    });

    val saved = contract.escrowRecord(1);

    assert (saved != null) throw Errors.InvalidEscrow;

    expect(saved!!.status).toEqual(1);
}

// 测试20：错误的 queryId 不能完成入库
get fun `test wrong query id notification is rejected`() {
    val (contract, seller, nftItem) = setupPendingEscrowTest();

    val body = buildOwnershipAssignedBody(
        9999,
        seller.address,
    );

    val res = contract.sendAny(
        nftItem.address,
        body,
        { value: grams("0.05") },
    );

    expect(res).toHaveFailedTx({
        from: nftItem.address,
        to: contract.address,
        exitCode: Errors.InvalidQueryId,
    });

    val saved = contract.escrowRecord(1);

    assert (saved != null) throw Errors.InvalidEscrow;

    expect(saved!!.status).toEqual(1);
}

// 测试21：错误的原所有者不能完成入库
get fun `test wrong previous owner notification is rejected`() {
    val (contract, _, nftItem) = setupPendingEscrowTest();

    val wrongSeller = testing.treasury("wrongNotificationSeller");

    val body = buildOwnershipAssignedBody(
        2001,
        wrongSeller.address,
    );

    val res = contract.sendAny(
        nftItem.address,
        body,
        { value: grams("0.05") },
    );

    expect(res).toHaveFailedTx({
        from: nftItem.address,
        to: contract.address,
        exitCode: Errors.InvalidSeller,
    });

    val saved = contract.escrowRecord(1);

    assert (saved != null) throw Errors.InvalidEscrow;

    expect(saved!!.status).toEqual(1);
}

// 测试22：已经入库的 NFT 不允许重复入库
get fun `test duplicate ownership notification is rejected`() {
    val (contract, seller, nftItem) = setupPendingEscrowTest();

    val body = buildOwnershipAssignedBody(
        2001,
        seller.address,
    );

    val firstRes = contract.sendAny(
        nftItem.address,
        body,
        { value: grams("0.05") },
    );

    expect(firstRes).toHaveSuccessfulTx({
        from: nftItem.address,
        to: contract.address,
    });

    val secondRes = contract.sendAny(
        nftItem.address,
        body,
        { value: grams("0.05") },
    );

    expect(secondRes).toHaveFailedTx({
        from: nftItem.address,
        to: contract.address,
        exitCode: Errors.EscrowNotPending,
    });

    val saved = contract.escrowRecord(1);

    assert (saved != null) throw Errors.InvalidEscrow;

    expect(saved!!.status).toEqual(2);
}
