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
        assetListings: [],
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

    // 先暂停 Escrow，制造一次真实的 CreateEscrow bounce。
    // Marketplace 必须解析 RichBounce，但保持商品 Pending 和 NFT 索引占用。
    val pauseEscrowRes = escrow.sendAny(
        deployer.address,
        SetEscrowPaused { paused: true }.toCell(),
        { value: grams("0.05") },
    );
    expect(pauseEscrowRes).toHaveSuccessfulTx<SetEscrowPaused>({
        from: deployer.address,
        to: escrow.address,
    });

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

    // 断言 Escrow 的拒绝触发了 bounced message，且 Marketplace 的 bounce handler 成功执行。
    expect(publishRes).toHaveBouncedTx({
        from: escrow.address,
        to: marketplace.address,
    });
    expect(publishRes).toHaveSuccessfulTx({
        from: escrow.address,
        to: marketplace.address,
        bounced: true,
    });

    // 首次 CreateEscrow bounce 不能释放 NFT 唯一上架索引。
    val duplicateAfterInitialBounceRes = marketplace.sendAny(
        seller.address,
        publishBody,
        { value: grams("0.1") },
    );
    expect(duplicateAfterInitialBounceRes).toHaveFailedTx({
        from: seller.address,
        to: marketplace.address,
        exitCode: Errors.AssetAlreadyListed,
    });
    val stillPendingAfterInitialBounce = marketplace.product(1);
    assert (stillPendingAfterInitialBounce != null) throw Errors.ProductNotFound;
    expect(stillPendingAfterInitialBounce!!.status).toEqual(1);

    // 使用真实匹配的原始 CreateEscrow 数据构造 RichBounce，但由非 Escrow 地址发送。
    // 即使攻击者伪造了完整商品身份，Marketplace 也必须只信任配置的 Escrow sender。
    val forgedOriginalBody = CreateEscrow {
        nftItem: nftItem,
        collection: collection.address,
        seller: seller.address,
        productId: 1,
        kind: 3,
        extra: CreateEscrowExtra {
            queryId: 1,
            createdAt: 0,
            itemIndex: 0,
        }.toCell(),
    }.toCell();
    val forgedRichBounce = RichBounceBody {
        originalBody: forgedOriginalBody,
        originalInfo: RichBounceOriginalMsgInfo {
            valueCoins: grams("0.05"),
            valueExtra: [],
            createdLt: 0,
            createdAt: 0,
        }.toCell(),
        bouncedByPhase: 1,
        exitCode: Errors.EscrowPaused,
        computePhase: null,
    };
    val forgedBounceMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: marketplace.address,
        body: forgedRichBounce,
    }).bounced();
    val forgedBounceRes = net.send(collection.address, forgedBounceMessage);
    expect(forgedBounceRes).toHaveSuccessfulTx({
        from: collection.address,
        to: marketplace.address,
        bounced: true,
    });

    // 来自真实 Escrow 地址、但使用错误操作码的 bounced body 必须被忽略。
    val wrongOpcodeBounceMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: marketplace.address,
        body: beginCell().storeUint(0x12345678, 32).endCell(),
    }).bounced();
    val wrongOpcodeBounceRes = net.send(escrow.address, wrongOpcodeBounceMessage);
    expect(wrongOpcodeBounceRes).toHaveSuccessfulTx({
        from: escrow.address,
        to: marketplace.address,
        bounced: true,
    });

    // RichBounce prefix 存在，但 envelope 的其余字段缺失。
    // RichBounceBody.fromSlice 必须在 try/catch 中失败并被安全忽略。
    val truncatedEnvelopeMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: marketplace.address,
        body: beginCell().storeUint(0xfffffffe, 32).endCell(),
    }).bounced();
    val truncatedEnvelopeRes = net.send(escrow.address, truncatedEnvelopeMessage);
    expect(truncatedEnvelopeRes).toHaveSuccessfulTx({
        from: escrow.address,
        to: marketplace.address,
        bounced: true,
    });

    // RichBounce envelope 本身有效，但原始 CreateEscrow body 被截断（只有 opcode）。
    // 解析缺字段时必须由 handler 捕获异常，不能让 bounced transaction 失败。
    val truncatedOriginalBody = beginCell().storeUint(0x71a00001, 32).endCell();
    val truncatedRichBounce = RichBounceBody {
        originalBody: truncatedOriginalBody,
        originalInfo: RichBounceOriginalMsgInfo {
            valueCoins: grams("0.05"),
            valueExtra: [],
            createdLt: 0,
            createdAt: 0,
        }.toCell(),
        bouncedByPhase: 1,
        exitCode: Errors.EscrowPaused,
        computePhase: null,
    };
    val truncatedBounceMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: marketplace.address,
        body: truncatedRichBounce,
    }).bounced();
    val truncatedBounceRes = net.send(escrow.address, truncatedBounceMessage);
    expect(truncatedBounceRes).toHaveSuccessfulTx({
        from: escrow.address,
        to: marketplace.address,
        bounced: true,
    });

    // CreateEscrow 的字段完整，但 extra 引用单元缺少必需字段。
    // 这会在 create.extra.load() 阶段触发解析错误，也必须被 try/catch 吞掉。
    val truncatedExtraCell = beginCell().storeUint(1, 64).endCell();
    val createEscrowWithTruncatedExtra = beginCell()
        .storeUint(0x71a00001, 32)
        .storeAddress(nftItem)
        .storeAddress(collection.address)
        .storeAddress(seller.address)
        .storeUint(1, 64)
        .storeUint(3, 8)
        .storeRef(truncatedExtraCell)
        .endCell();
    val truncatedExtraRichBounce = RichBounceBody {
        originalBody: createEscrowWithTruncatedExtra,
        originalInfo: RichBounceOriginalMsgInfo {
            valueCoins: grams("0.05"),
            valueExtra: [],
            createdLt: 0,
            createdAt: 0,
        }.toCell(),
        bouncedByPhase: 1,
        exitCode: Errors.EscrowPaused,
        computePhase: null,
    };
    val truncatedExtraBounceMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: marketplace.address,
        body: truncatedExtraRichBounce,
    }).bounced();
    val truncatedExtraBounceRes = net.send(escrow.address, truncatedExtraBounceMessage);
    expect(truncatedExtraBounceRes).toHaveSuccessfulTx({
        from: escrow.address,
        to: marketplace.address,
        bounced: true,
    });

    // 畸形/无关 Bounce 处理后，Pending 商品及 NFT 唯一索引必须保持不变。
    val pendingAfterMalformedBounce = marketplace.product(1);
    assert (pendingAfterMalformedBounce != null) throw Errors.ProductNotFound;
    expect(pendingAfterMalformedBounce!!.status).toEqual(1);
    val duplicateAfterMalformedBounce = marketplace.sendAny(
        seller.address,
        publishBody,
        { value: grams("0.1") },
    );
    expect(duplicateAfterMalformedBounce).toHaveFailedTx({
        from: seller.address,
        to: marketplace.address,
        exitCode: Errors.AssetAlreadyListed,
    });

    // 两类伪造/无关 Bounce 都不得改变商品状态或释放 NFT 唯一上架索引。
    val pendingAfterAdversarialBounces = marketplace.product(1);
    assert (pendingAfterAdversarialBounces != null) throw Errors.ProductNotFound;
    expect(pendingAfterAdversarialBounces!!.status).toEqual(1);
    val duplicateAfterAdversarialBounces = marketplace.sendAny(
        seller.address,
        publishBody,
        { value: grams("0.1") },
    );
    expect(duplicateAfterAdversarialBounces).toHaveFailedTx({
        from: seller.address,
        to: marketplace.address,
        exitCode: Errors.AssetAlreadyListed,
    });

    // 管理员在 Escrow 仍暂停时重试一次，验证重试消息也保留完整 RichBounce。
    val retryWhilePausedRes = marketplace.sendAny(
        deployer.address,
        RetryCreateEscrow { productId: 1 }.toCell(),
        { value: grams("0.1") },
    );
    expect(retryWhilePausedRes).toHaveSuccessfulTx<RetryCreateEscrow>({
        from: deployer.address,
        to: marketplace.address,
    });
    expect(retryWhilePausedRes).toHaveBouncedTx({
        from: escrow.address,
        to: marketplace.address,
    });
    expect(retryWhilePausedRes).toHaveSuccessfulTx({
        from: escrow.address,
        to: marketplace.address,
        bounced: true,
    });

    // 重试请求再次 bounce 后，商品仍为 Pending，NFT 索引仍被原商品占用。
    val stillPendingAfterRetryBounce = marketplace.product(1);
    assert (stillPendingAfterRetryBounce != null) throw Errors.ProductNotFound;
    expect(stillPendingAfterRetryBounce!!.status).toEqual(1);
    val duplicateAfterRetryBounceRes = marketplace.sendAny(
        seller.address,
        publishBody,
        { value: grams("0.1") },
    );
    expect(duplicateAfterRetryBounceRes).toHaveFailedTx({
        from: seller.address,
        to: marketplace.address,
        exitCode: Errors.AssetAlreadyListed,
    });

    // 解除暂停后，由管理员按原 query/product identity 重试；不创建第二个商品。
    val unpauseEscrowRes = escrow.sendAny(
        deployer.address,
        SetEscrowPaused { paused: false }.toCell(),
        { value: grams("0.05") },
    );
    expect(unpauseEscrowRes).toHaveSuccessfulTx<SetEscrowPaused>({
        from: deployer.address,
        to: escrow.address,
    });

    val retryCreateEscrowRes = marketplace.sendAny(
        deployer.address,
        RetryCreateEscrow { productId: 1 }.toCell(),
        { value: grams("0.1") },
    );
    expect(retryCreateEscrowRes).toHaveSuccessfulTx<RetryCreateEscrow>({
        from: deployer.address,
        to: marketplace.address,
    });
    expect(retryCreateEscrowRes).toHaveSuccessfulTx<CreateEscrow>({
        from: marketplace.address,
        to: escrow.address,
    });

    // 同一 NFT 在首次托管尚未完成时也不能创建第二个商品。
    val duplicatePublishRes = marketplace.sendAny(
        seller.address,
        publishBody,
        { value: grams("0.1") },
    );
    expect(duplicatePublishRes).toHaveFailedTx({
        from: seller.address,
        to: marketplace.address,
        exitCode: Errors.AssetAlreadyListed,
    });

    val pendingExtra = pendingProduct!!.extra.load();

    expect(pendingExtra.collection).toEqual(collection.address);
    expect(pendingExtra.queryId).toEqual(1);

    // 检查 Escrow 已收到 Marketplace 的托管请求
    val pendingRecord = escrow.escrowRecord(1);

    assert (pendingRecord != null) throw Errors.InvalidEscrow;

    expect(pendingRecord!!.status).toEqual(1);
    expect(pendingRecord!!.nftItem).toEqual(nftItem);
    expect(pendingRecord!!.seller).toEqual(seller.address);

    // Escrow 对相同 queryId 的精确 CreateEscrow 重放必须幂等，不创建第二条记录。
    val exactCreateReplay = CreateEscrow {
        nftItem: nftItem,
        collection: collection.address,
        seller: seller.address,
        productId: 1,
        kind: 3,
        extra: CreateEscrowExtra {
            queryId: 1,
            createdAt: 0,
            itemIndex: 0,
        }.toCell(),
    }.toCell();
    val exactPendingReplayRes = escrow.sendAny(
        marketplace.address,
        exactCreateReplay,
        { value: grams("0.05") },
    );
    expect(exactPendingReplayRes).toHaveSuccessfulTx<CreateEscrow>({
        from: marketplace.address,
        to: escrow.address,
    });
    expect(escrow.escrowRecord(1)!!.status).toEqual(1);
    expect(escrow.escrowIdByQueryId(1)).toEqual(1);

    // 相同 queryId 但修改 NFT、seller、collection 或 itemIndex 都必须拒绝，
    // 且不能覆盖原托管记录。
    val otherSeller = testing.treasury("replayOtherSeller");
    val changedNftReplayRes = escrow.sendAny(
        marketplace.address,
        CreateEscrow {
            nftItem: collection.address,
            collection: collection.address,
            seller: seller.address,
            productId: 1,
            kind: 3,
            extra: CreateEscrowExtra {
                queryId: 1,
                createdAt: 0,
                itemIndex: 0,
            }.toCell(),
        }.toCell(),
        { value: grams("0.05") },
    );
    expect(changedNftReplayRes).toHaveFailedTx({
        from: marketplace.address,
        to: escrow.address,
        exitCode: Errors.EscrowAlreadyExists,
    });
    val changedSellerReplayRes = escrow.sendAny(
        marketplace.address,
        CreateEscrow {
            nftItem: nftItem,
            collection: collection.address,
            seller: otherSeller.address,
            productId: 1,
            kind: 3,
            extra: CreateEscrowExtra {
                queryId: 1,
                createdAt: 0,
                itemIndex: 0,
            }.toCell(),
        }.toCell(),
        { value: grams("0.05") },
    );
    expect(changedSellerReplayRes).toHaveFailedTx({
        from: marketplace.address,
        to: escrow.address,
        exitCode: Errors.EscrowAlreadyExists,
    });
    val changedCollectionReplayRes = escrow.sendAny(
        marketplace.address,
        CreateEscrow {
            nftItem: nftItem,
            collection: seller.address,
            seller: seller.address,
            productId: 1,
            kind: 3,
            extra: CreateEscrowExtra {
                queryId: 1,
                createdAt: 0,
                itemIndex: 0,
            }.toCell(),
        }.toCell(),
        { value: grams("0.05") },
    );
    expect(changedCollectionReplayRes).toHaveFailedTx({
        from: marketplace.address,
        to: escrow.address,
        exitCode: Errors.EscrowAlreadyExists,
    });
    val changedItemIndexReplayRes = escrow.sendAny(
        marketplace.address,
        CreateEscrow {
            nftItem: nftItem,
            collection: collection.address,
            seller: seller.address,
            productId: 1,
            kind: 3,
            extra: CreateEscrowExtra {
                queryId: 1,
                createdAt: 0,
                itemIndex: 1,
            }.toCell(),
        }.toCell(),
        { value: grams("0.05") },
    );
    expect(changedItemIndexReplayRes).toHaveFailedTx({
        from: marketplace.address,
        to: escrow.address,
        exitCode: Errors.EscrowAlreadyExists,
    });
    expect(escrow.escrowRecord(1)!!.nftItem).toEqual(nftItem);
    expect(escrow.escrowRecord(1)!!.seller).toEqual(seller.address);
    expect(escrow.escrowRecord(1)!!.status).toEqual(1);

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

    // NFT 已入库后，完全相同的 CreateEscrow 重放仍只能命中原记录，不能重置状态。
    val exactDepositedReplayRes = escrow.sendAny(
        marketplace.address,
        exactCreateReplay,
        { value: grams("0.05") },
    );
    expect(exactDepositedReplayRes).toHaveSuccessfulTx<CreateEscrow>({
        from: marketplace.address,
        to: escrow.address,
    });
    expect(escrow.escrowRecord(1)!!.status).toEqual(2);

    // 检查 Escrow 已回调 Marketplace，商品变为在售
    val activeProduct = marketplace.product(1);

    assert (activeProduct != null) throw Errors.ProductNotFound;

    expect(activeProduct!!.status).toEqual(2);
    expect(activeProduct!!.assetAddress).toEqual(nftItem);
    expect(activeProduct!!.seller).toEqual(seller.address);

    val activeExtra = activeProduct!!.extra.load();

    expect(activeExtra.collection).toEqual(collection.address);
    expect(activeExtra.queryId).toEqual(1);

    // 模拟旧的、身份完全匹配的 CreateEscrow Bounce 在商品已激活后迟到。
    // 迟到 Bounce 不能把 Active 商品回滚为 Pending，也不能释放 NFT 索引。
    val lateBounceMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: marketplace.address,
        body: forgedRichBounce,
    }).bounced();
    val lateBounceRes = net.send(escrow.address, lateBounceMessage);
    expect(lateBounceRes).toHaveSuccessfulTx({
        from: escrow.address,
        to: marketplace.address,
        bounced: true,
    });
    val productAfterLateBounce = marketplace.product(1);
    assert (productAfterLateBounce != null) throw Errors.ProductNotFound;
    expect(productAfterLateBounce!!.status).toEqual(2);
    val duplicateAfterLateBounce = marketplace.sendAny(
        seller.address,
        publishBody,
        { value: grams("0.1") },
    );
    expect(duplicateAfterLateBounce).toHaveFailedTx({
        from: seller.address,
        to: marketplace.address,
        exitCode: Errors.AssetAlreadyListed,
    });

    // 模拟 Marketplace 暂时无法认证 Escrow 回调的情况。
    // NFT 退款本身仍可完成，但 EscrowRefunded 回调必须保留待确认记录。
    val misconfigureEscrowRes = marketplace.sendAny(
        deployer.address,
        SetEscrowAddress { escrow: deployer.address }.toCell(),
        { value: grams("0.05") },
    );
    expect(misconfigureEscrowRes).toHaveSuccessfulTx<SetEscrowAddress>();

    // 第一步只执行 Escrow 的 RequestRefund 交易，不递归投递 NFT Transfer。
    // 这样可以在链上状态确实进入 RefundPending 后，单独模拟 NFT Item 的 RichBounce。
    val refundMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: escrow.address,
        body: RequestRefund { escrowId: 1 },
    });
    val refundRequestStep = testing.processSingleTraceStep(seller.address, refundMessage);

    val refundPendingRecord = escrow.escrowRecord(1);
    assert (refundPendingRecord != null) throw Errors.InvalidEscrow;
    expect(refundPendingRecord!!.status).toEqual(6);

    // 模拟刚才由 Escrow 发出的、身份完全匹配的 TEP-62 Transfer 被 NFT Item Bounce。
    // Bounce body 保留完整原始 Transfer body，sender 必须是记录中的精确 NFT Item。
    val bouncedRefundTransferBody = NftTransfer {
        queryId: 1,
        newOwner: seller.address,
        responseDestination: escrow.address,
        customPayload: null,
        forwardAmount: grams("0.01"),
        forwardPayload: beginCell().endCell().beginParse(),
    }.toCell();
    val bouncedRefundTransfer = RichBounceBody {
        originalBody: bouncedRefundTransferBody,
        originalInfo: RichBounceOriginalMsgInfo {
            valueCoins: grams("0.05"),
            valueExtra: [],
            createdLt: 0,
            createdAt: 0,
        }.toCell(),
        bouncedByPhase: 1,
        exitCode: Errors.InvalidMessage,
        computePhase: null,
    };
    val refundTransferBounceMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: escrow.address,
        body: bouncedRefundTransfer,
    }).bounced();
    val refundTransferBounceRes = testing.processSingleTraceStep(
        nftItem,
        refundTransferBounceMessage,
    );
    expect(refundTransferBounceRes.tx.load().description.computePhase!!.exitCode).toEqual(0);

    // 只有精确 NFT Item + queryId + newOwner + responseDestination + RefundPending
    // 全部匹配时，Bounce handler 才将状态恢复为 Deposited。
    val restoredDepositedRecord = escrow.escrowRecord(1);
    assert (restoredDepositedRecord != null) throw Errors.InvalidEscrow;
    expect(restoredDepositedRecord!!.status).toEqual(2);

    // 再次正常申请退款，Emulator 递归处理 Escrow 与真实 NFT 的完整交易链。
    val refundRetryMessage = createMessage({
        bounce: false,
        value: grams("0.05"),
        dest: escrow.address,
        body: RequestRefund { escrowId: 1 },
    });
    val refundRes = net.send(seller.address, refundRetryMessage);

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

    // NFT 已退回，但 Marketplace 拒绝错误 Escrow 身份的回调时，
    // 商品仍保持 Active，且 NFT listing reservation 不得提前释放。
    val productBeforeRefundAck = marketplace.product(1);
    assert (productBeforeRefundAck != null) throw Errors.ProductNotFound;
    expect(productBeforeRefundAck!!.status).toEqual(2);
    val duplicateBeforeRefundAck = marketplace.sendAny(
        seller.address,
        publishBody,
        { value: grams("0.1") },
    );
    expect(duplicateBeforeRefundAck).toHaveFailedTx({
        from: seller.address,
        to: marketplace.address,
        exitCode: Errors.AssetAlreadyListed,
    });

    // 恢复正确 Escrow 身份后，管理员重试仍待确认的退款回调。
    val restoreEscrowRes = marketplace.sendAny(
        deployer.address,
        SetEscrowAddress { escrow: escrow.address }.toCell(),
        { value: grams("0.05") },
    );
    expect(restoreEscrowRes).toHaveSuccessfulTx<SetEscrowAddress>();
    val retryRefundCallbackRes = escrow.sendAny(
        deployer.address,
        RetryRefundCallback { escrowId: 1 }.toCell(),
        { value: grams("0.05") },
    );
    expect(retryRefundCallbackRes).toHaveSuccessfulTx<RetryRefundCallback>({
        from: deployer.address,
        to: escrow.address,
    });

    // 只有 Marketplace 接受认证回调后，商品才取消并释放 NFT 索引。
    val productAfterRefundAck = marketplace.product(1);
    assert (productAfterRefundAck != null) throw Errors.ProductNotFound;
    expect(productAfterRefundAck!!.status).toEqual(5);

    // 退款完成后，旧 CreateEscrow 请求必须拒绝，不能复活已退款托管记录。
    val staleCreateReplayRes = escrow.sendAny(
        marketplace.address,
        exactCreateReplay,
        { value: grams("0.05") },
    );
    expect(staleCreateReplayRes).toHaveFailedTx({
        from: marketplace.address,
        to: escrow.address,
        exitCode: Errors.EscrowAlreadyExists,
    });
    expect(escrow.escrowRecord(1)!!.status).toEqual(4);

    // 检查 Marketplace 收到退款确认后自动取消商品
    val cancelledProduct = marketplace.product(1);

    assert (cancelledProduct != null) throw Errors.ProductNotFound;

    expect(cancelledProduct!!.status).toEqual(5);

    // 确认 NFT 已退回卖家后，允许同一 NFT 重新发布为新商品。
    val republishRes = marketplace.sendAny(
        seller.address,
        publishBody,
        { value: grams("0.1") },
    );
    expect(republishRes).toHaveSuccessfulTx<PublishProduct>({
        from: seller.address,
        to: marketplace.address,
    });
    val republishedProduct = marketplace.product(2);
    assert (republishedProduct != null) throw Errors.ProductNotFound;
    expect(republishedProduct!!.assetAddress).toEqual(nftItem);
    expect(republishedProduct!!.status).toEqual(1);

    // 旧商品的重复退款通知只能被 ACK，不能释放新商品占用的 NFT 索引。
    val staleRefundRes = marketplace.sendAny(
        escrow.address,
        EscrowRefunded {
            queryId: 1,
            productId: 1,
            nftItem: nftItem,
            seller: seller.address,
        }.toCell(),
        { value: grams("0.05") },
    );
    expect(staleRefundRes).toHaveSuccessfulTx<EscrowRefunded>({
        from: escrow.address,
        to: marketplace.address,
    });

    val thirdPublishRes = marketplace.sendAny(
        seller.address,
        publishBody,
        { value: grams("0.1") },
    );
    expect(thirdPublishRes).toHaveFailedTx({
        from: seller.address,
        to: marketplace.address,
        exitCode: Errors.AssetAlreadyListed,
    });
}
