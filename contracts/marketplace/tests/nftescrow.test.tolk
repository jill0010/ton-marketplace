import "@acton/fmt"

import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/types/message"
import "@acton/types/transaction"
import "@contracts/types"
import "@wrappers/NFTEscrow.gen"

// 测试辅助类型：保存按官方 Fragment Gift StateInit 推导出的 NFT 地址。
// 注意：该地址用于协议模拟，不代表测试中部署了真实官方 NFT 合约。
struct DerivedNftItemAddress {
    address: address
}

// 使用已验证的 Desk Calendar 官方 Item Code 推导 NFT Item 地址。
fun deriveDeskCalendarNftItem(
    collection: address,
    itemIndex: uint256,
): address {
    val code = parseCellFromHex("b5ee9c72010101010023000842022498bd63f3e9cc2c20c79abe58899a4816ea156855b8d4fcd47cda4bae9e911a");

    val config = beginCell().storeUint(itemIndex, 256).storeAddress(collection).endCell();

    val data = beginCell().storeRef(config).storeUint(0, 1).endCell();

    val stateInit: ContractState = { code: code, data: data };

    return AutoDeployAddress {
        workchain: 0,
        stateInit: stateInit,
    }.calculateAddress();
}

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

// 全局暂停管理测试
get fun `test escrow initially exposes unpaused state`() {
    val (contract, _, _, _) = setupEscrowTest();
    expect(contract.paused()).toEqual(false);
}

get fun `test owner can pause escrow`() {
    val (contract, deployer, _, _) = setupEscrowTest();

    val res = contract.sendSetEscrowPaused(
        deployer.address,
        true,
        { value: grams("0.05") },
    );

    expect(res).toHaveSuccessfulTx<SetEscrowPaused>({
        from: deployer.address,
        to: contract.address,
    });
    expect(contract.paused()).toEqual(true);
}

get fun `test owner can unpause escrow`() {
    val (contract, deployer, _, _) = setupEscrowTest();

    contract.sendSetEscrowPaused(
        deployer.address,
        true,
        { value: grams("0.05") },
    );

    val res = contract.sendSetEscrowPaused(
        deployer.address,
        false,
        { value: grams("0.05") },
    );

    expect(res).toHaveSuccessfulTx<SetEscrowPaused>({
        from: deployer.address,
        to: contract.address,
    });
    expect(contract.paused()).toEqual(false);
}

get fun `test non owner cannot change escrow pause state`() {
    val (contract, deployer, notDeployer, _) = setupEscrowTest();

    val res = contract.sendSetEscrowPaused(
        notDeployer.address,
        true,
        { value: grams("0.05") },
    );

    expect(res).toHaveFailedTx({
        from: notDeployer.address,
        to: contract.address,
        exitCode: Errors.NotOwner,
    });
    expect(contract.paused()).toEqual(false);
    expect(contract.owner()).toEqual(deployer.address);
}

get fun `test owner can set same escrow pause state repeatedly`() {
    val (contract, deployer, _, _) = setupEscrowTest();

    val firstRes = contract.sendSetEscrowPaused(
        deployer.address,
        false,
        { value: grams("0.05") },
    );
    expect(firstRes).toHaveSuccessfulTx<SetEscrowPaused>();

    val secondRes = contract.sendSetEscrowPaused(
        deployer.address,
        false,
        { value: grams("0.05") },
    );
    expect(secondRes).toHaveSuccessfulTx<SetEscrowPaused>();

    expect(contract.paused()).toEqual(false);
}

// 测试5：NFT 托管记录序列化
get fun `test escrow record serialization`() {
    val seller = testing.treasury("escrowSeller");
    val nftItem = testing.treasury("nftItem");
    val collection = testing.treasury("nftCollection");

    val recordExtra = EscrowRecordExtra {
        queryId: 1001,
        createdAt: 1782792000,
        itemIndex: 0,
        kind: 3,
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

// 未配置 Item Code 的 Collection 不允许激活
get fun `test collection activation requires item code`() {
    val (contract, deployer, _, _) = setupEscrowTest();
    val collection = testing.treasury("missingItemCodeCollection");

    val registerRes = contract.sendSetCollectionStatus(
        deployer.address,
        collection.address,
        2,
        { value: grams("0.05") },
    );
    expect(registerRes).toHaveSuccessfulTx<SetCollectionStatus>();

    val activateRes = contract.sendSetCollectionStatus(
        deployer.address,
        collection.address,
        1,
        { value: grams("0.05") },
    );
    expect(activateRes).toHaveFailedTx({
        from: deployer.address,
        to: contract.address,
        exitCode: Errors.CollectionItemCodeNotConfigured,
    });

    expect(contract.collectionStatus(collection.address)).toEqual(2);
}

// 测试6：管理员可以批准 Collection
get fun `test owner can activate collection`() {
    val (contract, deployer, _, _) = setupEscrowTest();

    val collection = testing.treasury("approvedCollection");

    val res = configureActiveCollection(contract, deployer, collection.address);

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

    configureActiveCollection(contract, deployer, collection.address);

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

    configureActiveCollection(contract, deployer, collection.address);

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
        itemIndex: 0,
    };

    val res = contract.sendCreateEscrow(
        marketplace.address,
        nftItem.address,
        collection.address,
        seller.address,
        100,
        3,
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
    val collection = testing.treasury("testCollection");
    val nftItem = DerivedNftItemAddress {
        address: deriveDeskCalendarNftItem(collection.address, 0),
    };

    configureActiveCollection(contract, deployer, collection.address);

    val extra = CreateEscrowExtra {
        queryId: 1002,
        createdAt: 1782792000,
        itemIndex: 0,
    };

    val res = contract.sendCreateEscrow(
        marketplace.address,
        nftItem.address,
        collection.address,
        seller.address,
        100,
        3,
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

    configureActiveCollection(contract, deployer, collection.address);

    contract.sendSetCollectionStatus(
        deployer.address,
        collection.address,
        2,
        { value: grams("0.05") },
    );

    val extra = CreateEscrowExtra {
        queryId: 1003,
        createdAt: 1782792000,
        itemIndex: 0,
    };

    val res = contract.sendCreateEscrow(
        marketplace.address,
        nftItem.address,
        collection.address,
        seller.address,
        101,
        3,
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

    configureActiveCollection(contract, deployer, collection.address);

    contract.sendSetCollectionStatus(
        deployer.address,
        collection.address,
        3,
        { value: grams("0.05") },
    );

    val extra = CreateEscrowExtra {
        queryId: 1004,
        createdAt: 1782792000,
        itemIndex: 0,
    };

    val res = contract.sendCreateEscrow(
        marketplace.address,
        nftItem.address,
        collection.address,
        seller.address,
        102,
        3,
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

    configureActiveCollection(contract, deployer, collection.address);

    val extra = CreateEscrowExtra {
        queryId: 1005,
        createdAt: 1782792000,
        itemIndex: 0,
    };

    val res = contract.sendCreateEscrow(
        notDeployer.address,
        nftItem.address,
        collection.address,
        seller.address,
        101,
        3,
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

// 测试辅助：先登记 Collection，再配置测试用 Item Code，最后激活
fun configureActiveCollection(
    contract: NFTEscrow,
    deployer: Treasury,
    collection: address,
) {
    val pauseRes = contract.sendSetCollectionStatus(
        deployer.address,
        collection,
        2,
        { value: grams("0.05") },
    );
    expect(pauseRes).toHaveSuccessfulTx<SetCollectionStatus>();

    val testCode = parseCellFromHex("b5ee9c72010101010023000842022498bd63f3e9cc2c20c79abe58899a4816ea156855b8d4fcd47cda4bae9e911a");
    val codeRes = contract.sendSetCollectionItemCode(
        deployer.address,
        collection,
        3,
        testCode,
        { value: grams("0.05") },
    );
    expect(codeRes).toHaveSuccessfulTx<SetCollectionItemCode>();

    val activateRes = contract.sendSetCollectionStatus(
        deployer.address,
        collection,
        1,
        { value: grams("0.05") },
    );
    expect(activateRes).toHaveSuccessfulTx<SetCollectionStatus>();
    return activateRes;
}

// 测试环境：部署 NFT Escrow
fun setupEscrowTest(): (NFTEscrow, Treasury, Treasury, Treasury) {
    testing.registerLibrary(
        parseCellFromHex("b5ee9c72010226010007f4000114ff00f4a413f4bcf2c80b0102012003020064f230f8276f10ed44d0d4f404d1d0fa40d4f404d4d14533237ff02732034414c85004cf1612ccf400ccc901c8ccf400c9ed540201480d040201200a05020120090602012008070067b74a7da89a1a9e809a263a1f481a9e809a9a226be0640dd2e60dae0a8e00041c1a1a9a9a263a1f481f401f401a60fa63fa63fa300097b7d05da89a1a9e809a263a1f481a9e809a9a226be0640dde5a1b7a1a9a9a261a1e809f401a63fa2dae0a608dd226b3abe0605a1f481f401a63fa28889c4450413c267017727083e67bcaa430005db8fcfed44d0d4f404d101d0d3fffa40d1226e9632708b02136de002d0fa40d4f404d4d15bd0d4f404d4d15b7f444480201200c0b0039b8ed7ed44d0d4f404d131d0fa40d4f404d4d16c31d0d30fd30ffa40d180067b8f82ed44d0d4f404d131d0fa40d4f404d4d110235f03d0d4f404d4d16c21d0d30701aa02d7180101d30701aa02d7180101d13080202ca1a0e020148160f020148111000714fa40fa00d4d4d4d43001f029206e935f076de010364540f0288b02511370f02732136d500502c8ccf400ccc959c85004cf1612ccf400ccc98020120131200cb08343e903e803e8034c1f4c7f4c7f44d4920c7ac016085dfffffffec092082e4e1c02e4930c01455ae456c052c40b04044ac406082024ea02f2c4870406c486082784ce02f2c64d7c11b7800a5407e08e80077db4080b23d00007e80b2c7f24040723333326002eb3435353440743d013e8034c7f4483080086082784ce02eec24fe08e8379490ae7cb434c8b43e903e803e8034c1f4c7f4c7f44c0cccd45dbe08f21400f3c5807e80b2c7f27e08d62804ed8249b080149a2f85ec249c0db78920840ee6b28028006999056a2998e0192a41052d82485ba44c78c39400e01514002002c8f40001fa02cb1fc90101c8ccccc900a401d0fa40fa00d31fd130268209c9c380a101b60820c2008e368210557cea20f825221034596d71708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb0015a104915be20201f4191701f308b435353440743d013e8034c7f44c483080086082784ce02eec3e08d62e6c6497c1380d0064be0037889ba4d7c0db78343e903e803e8034c1f4c7f4c7f457c140b43e903e8034c7f440f434c3f4c3fe90345c20840144e3647e0960840e049f7848f2140373c587328006f2c7c9be808632c7c990c5122a9c601800a2708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb0020c20026c200b05345c705b3b08e12544116a9845240b6085144a14554f026431393303233e21023f026016d008d08a0827270e028406d82083080238d20840dc3fb147e0948840d165b5c9c20043232c15401f3c594017e808572da84b2c7f2cfc89ba44ca51633c5c0788072407ec0286456f8a004f7d7b68bb7efe09dbc400b434c0c05c6c2497c1383e903e900c7e800c7d010c7e800c7e800c1cea6d0008b1c0245c2540b4c7d40cf8bb5134353d0134487434fffe903454c1b1c178c0889bbcb43480b43e90353d01353449e0841a4f4e542eb8c089e0840bf2c9a8aeb8c08d0d0970000a62d88dd1bdc1d5c231c16c22524231b03f629d74ac000b0925f0be0236e8e2c519aa140132370f027206e8e1954719026c85004cf1612ccf400ccc9525001c8ccf400c9ed54de512aa04319df258210371638aebae302236e8e2a363703c000f2e0d610364470f02841302370f027324313c85004cf1612ccf400ccc901c8ccf400c9ed54e13a24c000e3022422211c02fc8210487a8e81ba8e68323333355321c705f2e0dc03d33fd430f029206ef2d0df10234604c85004cf1612ccf400ccc9218e3213708210a37a098358056d8040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb00923330e20101c8ccf400c9ed54e00482105fcc3d14bae3025f091e1d0006f2c0d002c85153c705f2e0d806505301d33ffa40fa40f404fa003223fa4430c000f2e14d078209c9c380a127945375a0a1de22d70b01c300209206a19136e220c2fff2e0ce27941027365be30d0293135f03e30d4433c85004cf1612ccf400ccc901c8ccf400c9ed54201f007223fa4430c000f2e14d43308210d53276db016d71708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb00007e821005138d91c85008cf1658cf1671245146104a10395092708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb0010340014375f053331c705f2e0d700ee35353737266ef2d0db5dc705f2e0dc04d33f3006d0d4d4d130d0f404fa00d31fd15b6ef2e0dd586d5005c85004cf1612ccf400ccc9238e3312708210a37a098358056d8040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb0001926c22e201c8ccf400c9ed5400845f0450785f0501d33f307082108b77173505c8cbff5004cf1610248040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb00007a3b5f0833d33f30708210a8cb00adc804d014cf1643308040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb0000be5b333335048210299a3e15baf2e0d5036e8e1466f02a206e9b3101c8ccf400c9ed54db31e13031926c21e2fa4030708210a43227e1f8256d8040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb00"),
    );

    val deployer = testing.treasury("escrowDeployer");
    val notDeployer = testing.treasury("escrowNotDeployer");
    val marketplace = testing.treasury("marketplace");

    val contract = NFTEscrow.fromStorage({
        owner: deployer.address,
        marketplace: marketplace.address,
        paused: false,
        nextEscrowId: 1,
        records: [],
        collectionStorage: CollectionStorage {
            collections: [],
            collectionItemCodes: [],
        }.toCell(),
        queryToEscrow: [],
        callbackStorage: EscrowCallbackStorage {
            refundCallbacks: [],
            depositCallbacks: [],
        }.toCell(),
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
fun setupPendingEscrowTest(): (NFTEscrow, Treasury, DerivedNftItemAddress) {
    val (contract, deployer, _, marketplace) = setupEscrowTest();

    val seller = testing.treasury("notificationSeller");
    val collection = testing.treasury("notificationCollection");
    val nftItem = DerivedNftItemAddress {
        address: deriveDeskCalendarNftItem(collection.address, 0),
    };

    configureActiveCollection(contract, deployer, collection.address);

    val extra = CreateEscrowExtra {
        queryId: 2001,
        createdAt: 1782792000,
        itemIndex: 0,
    };

    val createRes = contract.sendCreateEscrow(
        marketplace.address,
        nftItem.address,
        collection.address,
        seller.address,
        9001,
        3,
        extra,
        { value: grams("0.05") },
    );

    expect(createRes).toHaveSuccessfulTx<CreateEscrow>({
        from: marketplace.address,
        to: contract.address,
    });

    return (contract, seller, nftItem);
}

// 创建一个已经完成 NFT 入库的托管记录，供退款测试复用
fun setupDepositedEscrowTest(): (NFTEscrow, Treasury, DerivedNftItemAddress) {
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

// 测试23：未授权用户不能发起 NFT 退款
get fun `test unauthorized user cannot request refund`() {
    val (contract, seller, _) = setupDepositedEscrowTest();
    val attacker = testing.treasury("unauthorizedRefundAttacker");

    val res = contract.sendRequestRefund(
        attacker.address,
        1,
        { value: grams("0.05") },
    );

    expect(res).toHaveFailedTx({
        from: attacker.address,
        to: contract.address,
        exitCode: Errors.RefundNotAuthorized,
    });

    val saved = contract.escrowRecord(1);
    assert (saved != null) throw Errors.InvalidEscrow;
    expect(saved!!.status).toEqual(2);
}

// 测试24：退款处理中不能重复发起退款
get fun `test duplicate refund request is rejected while pending`() {
    val (contract, seller, _) = setupDepositedEscrowTest();

    // 只执行退款请求交易，不处理后续 NFT Item 转账。
    // 该测试专门验证 RefundPending 状态下的重复请求保护。
    val requestMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: contract.address,
        body: RequestRefund { escrowId: 1 },
    });

    testing.processSingleTraceStep(
        seller.address,
        requestMessage,
    );

    val pending = contract.escrowRecord(1);
    assert (pending != null) throw Errors.InvalidEscrow;
    expect(pending!!.status).toEqual(6);

    val secondRes = contract.sendRequestRefund(
        seller.address,
        1,
        { value: grams("0.05") },
    );

    expect(secondRes).toHaveFailedTx({
        from: seller.address,
        to: contract.address,
        exitCode: Errors.RefundAlreadyPending,
    });

    val saved = contract.escrowRecord(1);
    assert (saved != null) throw Errors.InvalidEscrow;
    expect(saved!!.status).toEqual(6);
}

// 测试25：Escrow 管理员可以主动发起退款
get fun `test escrow admin can request refund without seller`() {
    val (contract, seller, _) = setupDepositedEscrowTest();
    val admin = contract.owner();

    // 只执行管理员的退款请求交易，不处理后续 NFT Item 转账。
    val requestMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: contract.address,
        body: RequestRefund { escrowId: 1 },
    });

    testing.processSingleTraceStep(
        admin,
        requestMessage,
    );

    val pending = contract.escrowRecord(1);
    assert (pending != null) throw Errors.InvalidEscrow;
    expect(pending!!.status).toEqual(6);
}

// 全局暂停测试：暂停后禁止创建新的 NFT 托管
get fun `test global pause blocks new escrow creation`() {
    val (contract, deployer, _, marketplace) = setupEscrowTest();

    val seller = testing.treasury("globalPauseSeller");
    val collection = testing.treasury("globalPauseCollection");
    val nftItem = DerivedNftItemAddress {
        address: deriveDeskCalendarNftItem(collection.address, 0),
    };

    configureActiveCollection(contract, deployer, collection.address);

    val pauseRes = contract.sendSetEscrowPaused(
        deployer.address,
        true,
        { value: grams("0.05") },
    );
    expect(pauseRes).toHaveSuccessfulTx<SetEscrowPaused>();
    expect(contract.paused()).toEqual(true);

    val extra = CreateEscrowExtra {
        queryId: 3001,
        createdAt: 1782792000,
        itemIndex: 0,
    };

    val createRes = contract.sendCreateEscrow(
        marketplace.address,
        nftItem.address,
        collection.address,
        seller.address,
        3001,
        3,
        extra,
        { value: grams("0.05") },
    );

    expect(createRes).toHaveFailedTx({
        from: marketplace.address,
        to: contract.address,
        exitCode: Errors.EscrowPaused,
    });

    expect(contract.escrowRecord(1)).toEqual(null);
}

// 全局暂停测试：暂停后已经入库的 NFT 仍然可以退款
get fun `test global pause still allows refund of deposited nft`() {
    val (contract, seller, nftItem) = setupDepositedEscrowTest();

    val pauseRes = contract.sendSetEscrowPaused(
        contract.owner(),
        true,
        { value: grams("0.05") },
    );
    expect(pauseRes).toHaveSuccessfulTx<SetEscrowPaused>();
    expect(contract.paused()).toEqual(true);

    // 单步执行退款请求，避免未部署的 NFT Item 自动触发 bounce。
    val refundMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: contract.address,
        body: RequestRefund { escrowId: 1 },
    });

    testing.processSingleTraceStep(
        seller.address,
        refundMessage,
    );

    val pending = contract.escrowRecord(1);
    assert (pending != null) throw Errors.InvalidEscrow;
    expect(pending!!.status).toEqual(6);

    val confirmation = contract.sendNftExcesses(
        nftItem.address,
        2001,
        { value: grams("0.05") },
    );
    expect(confirmation).toHaveSuccessfulTx();

    val refunded = contract.escrowRecord(1);
    assert (refunded != null) throw Errors.InvalidEscrow;
    expect(refunded!!.status).toEqual(4);
    expect(contract.paused()).toEqual(true);
}

// 测试33：Collection 暂停后，已经入库的 NFT 仍然可以退款
get fun `test paused collection can still refund deposited nft`() {
    val (contract, seller, nftItem) = setupDepositedEscrowTest();

    val deposited = contract.escrowRecord(1);
    assert (deposited != null) throw Errors.InvalidEscrow;

    val admin = contract.owner();

    val pauseRes = contract.sendSetCollectionStatus(
        admin,
        deposited!!.collection,
        2,
        { value: grams("0.05") },
    );
    expect(pauseRes).toHaveSuccessfulTx<SetCollectionStatus>();

    expect(contract.collectionStatus(deposited!!.collection)).toEqual(2);

    // 单步执行退款请求，避免未部署的 NFT Item 自动触发 bounce。
    val refundMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: contract.address,
        body: RequestRefund { escrowId: 1 },
    });

    testing.processSingleTraceStep(
        seller.address,
        refundMessage,
    );

    val confirmation = contract.sendNftExcesses(
        nftItem.address,
        2001,
        { value: grams("0.05") },
    );
    expect(confirmation).toHaveSuccessfulTx();

    val refunded = contract.escrowRecord(1);
    assert (refunded != null) throw Errors.InvalidEscrow;
    expect(refunded!!.status).toEqual(4);
}

// 测试34：Collection 撤销后，已经入库的 NFT 仍然可以退款
get fun `test revoked collection can still refund deposited nft`() {
    val (contract, seller, nftItem) = setupDepositedEscrowTest();

    val deposited = contract.escrowRecord(1);
    assert (deposited != null) throw Errors.InvalidEscrow;

    val admin = contract.owner();

    val revokeRes = contract.sendSetCollectionStatus(
        admin,
        deposited!!.collection,
        3,
        { value: grams("0.05") },
    );
    expect(revokeRes).toHaveSuccessfulTx<SetCollectionStatus>();

    expect(contract.collectionStatus(deposited!!.collection)).toEqual(3);

    // 单步执行退款请求，避免未部署的 NFT Item 自动触发 bounce。
    val refundMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: contract.address,
        body: RequestRefund { escrowId: 1 },
    });

    testing.processSingleTraceStep(
        seller.address,
        refundMessage,
    );

    val confirmation = contract.sendNftExcesses(
        nftItem.address,
        2001,
        { value: grams("0.05") },
    );
    expect(confirmation).toHaveSuccessfulTx();

    val refunded = contract.escrowRecord(1);
    assert (refunded != null) throw Errors.InvalidEscrow;
    expect(refunded!!.status).toEqual(4);
}

// 测试26：NFT 转账发生 RichBounce 后恢复托管状态，并允许重新退款
get fun `test bounced nft refund restores deposited status and allows retry`() {
    val (contract, seller, nftItem) = setupDepositedEscrowTest();

    // 只执行卖家发起退款这一笔交易，暂不处理 NFT Item 的后续消息
    val requestMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: contract.address,
        body: RequestRefund { escrowId: 1 },
    });

    val refundResult = testing.processSingleTraceStep(
        seller.address,
        requestMessage,
    );

    val pending = contract.escrowRecord(1);
    assert (pending != null) throw Errors.InvalidEscrow;
    expect(pending!!.status).toEqual(6);

    // 提取 Escrow 实际发出的 NFT 转账消息
    val transferMessage = refundResult.outMessages.at<NftTransfer>(0);
    val transferBody = transferMessage.loadBody();

    // 构造包含原始 NFT 转账消息体的 RichBounce
    val bounceBody = RichBounceBody {
        originalBody: transferBody.toCell(),
        originalInfo: RichBounceOriginalMsgInfo {
            valueCoins: grams("0.05"),
            valueExtra: [],
            createdLt: 0,
            createdAt: 0,
        }.toCell(),
        bouncedByPhase: 1,
        exitCode: 42,
        computePhase: RichBounceComputePhaseInfo {
            gasUsed: 100,
            vmSteps: 10,
        },
    };

    val bouncedMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: contract.address,
        body: bounceBody,
    }).bounced();

    // 模拟 NFT Item 将失败的转账消息退回 Escrow
    val bounceResult = testing.processSingleTraceStep(
        nftItem.address,
        bouncedMessage,
    );

    // Bounce 处理后，托管状态必须恢复为 Deposited
    val restored = contract.escrowRecord(1);
    assert (restored != null) throw Errors.InvalidEscrow;
    expect(restored!!.status).toEqual(2);

    // 状态恢复后，卖家应该可以重新发起退款
    // 单步执行重试请求，验证状态重新进入 RefundPending。
    val retryMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: contract.address,
        body: RequestRefund { escrowId: 1 },
    });

    testing.processSingleTraceStep(
        seller.address,
        retryMessage,
    );

    val retried = contract.escrowRecord(1);
    assert (retried != null) throw Errors.InvalidEscrow;
    expect(retried!!.status).toEqual(6);
}

// 测试27：非 NFT Item 地址伪造退款确认必须被拒绝
get fun `test forged refund confirmation from wrong sender is rejected`() {
    val (contract, seller, _) = setupDepositedEscrowTest();
    val attacker = testing.treasury("forgedRefundConfirmationAttacker");

    // 单步执行退款请求，避免未部署的 NFT Item 自动触发 bounce。
    val refundMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: contract.address,
        body: RequestRefund { escrowId: 1 },
    });

    testing.processSingleTraceStep(
        seller.address,
        refundMessage,
    );

    val body = beginCell().storeUint(0xd53276db, 32).storeUint(2001, 64).endCell();

    val forgedRes = contract.sendAny(
        attacker.address,
        body,
        { value: grams("0.05") },
    );

    expect(forgedRes).toHaveFailedTx({
        from: attacker.address,
        to: contract.address,
        exitCode: Errors.InvalidRefundConfirmation,
    });

    val saved = contract.escrowRecord(1);
    assert (saved != null) throw Errors.InvalidEscrow;
    expect(saved!!.status).toEqual(6);
}

// 测试28：正确 NFT Item 使用错误 Query ID 不能确认退款
get fun `test refund confirmation with wrong query id is rejected`() {
    val (contract, seller, nftItem) = setupDepositedEscrowTest();

    // 单步执行退款请求，避免未部署的 NFT Item 自动触发 bounce。
    val refundMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: contract.address,
        body: RequestRefund { escrowId: 1 },
    });

    testing.processSingleTraceStep(
        seller.address,
        refundMessage,
    );

    val body = beginCell().storeUint(0xd53276db, 32).storeUint(9999, 64).endCell();

    val invalidRes = contract.sendAny(
        nftItem.address,
        body,
        { value: grams("0.05") },
    );

    expect(invalidRes).toHaveFailedTx({
        from: nftItem.address,
        to: contract.address,
        exitCode: Errors.InvalidRefundConfirmation,
    });

    val saved = contract.escrowRecord(1);
    assert (saved != null) throw Errors.InvalidEscrow;
    expect(saved!!.status).toEqual(6);
}

// 测试29：退款成功后重复发送确认消息必须被拒绝
get fun `test duplicate refund confirmation is rejected`() {
    val (contract, seller, nftItem) = setupDepositedEscrowTest();

    // 单步执行退款请求，避免未部署的 NFT Item 自动触发 bounce。
    val refundMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: contract.address,
        body: RequestRefund { escrowId: 1 },
    });

    testing.processSingleTraceStep(
        seller.address,
        refundMessage,
    );

    val body = beginCell().storeUint(0xd53276db, 32).storeUint(2001, 64).endCell();

    val firstRes = contract.sendAny(
        nftItem.address,
        body,
        { value: grams("0.05") },
    );

    expect(firstRes).toHaveSuccessfulTx({
        from: nftItem.address,
        to: contract.address,
    });

    val refunded = contract.escrowRecord(1);
    assert (refunded != null) throw Errors.InvalidEscrow;
    expect(refunded!!.status).toEqual(4);

    val secondRes = contract.sendAny(
        nftItem.address,
        body,
        { value: grams("0.05") },
    );

    expect(secondRes).toHaveFailedTx({
        from: nftItem.address,
        to: contract.address,
        exitCode: Errors.InvalidRefundConfirmation,
    });

    val saved = contract.escrowRecord(1);
    assert (saved != null) throw Errors.InvalidEscrow;
    expect(saved!!.status).toEqual(4);
}

// 测试30：管理员可以重试尚未确认的退款回调，且重复重试不会重新退款
get fun `test owner can retry pending refund callback`() {
    val (contract, seller, nftItem) = setupDepositedEscrowTest();

    // 单步执行退款请求，避免未部署的 NFT Item 自动触发 bounce。
    val refundMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: contract.address,
        body: RequestRefund { escrowId: 1 },
    });

    testing.processSingleTraceStep(
        seller.address,
        refundMessage,
    );

    // 模拟 NFT Item 确认退款，生成持久化回调记录。
    val confirmation = contract.sendNftExcesses(
        nftItem.address,
        2001,
        { value: grams("0.05") },
    );
    expect(confirmation).toHaveSuccessfulTx();

    val refunded = contract.escrowRecord(1);
    assert (refunded != null) throw Errors.InvalidEscrow;
    expect(refunded!!.status).toEqual(4);

    val admin = contract.owner();

    val firstRetry = contract.sendRetryRefundCallback(
        admin,
        1,
        { value: grams("0.05") },
    );
    expect(firstRetry).toHaveSuccessfulTx();

    // 再次重试仍然只重发回调，不改变退款状态。
    val secondRetry = contract.sendRetryRefundCallback(
        admin,
        1,
        { value: grams("0.05") },
    );
    expect(secondRetry).toHaveSuccessfulTx();

    val saved = contract.escrowRecord(1);
    assert (saved != null) throw Errors.InvalidEscrow;
    expect(saved!!.status).toEqual(4);
}

// 测试31：非管理员不能重试退款回调，且不能破坏待确认记录
get fun `test non owner cannot retry pending refund callback`() {
    val (contract, seller, nftItem) = setupDepositedEscrowTest();
    val attacker = testing.treasury("unauthorizedCallbackRetry");

    // 单步执行退款请求，避免未部署的 NFT Item 自动触发 bounce。
    val refundMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: contract.address,
        body: RequestRefund { escrowId: 1 },
    });

    testing.processSingleTraceStep(
        seller.address,
        refundMessage,
    );

    val confirmation = contract.sendNftExcesses(
        nftItem.address,
        2001,
        { value: grams("0.05") },
    );
    expect(confirmation).toHaveSuccessfulTx();

    val retryRes = contract.sendRetryRefundCallback(
        attacker.address,
        1,
        { value: grams("0.05") },
    );

    expect(retryRes).toHaveFailedTx({
        from: attacker.address,
        to: contract.address,
        exitCode: Errors.NotOwner,
    });

    // 非管理员失败后，管理员仍然可以正常重试。
    val adminRetry = contract.sendRetryRefundCallback(
        contract.owner(),
        1,
        { value: grams("0.05") },
    );
    expect(adminRetry).toHaveSuccessfulTx();
}

// 测试32：ACK 必须匹配 Marketplace 和全部退款身份信息，成功后清除记录
get fun `test refund ack validates identity and clears callback`() {
    val (contract, seller, nftItem) = setupDepositedEscrowTest();
    val marketplace = contract.marketplace();
    val attacker = testing.treasury("forgedRefundAck");

    // 单步执行退款请求，避免未部署的 NFT Item 自动触发 bounce。
    val refundMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: contract.address,
        body: RequestRefund { escrowId: 1 },
    });

    testing.processSingleTraceStep(
        seller.address,
        refundMessage,
    );

    val confirmation = contract.sendNftExcesses(
        nftItem.address,
        2001,
        { value: grams("0.05") },
    );
    expect(confirmation).toHaveSuccessfulTx();

    // 错误发送方不能确认。
    val wrongSender = contract.sendEscrowRefundAck(
        attacker.address,
        2001,
        9001,
        nftItem.address,
        seller.address,
        { value: grams("0.05") },
    );
    expect(wrongSender).toHaveFailedTx({
        from: attacker.address,
        to: contract.address,
        exitCode: Errors.InvalidRefundConfirmation,
    });

    // 错误 Query ID 不能清除记录。
    val wrongQuery = contract.sendEscrowRefundAck(
        marketplace,
        9999,
        9001,
        nftItem.address,
        seller.address,
        { value: grams("0.05") },
    );
    expect(wrongQuery).toHaveFailedTx({
        from: marketplace,
        to: contract.address,
        exitCode: Errors.InvalidRefundConfirmation,
    });

    // 错误商品编号不能清除记录。
    val wrongProduct = contract.sendEscrowRefundAck(
        marketplace,
        2001,
        9999,
        nftItem.address,
        seller.address,
        { value: grams("0.05") },
    );
    expect(wrongProduct).toHaveFailedTx({
        from: marketplace,
        to: contract.address,
        exitCode: Errors.InvalidRefundConfirmation,
    });

    // 错误 NFT Item 不能清除记录。
    val wrongNft = contract.sendEscrowRefundAck(
        marketplace,
        2001,
        9001,
        attacker.address,
        seller.address,
        { value: grams("0.05") },
    );
    expect(wrongNft).toHaveFailedTx({
        from: marketplace,
        to: contract.address,
        exitCode: Errors.InvalidRefundConfirmation,
    });

    // 错误卖家不能清除记录。
    val wrongSeller = contract.sendEscrowRefundAck(
        marketplace,
        2001,
        9001,
        nftItem.address,
        attacker.address,
        { value: grams("0.05") },
    );
    expect(wrongSeller).toHaveFailedTx({
        from: marketplace,
        to: contract.address,
        exitCode: Errors.InvalidRefundConfirmation,
    });

    // 全部信息匹配时 ACK 成功。
    val validAck = contract.sendEscrowRefundAck(
        marketplace,
        2001,
        9001,
        nftItem.address,
        seller.address,
        { value: grams("0.05") },
    );
    expect(validAck).toHaveSuccessfulTx();

    // 已清除的记录不能再次 ACK。
    val duplicateAck = contract.sendEscrowRefundAck(
        marketplace,
        2001,
        9001,
        nftItem.address,
        seller.address,
        { value: grams("0.05") },
    );
    expect(duplicateAck).toHaveFailedTx({
        from: marketplace,
        to: contract.address,
        exitCode: Errors.InvalidRefundConfirmation,
    });

    // 已清除的记录也不能再重试。
    val retryAfterAck = contract.sendRetryRefundCallback(
        contract.owner(),
        1,
        { value: grams("0.05") },
    );
    expect(retryAfterAck).toHaveFailedTx({
        from: contract.owner(),
        to: contract.address,
        exitCode: Errors.InvalidRefundConfirmation,
    });
}

// 测试33：管理员可以重试待确认的 NFT 入库回调
get fun `test owner can retry pending deposit callback`() {
    val (contract, _, _) = setupDepositedEscrowTest();

    val firstRetry = contract.sendRetryDepositCallback(
        contract.owner(),
        1,
        { value: grams("0.05") },
    );
    expect(firstRetry).toHaveSuccessfulTx();

    // 重复重试只重新发送回调，不改变已入库状态。
    val secondRetry = contract.sendRetryDepositCallback(
        contract.owner(),
        1,
        { value: grams("0.05") },
    );
    expect(secondRetry).toHaveSuccessfulTx();

    val saved = contract.escrowRecord(1);
    assert (saved != null) throw Errors.InvalidEscrow;
    expect(saved!!.status).toEqual(2);
}

// 测试34：Only256BitsOfBody 入库回调退回后保留待确认记录
get fun `test bounced deposit callback keeps pending record`() {
    val (contract, _, _) = setupDepositedEscrowTest();

    // 单步执行管理员重试，取得实际发出的入库回调。
    val retryMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: contract.address,
        body: RetryDepositCallback { escrowId: 1 },
    });

    val retryResult = testing.processSingleTraceStep(
        contract.owner(),
        retryMessage,
    );

    val callbackMessage = retryResult.outMessages.at<EscrowDeposited>(0);
    val callbackBody = callbackMessage.loadBody().toCell().beginParse();

    // Only256BitsOfBody：0xffffffff 前缀 + 原消息体前 256 位。
    val bounceBody = beginCell()
        .storeUint(0xffffffff, 32)
        .storeSlice(callbackBody.getFirstBits(256))
        .endCell();

    val bouncedMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: contract.address,
        body: bounceBody.beginParse(),
    }).bounced();

    // 模拟 Marketplace 将入库回调退回 Escrow。
    val bounceResult = testing.processSingleTraceStep(
        contract.marketplace(),
        bouncedMessage,
    );

    // 回调退回不能改变已入库状态。
    val saved = contract.escrowRecord(1);
    assert (saved != null) throw Errors.InvalidEscrow;
    expect(saved!!.status).toEqual(2);

    // 回调记录必须保留，管理员仍然可以再次重试。
    val retryAfterBounce = contract.sendRetryDepositCallback(
        contract.owner(),
        1,
        { value: grams("0.05") },
    );
    expect(retryAfterBounce).toHaveSuccessfulTx();
}

// 测试：伪造发送方不能冒充 Marketplace 发送回调退回消息
get fun `test spoofed sender cannot submit bounced deposit callback`() {
    val (contract, _, _) = setupDepositedEscrowTest();
    val attacker = testing.treasury("spoofedDepositBounce");

    val retryMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: contract.address,
        body: RetryDepositCallback { escrowId: 1 },
    });

    val retryResult = testing.processSingleTraceStep(
        contract.owner(),
        retryMessage,
    );

    val callbackMessage = retryResult.outMessages.at<EscrowDeposited>(0);
    val callbackBody = callbackMessage.loadBody().toCell().beginParse();

    val bounceBody = beginCell()
        .storeUint(0xffffffff, 32)
        .storeSlice(callbackBody.getFirstBits(256))
        .endCell();

    val bouncedMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: contract.address,
        body: bounceBody.beginParse(),
    }).bounced();

    val bounceResult = testing.processSingleTraceStep(
        attacker.address,
        bouncedMessage,
    );

    val tx = bounceResult.tx.load();
    val description = tx.description.load();

    if (description is TlbTransOrd) {
        val compute = description.computePh;
        if (compute is TlbTrComputeVm) {
            expect(compute.data.load().exitCode).toEqual(0xFFFF);
        } else {
            throw Errors.InvalidMessage;
        }
    } else {
        throw Errors.InvalidMessage;
    }

    val saved = contract.escrowRecord(1);
    assert (saved != null) throw Errors.InvalidEscrow;
    expect(saved!!.status).toEqual(2);
}

// 测试34：非管理员不能重试待确认的 NFT 入库回调
get fun `test non owner cannot retry pending deposit callback`() {
    val (contract, _, _) = setupDepositedEscrowTest();
    val attacker = testing.treasury("unauthorizedDepositCallbackRetry");

    val retryRes = contract.sendRetryDepositCallback(
        attacker.address,
        1,
        { value: grams("0.05") },
    );

    expect(retryRes).toHaveFailedTx({
        from: attacker.address,
        to: contract.address,
        exitCode: Errors.NotOwner,
    });

    // 非管理员失败后，管理员仍然可以正常重试。
    val adminRetry = contract.sendRetryDepositCallback(
        contract.owner(),
        1,
        { value: grams("0.05") },
    );
    expect(adminRetry).toHaveSuccessfulTx();
}

// 测试35：入库 ACK 必须匹配 Marketplace 和全部身份信息
get fun `test deposit ack validates identity and clears callback`() {
    val (contract, seller, nftItem) = setupDepositedEscrowTest();
    val marketplace = contract.marketplace();
    val attacker = testing.treasury("forgedDepositAck");

    // 错误发送方不能确认。
    val wrongSender = contract.sendEscrowDepositAck(
        attacker.address,
        2001,
        9001,
        nftItem.address,
        seller.address,
        { value: grams("0.05") },
    );
    expect(wrongSender).toHaveFailedTx({
        from: attacker.address,
        to: contract.address,
        exitCode: Errors.InvalidDepositConfirmation,
    });

    // 错误 Query ID 不能清除记录。
    val wrongQuery = contract.sendEscrowDepositAck(
        marketplace,
        9999,
        9001,
        nftItem.address,
        seller.address,
        { value: grams("0.05") },
    );
    expect(wrongQuery).toHaveFailedTx({
        from: marketplace,
        to: contract.address,
        exitCode: Errors.InvalidDepositConfirmation,
    });

    // 错误商品编号不能清除记录。
    val wrongProduct = contract.sendEscrowDepositAck(
        marketplace,
        2001,
        9999,
        nftItem.address,
        seller.address,
        { value: grams("0.05") },
    );
    expect(wrongProduct).toHaveFailedTx({
        from: marketplace,
        to: contract.address,
        exitCode: Errors.InvalidDepositConfirmation,
    });

    // 错误 NFT Item 不能清除记录。
    val wrongNft = contract.sendEscrowDepositAck(
        marketplace,
        2001,
        9001,
        attacker.address,
        seller.address,
        { value: grams("0.05") },
    );
    expect(wrongNft).toHaveFailedTx({
        from: marketplace,
        to: contract.address,
        exitCode: Errors.InvalidDepositConfirmation,
    });

    // 错误卖家不能清除记录。
    val wrongSeller = contract.sendEscrowDepositAck(
        marketplace,
        2001,
        9001,
        nftItem.address,
        attacker.address,
        { value: grams("0.05") },
    );
    expect(wrongSeller).toHaveFailedTx({
        from: marketplace,
        to: contract.address,
        exitCode: Errors.InvalidDepositConfirmation,
    });

    // 全部信息匹配时 ACK 成功。
    val validAck = contract.sendEscrowDepositAck(
        marketplace,
        2001,
        9001,
        nftItem.address,
        seller.address,
        { value: grams("0.05") },
    );
    expect(validAck).toHaveSuccessfulTx();

    // 已清除的记录不能再次 ACK。
    val duplicateAck = contract.sendEscrowDepositAck(
        marketplace,
        2001,
        9001,
        nftItem.address,
        seller.address,
        { value: grams("0.05") },
    );
    expect(duplicateAck).toHaveFailedTx({
        from: marketplace,
        to: contract.address,
        exitCode: Errors.InvalidDepositConfirmation,
    });

    // 已清除的记录也不能再重试。
    val retryAfterAck = contract.sendRetryDepositCallback(
        contract.owner(),
        1,
        { value: grams("0.05") },
    );
    expect(retryAfterAck).toHaveFailedTx({
        from: contract.owner(),
        to: contract.address,
        exitCode: Errors.InvalidDepositConfirmation,
    });

    // ACK 不得改变已经完成的入库状态。
    val saved = contract.escrowRecord(1);
    assert (saved != null) throw Errors.InvalidEscrow;
    expect(saved!!.status).toEqual(2);
}

// 测试：退款回调退回后保留已退款状态和待确认记录
get fun `test bounced refund callback keeps refunded record`() {
    val (contract, seller, nftItem) = setupDepositedEscrowTest();

    val refundMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: contract.address,
        body: RequestRefund { escrowId: 1 },
    });

    testing.processSingleTraceStep(
        seller.address,
        refundMessage,
    );

    val confirmation = contract.sendNftExcesses(
        nftItem.address,
        2001,
        { value: grams("0.05") },
    );
    expect(confirmation).toHaveSuccessfulTx();

    val retryMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: contract.address,
        body: RetryRefundCallback { escrowId: 1 },
    });

    val retryResult = testing.processSingleTraceStep(
        contract.owner(),
        retryMessage,
    );

    val callbackMessage = retryResult.outMessages.at<EscrowRefunded>(0);
    val callbackBody = callbackMessage.loadBody().toCell().beginParse();

    val bounceBody = beginCell()
        .storeUint(0xffffffff, 32)
        .storeSlice(callbackBody.getFirstBits(256))
        .endCell();

    val bouncedMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: contract.address,
        body: bounceBody.beginParse(),
    }).bounced();

    testing.processSingleTraceStep(
        contract.marketplace(),
        bouncedMessage,
    );

    val saved = contract.escrowRecord(1);
    assert (saved != null) throw Errors.InvalidEscrow;
    expect(saved!!.status).toEqual(4);

    val retryAfterBounce = contract.sendRetryRefundCallback(
        contract.owner(),
        1,
        { value: grams("0.05") },
    );
    expect(retryAfterBounce).toHaveSuccessfulTx();

    val savedAfterRetry = contract.escrowRecord(1);
    assert (savedAfterRetry != null) throw Errors.InvalidEscrow;
    expect(savedAfterRetry!!.status).toEqual(4);
}

// 测试：攻击者伪造 NFT RichBounce 不得恢复托管状态
get fun `test forged nft refund bounce from wrong sender is ignored`() {
    val (contract, seller, _) = setupDepositedEscrowTest();
    val attacker = testing.treasury("forgedNftBounceAttacker");

    val requestMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: contract.address,
        body: RequestRefund { escrowId: 1 },
    });

    val refundResult = testing.processSingleTraceStep(
        seller.address,
        requestMessage,
    );

    val pending = contract.escrowRecord(1);
    assert (pending != null) throw Errors.InvalidEscrow;
    expect(pending!!.status).toEqual(6);

    val transferMessage = refundResult.outMessages.at<NftTransfer>(0);

    val bounceBody = RichBounceBody {
        originalBody: transferMessage.loadBody().toCell(),
        originalInfo: RichBounceOriginalMsgInfo {
            valueCoins: grams("0.05"),
            valueExtra: [],
            createdLt: 0,
            createdAt: 0,
        }.toCell(),
        bouncedByPhase: 1,
        exitCode: 42,
        computePhase: RichBounceComputePhaseInfo {
            gasUsed: 100,
            vmSteps: 10,
        },
    };

    val bouncedMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: contract.address,
        body: bounceBody,
    }).bounced();

    testing.processSingleTraceStep(
        attacker.address,
        bouncedMessage,
    );

    val saved = contract.escrowRecord(1);
    assert (saved != null) throw Errors.InvalidEscrow;
    expect(saved!!.status).toEqual(6);
}

// 测试：空 Bounce Body 被安全忽略
get fun `test empty bounced body is safely ignored`() {
    val (contract, _, _) = setupDepositedEscrowTest();

    val bouncedMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: contract.address,
    }).bounced();

    val result = testing.processSingleTraceStep(
        contract.marketplace(),
        bouncedMessage,
    );

    val tx = result.tx.load();
    val description = tx.description.load();
    if (description is TlbTransOrd) {
        val compute = description.computePh;
        if (compute is TlbTrComputeVm) {
            expect(compute.data.load().exitCode).toEqual(0);
        } else {
            throw Errors.InvalidMessage;
        }
    } else {
        throw Errors.InvalidMessage;
    }

    val saved = contract.escrowRecord(1);
    assert (saved != null) throw Errors.InvalidEscrow;
    expect(saved!!.status).toEqual(2);
}

// 测试：Only256BitsOfBody 只有前缀时被安全忽略
get fun `test bounced body with prefix only is safely ignored`() {
    val (contract, _, _) = setupDepositedEscrowTest();

    val bounceBody = beginCell().storeUint(0xffffffff, 32).endCell();

    val bouncedMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: contract.address,
        body: bounceBody.beginParse(),
    }).bounced();

    val result = testing.processSingleTraceStep(
        contract.marketplace(),
        bouncedMessage,
    );

    val tx = result.tx.load();
    val description = tx.description.load();
    if (description is TlbTransOrd) {
        val compute = description.computePh;
        if (compute is TlbTrComputeVm) {
            expect(compute.data.load().exitCode).toEqual(0);
        } else {
            throw Errors.InvalidMessage;
        }
    } else {
        throw Errors.InvalidMessage;
    }

    val saved = contract.escrowRecord(1);
    assert (saved != null) throw Errors.InvalidEscrow;
    expect(saved!!.status).toEqual(2);
}
