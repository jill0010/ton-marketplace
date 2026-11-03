import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

import "@contracts/types"
import "@wrappers/Marketplace.gen"

// 测试1：部署后正确读取初始管理员地址
get fun `test deploy exposes initial owner`() {
    val (contract, deployer, _) = setupMarketplaceTest();
    expect(contract.owner()).toEqual(deployer.address);
}

// 测试2：管理员可以转移所有权
get fun `test owner can transfer ownership`() {
    val (contract, deployer, notDeployer) = setupMarketplaceTest();

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

// 测试3：非管理员不能转移所有权
get fun `test non-owner cannot transfer ownership`() {
    val (contract, deployer, notDeployer) = setupMarketplaceTest();

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

// 测试4：未知消息返回错误，空消息允许通过
get fun `test unknown message fails with named error`() {
    val (contract, deployer, _) = setupMarketplaceTest();

    val res = contract.sendAny(
        deployer.address,
        beginCell().storeUint(0x999, 32).endCell(),
        { value: grams("0.05") },
    );
    expect(res).toHaveFailedTx({
        from: deployer.address,
        to: contract.address,
        exitCode: Errors.InvalidMessage,
    });

    val res2 = contract.sendAny(
        deployer.address,
        createEmptyCell(),
        { value: grams("0.05") },
    );
    expect(res2).toHaveSuccessfulTx({
        from: deployer.address,
        to: contract.address,
    });
}

// 测试5：Product 商品结构序列化
get fun `test Product serialization`() {
    val seller = testing.treasury("productSeller");

    val product = Product {
        id: 1001,
        seller: seller.address,
        kind: 1,
        assetAddress: seller.address,
        price: grams("1.25"),
        deliveryMode: 1,
        status: 1,
        createdAt: 1793366400,
        extra: ProductExtra {
            collection: seller.address,
            queryId: 1001,
            itemIndex: 0,
        }.toCell(),
    };

    val decoded = Product.fromCell(product.toCell());

    expect(decoded.id).toEqual(product.id);
    expect(decoded.seller).toEqual(product.seller);
    expect(decoded.kind).toEqual(product.kind);
    expect(decoded.assetAddress).toEqual(product.assetAddress);
    val decodedProductExtra = decoded.extra.load();
    expect(decodedProductExtra.collection).toEqual(seller.address);
    expect(decodedProductExtra.queryId).toEqual(1001);
    expect(decoded.price).toEqual(product.price);
    expect(decoded.deliveryMode).toEqual(product.deliveryMode);
    expect(decoded.status).toEqual(product.status);
    expect(decoded.createdAt).toEqual(product.createdAt);
}

// 测试6：Order 主结构及扩展数据序列化
get fun `test Order serialization and settlement amounts`() {
    val buyer = testing.treasury("orderBuyer");
    val seller = testing.treasury("orderSeller");

    val extra = OrderExtra {
        buyer: buyer.address,
        seller: seller.address,
        price: grams("100"),
        platformFee: grams("3"),
        sellerAmount: grams("97"),
    };

    val order = Order {
        id: 2001,
        productId: 1001,
        status: 1,
        createdAt: 1793366400,
        extra: extra.toCell(),
    };

    val decoded = Order.fromCell(order.toCell());
    val decodedExtra = decoded.extra.load();

    expect(decoded.id).toEqual(2001);
    expect(decoded.productId).toEqual(1001);
    expect(decoded.status).toEqual(1);
    expect(decoded.createdAt).toEqual(1793366400);

    expect(decodedExtra.buyer).toEqual(buyer.address);
    expect(decodedExtra.seller).toEqual(seller.address);
    expect(decodedExtra.price).toEqual(grams("100"));
    expect(decodedExtra.platformFee).toEqual(grams("3"));
    expect(decodedExtra.sellerAmount).toEqual(grams("97"));

    expect(
        decodedExtra.platformFee + decodedExtra.sellerAmount,
    ).toEqual(decodedExtra.price);
}

// 测试7：Seller 卖家资料结构序列化
get fun `test Seller serialization`() {
    val seller = Seller {
        status: 1,
        productCount: 25,
        completedOrders: 18,
    };

    val decoded = Seller.fromCell(seller.toCell());

    expect(decoded.status).toEqual(1);
    expect(decoded.productCount).toEqual(25);
    expect(decoded.completedOrders).toEqual(18);
}

// 测试8：商品字典新增、读取、重复保护和更新
get fun `test Product dictionary operations`() {
    val seller = testing.treasury("dictionarySeller");

    val product = Product {
        id: 1001,
        seller: seller.address,
        kind: 1,
        assetAddress: seller.address,
        price: grams("100"),
        deliveryMode: 1,
        status: 1,
        createdAt: 1793366400,
        extra: ProductExtra {
            collection: seller.address,
            queryId: 1001,
            itemIndex: 0,
        }.toCell(),
    };

    var products: map<uint64, Product> = [];

    // 新增商品
    expect(products.addIfNotExists(1001, product)).toEqual(true);

    // 检查商品是否存在
    expect(products.exists(1001)).toEqual(true);

    // 读取商品
    val stored = products.mustGet(1001);

    expect(stored.id).toEqual(1001);
    expect(stored.price).toEqual(grams("100"));
    expect(stored.seller).toEqual(seller.address);
    val storedProductExtra = stored.extra.load();
    expect(storedProductExtra.collection).toEqual(seller.address);
    expect(storedProductExtra.queryId).toEqual(1001);

    // 重复商品 ID 不允许覆盖
    val duplicateAdded = products.addIfNotExists(
        1001,
        Product {
            id: 1001,
            seller: seller.address,
            kind: 1,
            assetAddress: seller.address,
            price: grams("200"),
            deliveryMode: 1,
            status: 1,
            createdAt: 1793366400,
            extra: ProductExtra {
                collection: seller.address,
                queryId: 1001,
                itemIndex: 0,
            }.toCell(),
        },
    );

    expect(duplicateAdded).toEqual(false);
    expect(products.mustGet(1001).price).toEqual(grams("100"));

    // 更新已有商品
    var updatedProduct = stored;
    updatedProduct.price = grams("150");
    products.set(1001, updatedProduct);

    expect(products.mustGet(1001).price).toEqual(grams("150"));
}

// 测试9：订单字典新增、读取、重复保护和更新
get fun `test Order dictionary operations`() {
    val buyer = testing.treasury("dictionaryBuyer");
    val seller = testing.treasury("dictionaryOrderSeller");

    val extra = OrderExtra {
        buyer: buyer.address,
        seller: seller.address,
        price: grams("100"),
        platformFee: grams("3"),
        sellerAmount: grams("97"),
    };

    val order = Order {
        id: 2001,
        productId: 1001,
        status: 1,
        createdAt: 1793366400,
        extra: extra.toCell(),
    };

    var orders: map<uint64, Order> = [];

    // 新增订单
    expect(orders.addIfNotExists(2001, order)).toEqual(true);

    // 检查订单是否存在
    expect(orders.exists(2001)).toEqual(true);

    // 读取订单
    val stored = orders.mustGet(2001);
    val storedExtra = stored.extra.load();

    expect(stored.id).toEqual(2001);
    expect(stored.productId).toEqual(1001);
    expect(stored.status).toEqual(1);
    expect(storedExtra.buyer).toEqual(buyer.address);
    expect(storedExtra.seller).toEqual(seller.address);
    expect(storedExtra.price).toEqual(grams("100"));
    expect(storedExtra.platformFee).toEqual(grams("3"));
    expect(storedExtra.sellerAmount).toEqual(grams("97"));

    // 重复订单 ID 不允许覆盖
    var duplicateOrder = order;
    duplicateOrder.status = 9;

    val duplicateAdded = orders.addIfNotExists(2001, duplicateOrder);

    expect(duplicateAdded).toEqual(false);
    expect(orders.mustGet(2001).status).toEqual(1);

    // 更新已有订单状态
    var updatedOrder = stored;
    updatedOrder.status = 2;
    orders.set(2001, updatedOrder);

    expect(orders.mustGet(2001).status).toEqual(2);
}

// 测试环境：部署 Marketplace
fun setupMarketplaceTest(): (Marketplace, Treasury, Treasury) {
    val deployer = testing.treasury("deployer");
    val notDeployer = testing.treasury("notDeployer");

    val contract = Marketplace.fromStorage({
        owner: deployer.address,
        escrow: deployer.address,
        escrowConfigured: false,
        nextProductId: 1,
        nextOrderId: 1,
        products: [],
        assetListings: [],
        orders: [],
    });
    val res = contract.deploy(deployer.address, { value: grams("0.05") });
    expect(res).toHaveSuccessfulDeploy({
        to: contract.address,
    });

    return (contract, deployer, notDeployer);
}

// 测试10：未配置 Escrow 时拒绝退款回调
get fun `test refund callback rejected when escrow is not configured`() {
    val (contract, deployer, _) = setupMarketplaceTest();

    val res = contract.sendAny(
        deployer.address,
        EscrowRefunded {
            queryId: 1,
            productId: 1,
            nftItem: deployer.address,
            seller: deployer.address,
        }.toCell(),
        { value: grams("0.05") },
    );

    expect(res).toHaveFailedTx({
        from: deployer.address,
        to: contract.address,
        exitCode: Errors.EscrowNotConfigured,
    });
}

// 测试11：验证退款回调发送者、商品信息、状态及重复回调保护
get fun `test refund callback validates escrow and product before cancellation`() {
    val (contract, escrow, attacker, seller, nftItem) = setupActiveMarketplaceTest();

    // 非 Escrow 地址伪造退款回调
    val forgedSenderRes = contract.sendAny(
        attacker.address,
        EscrowRefunded {
            queryId: 1,
            productId: 1,
            nftItem: nftItem.address,
            seller: seller.address,
        }.toCell(),
        { value: grams("0.05") },
    );

    expect(forgedSenderRes).toHaveFailedTx({
        from: attacker.address,
        to: contract.address,
        exitCode: Errors.InvalidEscrowCallback,
    });

    // 错误 queryId
    val wrongQueryRes = contract.sendAny(
        escrow.address,
        EscrowRefunded {
            queryId: 999,
            productId: 1,
            nftItem: nftItem.address,
            seller: seller.address,
        }.toCell(),
        { value: grams("0.05") },
    );

    expect(wrongQueryRes).toHaveFailedTx({
        from: escrow.address,
        to: contract.address,
        exitCode: Errors.InvalidRefundConfirmation,
    });

    // 错误 NFT Item 地址
    val wrongNftRes = contract.sendAny(
        escrow.address,
        EscrowRefunded {
            queryId: 1,
            productId: 1,
            nftItem: attacker.address,
            seller: seller.address,
        }.toCell(),
        { value: grams("0.05") },
    );

    expect(wrongNftRes).toHaveFailedTx({
        from: escrow.address,
        to: contract.address,
        exitCode: Errors.InvalidRefundConfirmation,
    });

    // 错误卖家地址
    val wrongSellerRes = contract.sendAny(
        escrow.address,
        EscrowRefunded {
            queryId: 1,
            productId: 1,
            nftItem: nftItem.address,
            seller: attacker.address,
        }.toCell(),
        { value: grams("0.05") },
    );

    expect(wrongSellerRes).toHaveFailedTx({
        from: escrow.address,
        to: contract.address,
        exitCode: Errors.InvalidRefundConfirmation,
    });

    // 正确 Escrow 回调，商品应变为 Cancelled
    val validRes = contract.sendAny(
        escrow.address,
        EscrowRefunded {
            queryId: 1,
            productId: 1,
            nftItem: nftItem.address,
            seller: seller.address,
        }.toCell(),
        { value: grams("0.05") },
    );

    expect(validRes).toHaveSuccessfulTx<EscrowRefunded>({
        from: escrow.address,
        to: contract.address,
    });

    val cancelledProduct = contract.product(1);

    assert (cancelledProduct != null) throw Errors.ProductNotFound;
    expect(cancelledProduct!!.status).toEqual(5);

    // 重复退款回调应再次发送 ACK，但不能重复改变商品状态
    val duplicateRes = contract.sendAny(
        escrow.address,
        EscrowRefunded {
            queryId: 1,
            productId: 1,
            nftItem: nftItem.address,
            seller: seller.address,
        }.toCell(),
        { value: grams("0.05") },
    );

    expect(duplicateRes).toHaveSuccessfulTx<EscrowRefunded>({
        from: escrow.address,
        to: contract.address,
    });

    val finalProduct = contract.product(1);

    assert (finalProduct != null) throw Errors.ProductNotFound;
    expect(finalProduct!!.status).toEqual(5);
}

// 测试12：退款回调不能引用不存在的商品
get fun `test refund callback rejects unknown product`() {
    val (contract, escrow, _, _, _) = setupActiveMarketplaceTest();

    val res = contract.sendAny(
        escrow.address,
        EscrowRefunded {
            queryId: 1,
            productId: 999,
            nftItem: escrow.address,
            seller: escrow.address,
        }.toCell(),
        { value: grams("0.05") },
    );

    expect(res).toHaveFailedTx({
        from: escrow.address,
        to: contract.address,
        exitCode: Errors.ProductNotFound,
    });
}

// 测试环境：部署一份已配置 Escrow 且包含 Active 商品的 Marketplace
fun setupActiveMarketplaceTest(): (Marketplace, Treasury, Treasury, Treasury, Treasury) {
    val deployer = testing.treasury("activeDeployer");
    val escrow = testing.treasury("activeEscrow");
    val attacker = testing.treasury("activeAttacker");
    val seller = testing.treasury("activeSeller");
    val nftItem = testing.treasury("activeNftItem");

    var products: map<uint64, Product> = [];

    val product = Product {
        id: 1,
        seller: seller.address,
        kind: 1,
        assetAddress: nftItem.address,
        price: grams("1"),
        deliveryMode: 1,
        status: 2,
        createdAt: 1793366400,
        extra: ProductExtra {
            collection: deployer.address,
            queryId: 1,
            itemIndex: 0,
        }.toCell(),
    };

    products.set(1, product);
    var assetListings: map<address, uint64> = [];
    assetListings.set(nftItem.address, 1);

    val contract = Marketplace.fromStorage({
        owner: deployer.address,
        escrow: escrow.address,
        escrowConfigured: true,
        nextProductId: 2,
        nextOrderId: 1,
        products: products,
        assetListings: assetListings,
        orders: [],
    });

    val res = contract.deploy(
        deployer.address,
        { value: grams("0.05") },
    );

    expect(res).toHaveSuccessfulDeploy({
        to: contract.address,
    });

    return (contract, escrow, attacker, seller, nftItem);
}

// 测试13：管理员可以重试 Pending 商品的 Escrow 创建
get fun `test owner can retry pending escrow creation`() {
    val (contract, deployer, _, _, _) = setupPendingMarketplaceTest();

    val retryRes = contract.sendRetryCreateEscrow(
        deployer.address,
        1,
        { value: grams("0.05") },
    );
    expect(retryRes).toHaveSuccessfulTx();

    val saved = contract.product(1);
    assert (saved != null) throw Errors.ProductNotFound;
    expect(saved!!.status).toEqual(1);
}

// 测试环境：部署包含 Pending 商品的 Marketplace
fun setupPendingMarketplaceTest(): (Marketplace, Treasury, Treasury, Treasury, Treasury) {
    val deployer = testing.treasury("pendingDeployer");
    val escrow = testing.treasury("pendingEscrow");
    val seller = testing.treasury("pendingSeller");
    val nftItem = testing.treasury("pendingNftItem");

    var products: map<uint64, Product> = [];
    val product = Product {
        id: 1,
        seller: seller.address,
        kind: 3,
        assetAddress: nftItem.address,
        price: grams("1"),
        deliveryMode: 1,
        status: 1,
        createdAt: 1793366400,
        extra: ProductExtra {
            collection: deployer.address,
            queryId: 1,
            itemIndex: 0,
        }.toCell(),
    };
    products.set(1, product);
    var assetListings: map<address, uint64> = [];
    assetListings.set(nftItem.address, 1);

    val contract = Marketplace.fromStorage({
        owner: deployer.address,
        escrow: escrow.address,
        escrowConfigured: true,
        nextProductId: 2,
        nextOrderId: 1,
        products: products,
        assetListings: assetListings,
        orders: [],
    });

    val res = contract.deploy(
        deployer.address,
        { value: grams("0.05") },
    );
    expect(res).toHaveSuccessfulDeploy({ to: contract.address });

    return (contract, deployer, escrow, seller, nftItem);
}

// 测试14：非管理员不能重试 Pending 商品的 Escrow 创建
get fun `test non owner cannot retry pending escrow creation`() {
    val (contract, _, _, seller, _) = setupPendingMarketplaceTest();

    val retryRes = contract.sendRetryCreateEscrow(
        seller.address,
        1,
        { value: grams("0.05") },
    );
    expect(retryRes).toHaveFailedTx({
        from: seller.address,
        to: contract.address,
        exitCode: Errors.NotOwner,
    });

    val saved = contract.product(1);
    assert (saved != null) throw Errors.ProductNotFound;
    expect(saved!!.status).toEqual(1);
}

// 测试15：非 Pending 商品不能重试创建 Escrow
get fun `test retry escrow creation rejects non pending product`() {
    val (contract, escrow, _, _, _) = setupActiveMarketplaceTest();

    val retryRes = contract.sendRetryCreateEscrow(
        contract.owner(),
        1,
        { value: grams("0.05") },
    );
    expect(retryRes).toHaveFailedTx({
        from: contract.owner(),
        to: contract.address,
        exitCode: Errors.ProductNotPending,
    });

    val saved = contract.product(1);
    assert (saved != null) throw Errors.ProductNotFound;
    expect(saved!!.status).toEqual(2);
}

// 测试16：重试不存在的商品必须失败
get fun `test retry escrow creation rejects unknown product`() {
    val (contract, deployer, _, _, _) = setupPendingMarketplaceTest();

    val retryRes = contract.sendRetryCreateEscrow(
        deployer.address,
        999,
        { value: grams("0.05") },
    );
    expect(retryRes).toHaveFailedTx({
        from: deployer.address,
        to: contract.address,
        exitCode: Errors.ProductNotFound,
    });
}

// 测试17：未配置 Escrow 时禁止重试创建
get fun `test retry escrow creation rejects unconfigured escrow`() {
    val (contract, deployer, _) = setupMarketplaceTest();

    val retryRes = contract.sendRetryCreateEscrow(
        deployer.address,
        1,
        { value: grams("0.05") },
    );
    expect(retryRes).toHaveFailedTx({
        from: deployer.address,
        to: contract.address,
        exitCode: Errors.EscrowNotConfigured,
    });
}

// 测试18：正确的 Escrow 入库回调激活 Pending 商品
get fun `test escrow deposit callback activates pending product`() {
    val (contract, _, escrow, seller, nftItem) = setupPendingMarketplaceTest();

    val callbackRes = contract.sendEscrowDeposited(
        escrow.address,
        1,
        1,
        nftItem.address,
        seller.address,
        { value: grams("0.05") },
    );
    expect(callbackRes).toHaveSuccessfulTx();

    val saved = contract.product(1);
    assert (saved != null) throw Errors.ProductNotFound;
    expect(saved!!.status).toEqual(2);
}

// 测试19：重复的 Escrow 入库回调应保持幂等
get fun `test duplicate escrow deposit callback is idempotent`() {
    val (contract, escrow, _, seller, nftItem) = setupActiveMarketplaceTest();

    val callbackRes = contract.sendEscrowDeposited(
        escrow.address,
        1,
        1,
        nftItem.address,
        seller.address,
        { value: grams("0.05") },
    );
    expect(callbackRes).toHaveSuccessfulTx();

    val saved = contract.product(1);
    assert (saved != null) throw Errors.ProductNotFound;
    expect(saved!!.status).toEqual(2);
}

// 测试20：非 Escrow 地址不能发送入库回调
get fun `test escrow deposit callback rejects invalid sender`() {
    val (contract, deployer, _, seller, nftItem) = setupPendingMarketplaceTest();

    val callbackRes = contract.sendEscrowDeposited(
        deployer.address,
        1,
        1,
        nftItem.address,
        seller.address,
        { value: grams("0.05") },
    );
    expect(callbackRes).toHaveFailedTx({
        from: deployer.address,
        to: contract.address,
        exitCode: Errors.InvalidEscrowCallback,
    });

    val saved = contract.product(1);
    assert (saved != null) throw Errors.ProductNotFound;
    expect(saved!!.status).toEqual(1);
}

// 测试21：入库回调拒绝错误的 queryId
get fun `test escrow deposit callback rejects invalid query id`() {
    val (contract, _, escrow, seller, nftItem) = setupPendingMarketplaceTest();

    val callbackRes = contract.sendEscrowDeposited(
        escrow.address,
        999,
        1,
        nftItem.address,
        seller.address,
        { value: grams("0.05") },
    );
    expect(callbackRes).toHaveFailedTx({
        from: escrow.address,
        to: contract.address,
        exitCode: Errors.InvalidQueryId,
    });

    val saved = contract.product(1);
    assert (saved != null) throw Errors.ProductNotFound;
    expect(saved!!.status).toEqual(1);
}

// 测试22：入库回调拒绝错误的 NFT 地址
get fun `test escrow deposit callback rejects invalid nft item`() {
    val (contract, _, escrow, seller, _) = setupPendingMarketplaceTest();
    val wrongNft = testing.treasury("wrongDepositNft");

    val callbackRes = contract.sendEscrowDeposited(
        escrow.address,
        1,
        1,
        wrongNft.address,
        seller.address,
        { value: grams("0.05") },
    );
    expect(callbackRes).toHaveFailedTx({
        from: escrow.address,
        to: contract.address,
        exitCode: Errors.InvalidNftItem,
    });

    val saved = contract.product(1);
    assert (saved != null) throw Errors.ProductNotFound;
    expect(saved!!.status).toEqual(1);
}

// 测试23：入库回调拒绝错误的卖家地址
get fun `test escrow deposit callback rejects invalid seller`() {
    val (contract, _, escrow, _, nftItem) = setupPendingMarketplaceTest();
    val wrongSeller = testing.treasury("wrongDepositSeller");

    val callbackRes = contract.sendEscrowDeposited(
        escrow.address,
        1,
        1,
        nftItem.address,
        wrongSeller.address,
        { value: grams("0.05") },
    );
    expect(callbackRes).toHaveFailedTx({
        from: escrow.address,
        to: contract.address,
        exitCode: Errors.InvalidSeller,
    });

    val saved = contract.product(1);
    assert (saved != null) throw Errors.ProductNotFound;
    expect(saved!!.status).toEqual(1);
}

// 测试24：Paused 商品不能接受入库回调
get fun `test escrow deposit callback rejects paused product`() {
    val deployer = testing.treasury("pausedDeployer");
    val escrow = testing.treasury("pausedEscrow");
    val seller = testing.treasury("pausedSeller");
    val nftItem = testing.treasury("pausedNftItem");

    var products: map<uint64, Product> = [];
    val product = Product {
        id: 1,
        seller: seller.address,
        kind: 3,
        assetAddress: nftItem.address,
        price: grams("1"),
        deliveryMode: 1,
        status: 3,
        createdAt: 1793366400,
        extra: ProductExtra {
            collection: deployer.address,
            queryId: 1,
            itemIndex: 0,
        }.toCell(),
    };
    products.set(1, product);

    val contract = Marketplace.fromStorage({
        owner: deployer.address,
        escrow: escrow.address,
        escrowConfigured: true,
        nextProductId: 2,
        nextOrderId: 1,
        products: products,
        assetListings: [],
        orders: [],
    });

    val deployRes = contract.deploy(
        deployer.address,
        { value: grams("0.05") },
    );
    expect(deployRes).toHaveSuccessfulDeploy({
        to: contract.address,
    });

    val callbackRes = contract.sendEscrowDeposited(
        escrow.address,
        1,
        1,
        nftItem.address,
        seller.address,
        { value: grams("0.05") },
    );
    expect(callbackRes).toHaveFailedTx({
        from: escrow.address,
        to: contract.address,
        exitCode: Errors.ProductNotPending,
    });

    val saved = contract.product(1);
    assert (saved != null) throw Errors.ProductNotFound;
    expect(saved!!.status).toEqual(3);
}

// 测试25：不存在的商品不能接受入库回调
get fun `test escrow deposit callback rejects unknown product`() {
    val (contract, _, escrow, seller, nftItem) = setupPendingMarketplaceTest();

    val callbackRes = contract.sendEscrowDeposited(
        escrow.address,
        1,
        999,
        nftItem.address,
        seller.address,
        { value: grams("0.05") },
    );
    expect(callbackRes).toHaveFailedTx({
        from: escrow.address,
        to: contract.address,
        exitCode: Errors.ProductNotFound,
    });

    val saved = contract.product(1);
    assert (saved != null) throw Errors.ProductNotFound;
    expect(saved!!.status).toEqual(1);
}

// 测试26：未配置 Escrow 时拒绝入库回调
get fun `test escrow deposit callback rejected when escrow is not configured`() {
    val deployer = testing.treasury("unconfiguredDepositDeployer");
    val seller = testing.treasury("unconfiguredDepositSeller");
    val nftItem = testing.treasury("unconfiguredDepositNft");

    var products: map<uint64, Product> = [];
    val product = Product {
        id: 1,
        seller: seller.address,
        kind: 3,
        assetAddress: nftItem.address,
        price: grams("1"),
        deliveryMode: 1,
        status: 1,
        createdAt: 1793366400,
        extra: ProductExtra {
            collection: deployer.address,
            queryId: 1,
            itemIndex: 0,
        }.toCell(),
    };
    products.set(1, product);

    val contract = Marketplace.fromStorage({
        owner: deployer.address,
        escrow: deployer.address,
        escrowConfigured: false,
        nextProductId: 2,
        nextOrderId: 1,
        products: products,
        assetListings: [],
        orders: [],
    });

    val deployRes = contract.deploy(
        deployer.address,
        { value: grams("0.05") },
    );
    expect(deployRes).toHaveSuccessfulDeploy({
        to: contract.address,
    });

    val callbackRes = contract.sendEscrowDeposited(
        deployer.address,
        1,
        1,
        nftItem.address,
        seller.address,
        { value: grams("0.05") },
    );
    expect(callbackRes).toHaveFailedTx({
        from: deployer.address,
        to: contract.address,
        exitCode: Errors.EscrowNotConfigured,
    });

    val saved = contract.product(1);
    assert (saved != null) throw Errors.ProductNotFound;
    expect(saved!!.status).toEqual(1);
}

// Settlement math must stay integer-only and conserve every nanotons unit.
get fun `test settlement split conserves gross amount and rounds fee down`() {
    val wholeTon = calculateSettlementAmounts(grams("100"));
    expect(wholeTon.gross).toEqual(grams("100"));
    expect(wholeTon.platformFee).toEqual(grams("3"));
    expect(wholeTon.sellerAmount).toEqual(grams("97"));
    expect(wholeTon.platformFee + wholeTon.sellerAmount).toEqual(wholeTon.gross);

    val oneTon = calculateSettlementAmounts(grams("1"));
    expect(oneTon.platformFee).toEqual(grams("0.03"));
    expect(oneTon.sellerAmount).toEqual(grams("0.97"));
    expect(oneTon.platformFee + oneTon.sellerAmount).toEqual(oneTon.gross);

    // One nanotons cannot be divided into 3% and 97%; fee rounds down
    // and the seller receives the full remainder without value creation/loss.
    val oneNanoton = calculateSettlementAmounts(1);
    expect(oneNanoton.platformFee).toEqual(0);
    expect(oneNanoton.sellerAmount).toEqual(1);
    expect(oneNanoton.platformFee + oneNanoton.sellerAmount).toEqual(1);

    // Exact floor-rounding boundaries around each 100-nanoton fee unit.
    val thirtyThree = calculateSettlementAmounts(33);
    expect(thirtyThree.platformFee).toEqual(0);
    expect(thirtyThree.sellerAmount).toEqual(33);

    val thirtyFour = calculateSettlementAmounts(34);
    expect(thirtyFour.platformFee).toEqual(1);
    expect(thirtyFour.sellerAmount).toEqual(33);

    val ninetyNine = calculateSettlementAmounts(99);
    expect(ninetyNine.platformFee).toEqual(2);
    expect(ninetyNine.sellerAmount).toEqual(97);

    val oneHundred = calculateSettlementAmounts(100);
    expect(oneHundred.platformFee).toEqual(3);
    expect(oneHundred.sellerAmount).toEqual(97);

    // A large valid TON amount exercises the divide-before-multiply path.
    // Raw nanotons avoid the grams() helper's narrower literal parser.
    val largeGross: coins = 1000000000000000000000000;
    val largeSplit = calculateSettlementAmounts(largeGross);
    val expectedLargeFee: coins = 30000000000000000000000;
    expect(largeSplit.platformFee).toEqual(expectedLargeFee);
    expect(largeSplit.sellerAmount).toEqual(largeGross - expectedLargeFee);
    expect(largeSplit.platformFee + largeSplit.sellerAmount).toEqual(largeGross);
}

// V2 order snapshot persists all parties, exact amounts, and independent operation IDs.
get fun `test Marketplace V2 immutable order and independent payout snapshots`() {
    val buyer = testing.treasury("v2OrderBuyer");
    val seller = testing.treasury("v2OrderSeller");
    val nftItem = testing.treasury("v2OrderNftItem");
    val collection = testing.treasury("v2OrderCollection");
    val treasury = testing.treasury("v2OrderTreasury");

    val orderExtra = MarketplaceV2OrderExtra {
        parties: MarketplaceV2OrderParties {
            buyer: buyer.address,
            seller: seller.address,
            treasury: treasury.address,
        }.toCell(),
        asset: MarketplaceV2OrderAsset {
            nftItem: nftItem.address,
            collection: collection.address,
            itemIndex: 4242,
            escrowId: 17,
        }.toCell(),
        settlement: MarketplaceV2OrderSettlement {
            gross: grams("100"),
            feeBps: 300,
            feeRoundingVersion: 1,
            platformFee: grams("3"),
            sellerProceeds: grams("97"),
            processingReserve: grams("0.2"),
        }.toCell(),
        operations: MarketplaceV2OrderOperations {
            paymentQueryId: 9001,
            releaseQueryId: 9002,
            sellerPayoutQueryId: 9003,
            platformPayoutQueryId: 9004,
            buyerRefundQueryId: 9005,
            sellerReturnQueryId: 9006,
            sellerPayoutOperationId: 9007,
            platformPayoutOperationId: 9008,
            buyerRefundOperationId: 9009,
        }.toCell(),
    };
    val order = MarketplaceV2Order {
        id: 7001,
        productId: 3001,
        status: MarketplaceV2OrderStatus.PaymentAccepted,
        deliveryStatus: MarketplaceV2DeliveryStatus.Pending,
        sellerPayoutStatus: MarketplaceV2PayoutStatus.NotCreated,
        platformPayoutStatus: MarketplaceV2PayoutStatus.NotCreated,
        refundStatus: MarketplaceV2RefundStatus.None,
        sellerReturnStatus: MarketplaceV2SellerReturnStatus.NotStarted,
        createdAt: 1793366400,
        extra: orderExtra.toCell(),
    };

    val decodedOrder = MarketplaceV2Order.fromCell(order.toCell());
    val decodedExtra = decodedOrder.extra.load();
    expect(decodedOrder.id).toEqual(7001);
    expect(decodedOrder.productId).toEqual(3001);
    expect(decodedOrder.status).toEqual(MarketplaceV2OrderStatus.PaymentAccepted);
    expect(decodedOrder.deliveryStatus).toEqual(MarketplaceV2DeliveryStatus.Pending);
    expect(decodedOrder.sellerPayoutStatus).toEqual(MarketplaceV2PayoutStatus.NotCreated);
    expect(decodedOrder.platformPayoutStatus).toEqual(0);
    expect(decodedOrder.refundStatus).toEqual(0);
    val decodedParties = decodedExtra.parties.load();
    val decodedAsset = decodedExtra.asset.load();
    val decodedSettlement = decodedExtra.settlement.load();
    val decodedOperations = decodedExtra.operations.load();
    expect(decodedParties.buyer).toEqual(buyer.address);
    expect(decodedParties.seller).toEqual(seller.address);
    expect(decodedParties.treasury).toEqual(treasury.address);
    expect(decodedAsset.nftItem).toEqual(nftItem.address);
    expect(decodedAsset.collection).toEqual(collection.address);
    expect(decodedAsset.itemIndex).toEqual(4242);
    expect(decodedAsset.escrowId).toEqual(17);
    expect(decodedSettlement.gross).toEqual(grams("100"));
    expect(decodedSettlement.feeBps).toEqual(300);
    expect(decodedSettlement.feeRoundingVersion).toEqual(1);
    expect(decodedSettlement.platformFee).toEqual(grams("3"));
    expect(decodedSettlement.sellerProceeds).toEqual(grams("97"));
    expect(decodedSettlement.processingReserve).toEqual(grams("0.2"));
    expect(decodedOperations.paymentQueryId).toEqual(9001);
    expect(decodedOperations.releaseQueryId).toEqual(9002);
    expect(decodedOperations.sellerPayoutQueryId).toEqual(9003);
    expect(decodedOperations.platformPayoutQueryId).toEqual(9004);
    expect(decodedOperations.buyerRefundQueryId).toEqual(9005);
    expect(
        decodedSettlement.platformFee + decodedSettlement.sellerProceeds,
    ).toEqual(decodedSettlement.gross);

    val sellerPayout = MarketplaceV2Payout {
        orderId: decodedOrder.id,
        operationId: 8001,
        queryId: decodedOperations.sellerPayoutQueryId,
        beneficiary: decodedParties.seller,
        amount: decodedSettlement.sellerProceeds,
        kind: 1,
        status: 1,
        createdAt: decodedOrder.createdAt,
    };
    val platformPayout = MarketplaceV2Payout {
        orderId: decodedOrder.id,
        operationId: 8002,
        queryId: decodedOperations.platformPayoutQueryId,
        beneficiary: decodedParties.treasury,
        amount: decodedSettlement.platformFee,
        kind: 2,
        status: 1,
        createdAt: decodedOrder.createdAt,
    };
    val decodedSellerPayout = MarketplaceV2Payout.fromCell(sellerPayout.toCell());
    val decodedPlatformPayout = MarketplaceV2Payout.fromCell(platformPayout.toCell());
    expect(decodedSellerPayout.orderId).toEqual(decodedPlatformPayout.orderId);
    expect(decodedSellerPayout.operationId).toEqual(8001);
    expect(decodedPlatformPayout.operationId).toEqual(8002);
    expect(decodedSellerPayout.operationId != decodedPlatformPayout.operationId).toEqual(true);
    expect(decodedSellerPayout.queryId).toEqual(9003);
    expect(decodedPlatformPayout.queryId).toEqual(9004);
    expect(decodedSellerPayout.beneficiary).toEqual(seller.address);
    expect(decodedPlatformPayout.beneficiary).toEqual(treasury.address);
    expect(decodedSellerPayout.amount).toEqual(grams("97"));
    expect(decodedPlatformPayout.amount).toEqual(grams("3"));
    expect(decodedSellerPayout.kind).toEqual(1);
    expect(decodedPlatformPayout.kind).toEqual(2);
}
