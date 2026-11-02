import "@acton/fmt"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

import "@acton/types/message"
import "@contracts/types"
import "@wrappers/Marketplace.gen"
import "@wrappers/NFTEscrow.gen"

// 使用已验证的 Fragment Desk Calendar 官方 Item Code 推导 NFT 地址。
// 这里只推导地址，不代表部署了真实官方 NFT 合约。
fun deriveDeskCalendarNftItem(collection: address, itemIndex: uint256): address {
    val code = parseCellFromHex("b5ee9c72010101010023000842022498bd63f3e9cc2c20c79abe58899a4816ea156855b8d4fcd47cda4bae9e911a");
    val config = beginCell().storeUint(itemIndex, 256).storeAddress(collection).endCell();
    val data = beginCell().storeRef(config).storeUint(0, 1).endCell();
    val stateInit: ContractState = { code: code, data: data };
    return AutoDeployAddress {
        workchain: 0,
        stateInit: stateInit,
    }.calculateAddress();
}

get fun `test Marketplace publishes NFT and Escrow activates product after deposit`() {
    testing.registerLibrary(
        parseCellFromHex("b5ee9c72010226010007f4000114ff00f4a413f4bcf2c80b0102012003020064f230f8276f10ed44d0d4f404d1d0fa40d4f404d4d14533237ff02732034414c85004cf1612ccf400ccc901c8ccf400c9ed540201480d040201200a05020120090602012008070067b74a7da89a1a9e809a263a1f481a9e809a9a226be0640dd2e60dae0a8e00041c1a1a9a9a263a1f481f401f401a60fa63fa63fa300097b7d05da89a1a9e809a263a1f481a9e809a9a226be0640dde5a1b7a1a9a9a261a1e809f401a63fa2dae0a608dd226b3abe0605a1f481f401a63fa28889c4450413c267017727083e67bcaa430005db8fcfed44d0d4f404d101d0d3fffa40d1226e9632708b02136de002d0fa40d4f404d4d15bd0d4f404d4d15b7f444480201200c0b0039b8ed7ed44d0d4f404d131d0fa40d4f404d4d16c31d0d30fd30ffa40d180067b8f82ed44d0d4f404d131d0fa40d4f404d4d110235f03d0d4f404d4d16c21d0d30701aa02d7180101d30701aa02d7180101d13080202ca1a0e020148160f020148111000714fa40fa00d4d4d4d43001f029206e935f076de010364540f0288b02511370f02732136d500502c8ccf400ccc959c85004cf1612ccf400ccc98020120131200cb08343e903e803e8034c1f4c7f4c7f44d4920c7ac016085dfffffffec092082e4e1c02e4930c01455ae456c052c40b04044ac406082024ea02f2c4870406c486082784ce02f2c64d7c11b7800a5407e08e80077db4080b23d00007e80b2c7f24040723333326002eb3435353440743d013e8034c7f4483080086082784ce02eec24fe08e8379490ae7cb434c8b43e903e803e8034c1f4c7f4c7f44c0cccd45dbe08f21400f3c5807e80b2c7f27e08d62804ed8249b080149a2f85ec249c0db78920840ee6b28028006999056a2998e0192a41052d82485ba44c78c39400e01514002002c8f40001fa02cb1fc90101c8ccccc900a401d0fa40fa00d31fd130268209c9c380a101b60820c2008e368210557cea20f825221034596d71708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb0015a104915be20201f4191701f308b435353440743d013e8034c7f44c483080086082784ce02eec3e08d62e6c6497c1380d0064be0037889ba4d7c0db78343e903e803e8034c1f4c7f4c7f457c140b43e903e8034c7f440f434c3f4c3fe90345c20840144e3647e0960840e049f7848f2140373c587328006f2c7c9be808632c7c990c5122a9c601800a2708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb0020c20026c200b05345c705b3b08e12544116a9845240b6085144a14554f026431393303233e21023f026016d008d08a0827270e028406d82083080238d20840dc3fb147e0948840d165b5c9c20043232c15401f3c594017e808572da84b2c7f2cfc89ba44ca51633c5c0788072407ec0286456f8a004f7d7b68bb7efe09dbc400b434c0c05c6c2497c1383e903e900c7e800c7d010c7e800c7e800c1cea6d0008b1c0245c2540b4c7d40cf8bb5134353d0134487434fffe903454c1b1c178c0889bbcb43480b43e90353d01353449e0841a4f4e542eb8c089e0840bf2c9a8aeb8c08d0d0970000a62d88dd1bdc1d5c231c16c22524231b03f629d74ac000b0925f0be0236e8e2c519aa140132370f027206e8e1954719026c85004cf1612ccf400ccc9525001c8ccf400c9ed54de512aa04319df258210371638aebae302236e8e2a363703c000f2e0d610364470f02841302370f027324313c85004cf1612ccf400ccc901c8ccf400c9ed54e13a24c000e3022422211c02fc8210487a8e81ba8e68323333355321c705f2e0dc03d33fd430f029206ef2d0df10234604c85004cf1612ccf400ccc9218e3213708210a37a098358056d8040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb00923330e20101c8ccf400c9ed54e00482105fcc3d14bae3025f091e1d0006f2c0d002c85153c705f2e0d806505301d33ffa40fa40f404fa003223fa4430c000f2e14d078209c9c380a127945375a0a1de22d70b01c300209206a19136e220c2fff2e0ce27941027365be30d0293135f03e30d4433c85004cf1612ccf400ccc901c8ccf400c9ed54201f007223fa4430c000f2e14d43308210d53276db016d71708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb00007e821005138d91c85008cf1658cf1671245146104a10395092708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb0010340014375f053331c705f2e0d700ee35353737266ef2d0db5dc705f2e0dc04d33f3006d0d4d4d130d0f404fa00d31fd15b6ef2e0dd586d5005c85004cf1612ccf400ccc9238e3312708210a37a098358056d8040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb0001926c22e201c8ccf400c9ed5400845f0450785f0501d33f307082108b77173505c8cbff5004cf1610248040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb00007a3b5f0833d33f30708210a8cb00adc804d014cf1643308040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb0000be5b333335048210299a3e15baf2e0d5036e8e1466f02a206e9b3101c8ccf400c9ed54db31e13031926c21e2fa4030708210a43227e1f8256d8040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb00"),
    );

    val deployer = testing.treasury("integrationDeployer");
    val seller = testing.treasury("integrationSeller");
    val collection = testing.treasury("integrationCollection");

    // 部署 Marketplace
    val marketplace = Marketplace.fromStorage({
        owner: deployer.address,
        escrow: deployer.address,
        escrowConfigured: false,
        nextProductId: 1,
        nextOrderId: 1,
        products: [],
        orders: [],
    });

    val marketplaceDeploy = marketplace.deploy(
        deployer.address,
        { value: grams("0.05") },
    );

    expect(marketplaceDeploy).toHaveSuccessfulDeploy({
        to: marketplace.address,
    });

    // 部署 NFTEscrow
    val escrow = NFTEscrow.fromStorage({
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

    val escrowDeploy = escrow.deploy(
        deployer.address,
        { value: grams("0.05") },
    );

    expect(escrowDeploy).toHaveSuccessfulDeploy({
        to: escrow.address,
    });

    // 管理员配置 Marketplace 的 Escrow 地址
    val configureBody = SetEscrowAddress { escrow: escrow.address }.toCell();

    val configureRes = marketplace.sendAny(
        deployer.address,
        configureBody,
        { value: grams("0.05") },
    );

    expect(configureRes).toHaveSuccessfulTx<SetEscrowAddress>({
        from: deployer.address,
        to: marketplace.address,
    });

    // 管理员先登记暂停状态的 Collection
    val registerRes = escrow.sendSetCollectionStatus(
        deployer.address,
        collection.address,
        2,
        { value: grams("0.05") },
    );
    expect(registerRes).toHaveSuccessfulTx<SetCollectionStatus>();

    // 使用已验证的 Fragment Desk Calendar 官方 Gift Item Code。
    val officialGiftItemCode = parseCellFromHex("b5ee9c72010101010023000842022498bd63f3e9cc2c20c79abe58899a4816ea156855b8d4fcd47cda4bae9e911a");
    val codeRes = escrow.sendSetCollectionItemCode(
        deployer.address,
        collection.address,
        3,
        officialGiftItemCode,
        { value: grams("0.05") },
    );
    expect(codeRes).toHaveSuccessfulTx<SetCollectionItemCode>();

    // 配置完成后激活 Collection
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

    // 使用官方 Desk Calendar Item Code 部署真实 NFT。
    val code = parseCellFromHex("b5ee9c72010101010023000842022498bd63f3e9cc2c20c79abe58899a4816ea156855b8d4fcd47cda4bae9e911a");

    expect(code.hash()).toEqual(
        0x8b711e6809672c0335dc61d1da1dcc4059c973248af707bd586245085ea70b32,
    );

    val config = beginCell().storeUint(0, 256).storeAddress(collection.address).endCell();

    val data = beginCell().storeRef(config).storeUint(0, 1).endCell();

    val stateInit: ContractState = { code: code, data: data };

    val destination = AutoDeployAddress {
        workchain: 0,
        stateInit: stateInit,
    };

    val nftItem = destination.calculateAddress();

    val tokenInfo = beginCell()
        .storeUint(1, 8)
        .storeUint(65, 8)
        .storeUint(1, 8)
        .storeUint(66, 8)
        .endCell();

    val nftContent = beginCell().storeUint(1, 8).storeUint(120, 8).endCell();

    val auctionConfig = beginCell()
        .storeAddress(collection.address)
        .storeCoins(grams("1"))
        .storeCoins(grams("1"))
        .storeUint(1, 8)
        .storeUint(60, 32)
        .storeUint(3600, 32)
        .endCell();

    val royaltyParams = beginCell()
        .storeUint(0, 16)
        .storeUint(100, 16)
        .storeAddress(collection.address)
        .endCell();

    val deployBody = beginCell()
        .storeUint(0x299a3e15, 32)
        .storeAddress(seller.address)
        .storeCoins(grams("1"))
        .storeRef(tokenInfo)
        .storeRef(nftContent)
        .storeRef(auctionConfig)
        .storeRef(royaltyParams)
        .endCell();

    val deployMessage = createMessage({
        bounce: false,
        value: grams("1.5"),
        dest: destination,
        body: deployBody,
    });

    val deployResult = net.send(collection.address, deployMessage);

    expect(deployResult).toHaveSuccessfulTx({
        from: collection.address,
        to: nftItem,
    });

    val deployedGetter = net.runGetMethodExt<tuple>(
        nftItem,
        "get_nft_data",
    );

    expect(deployedGetter.isSuccess()).toEqual(true);
    val deployedStack = deployedGetter.unwrap();
    expect(deployedStack.get(3) as address).toEqual(seller.address);

    // 卖家通过 Marketplace 发布 NFT 商品
    val publishBody = PublishProduct {
        kind: 3,
        nftItem: nftItem,
        collection: collection.address,
        itemIndex: 0,
        price: grams("1"),
        deliveryMode: 1,
        createdAt: 1793366400,
    }.toCell();

    val publishRes = marketplace.sendAny(
        seller.address,
        publishBody,
        { value: grams("0.1") },
    );

    expect(publishRes).toHaveSuccessfulTx<PublishProduct>({
        from: seller.address,
        to: marketplace.address,
    });

    // 检查 Marketplace 商品处于待托管状态
    val pendingProduct = marketplace.product(1);

    assert (pendingProduct != null) throw Errors.ProductNotFound;

    expect(pendingProduct!!.id).toEqual(1);
    expect(pendingProduct!!.seller).toEqual(seller.address);
    expect(pendingProduct!!.assetAddress).toEqual(nftItem);
    expect(pendingProduct!!.status).toEqual(1);

    val pendingExtra = pendingProduct!!.extra.load();

    expect(pendingExtra.collection).toEqual(collection.address);
    expect(pendingExtra.queryId).toEqual(1);

    // 检查 Escrow 已收到 Marketplace 的托管请求
    val pendingRecord = escrow.escrowRecord(1);

    assert (pendingRecord != null) throw Errors.InvalidEscrow;

    expect(pendingRecord!!.status).toEqual(1);
    expect(pendingRecord!!.nftItem).toEqual(nftItem);
    expect(pendingRecord!!.seller).toEqual(seller.address);

    // 构造 NFT 转移所需的 forward_payload
    val payloadCell = beginCell().storeUint(0x53564950, 32).storeUint(1, 64).endCell();

    val forwardPayload = beginCell().storeUint(1, 1).storeRef(payloadCell).endCell().beginParse();

    // 卖家通过真实 TEP-62 Transfer 将官方 NFT 转入 Escrow。
    val depositTransfer = NftTransfer {
        queryId: 1,
        newOwner: escrow.address,
        responseDestination: seller.address,
        customPayload: null,
        forwardAmount: grams("0.01"),
        forwardPayload: forwardPayload,
    };

    val depositMessage = createMessage({
        bounce: false,
        value: grams("0.1"),
        dest: nftItem,
        body: depositTransfer,
    });

    val depositRes = net.send(seller.address, depositMessage);

    expect(depositRes).toHaveSuccessfulTx({
        from: seller.address,
        to: nftItem,
    });

    val depositedGetter = net.runGetMethodExt<tuple>(
        nftItem,
        "get_nft_data",
    );

    expect(depositedGetter.isSuccess()).toEqual(true);
    val depositedStack = depositedGetter.unwrap();
    expect(depositedStack.get(3) as address).toEqual(escrow.address);

    // 检查 Escrow 已完成 NFT 入库
    val depositedRecord = escrow.escrowRecord(1);

    assert (depositedRecord != null) throw Errors.InvalidEscrow;

    expect(depositedRecord!!.status).toEqual(2);
    expect(depositedRecord!!.nftItem).toEqual(nftItem);
    expect(depositedRecord!!.seller).toEqual(seller.address);
    expect(escrow.escrowIdByQueryId(1)).toEqual(1);

    // 检查 Escrow 已回调 Marketplace，商品变为在售
    val activeProduct = marketplace.product(1);

    assert (activeProduct != null) throw Errors.ProductNotFound;

    expect(activeProduct!!.status).toEqual(2);
    expect(activeProduct!!.assetAddress).toEqual(nftItem);
    expect(activeProduct!!.seller).toEqual(seller.address);

    val activeExtra = activeProduct!!.extra.load();

    expect(activeExtra.collection).toEqual(collection.address);
    expect(activeExtra.queryId).toEqual(1);

    // 卖家申请退款，由 Emulator 递归处理 Escrow 与真实 NFT 的交易。
    val refundMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: escrow.address,
        body: RequestRefund { escrowId: 1 },
    });

    val refundRes = net.send(seller.address, refundMessage);

    expect(refundRes).toHaveSuccessfulTx({
        from: escrow.address,
        to: nftItem,
    });

    val refundedGetter = net.runGetMethodExt<tuple>(
        nftItem,
        "get_nft_data",
    );

    expect(refundedGetter.isSuccess()).toEqual(true);
    val refundedStack = refundedGetter.unwrap();
    expect(refundedStack.get(3) as address).toEqual(seller.address);

    // 检查真实 NFT 转账及 Excesses 确认后，Escrow 才标记退款完成。
    val refundedRecord = escrow.escrowRecord(1);

    assert (refundedRecord != null) throw Errors.InvalidEscrow;

    expect(refundedRecord!!.status).toEqual(4);

    // 检查 Marketplace 收到退款确认后自动取消商品
    val cancelledProduct = marketplace.product(1);

    assert (cancelledProduct != null) throw Errors.ProductNotFound;

    expect(cancelledProduct!!.status).toEqual(5);
}
