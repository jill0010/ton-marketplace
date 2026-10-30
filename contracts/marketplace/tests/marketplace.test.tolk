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
    };

    val decoded = Product.fromCell(product.toCell());

    expect(decoded.id).toEqual(product.id);
    expect(decoded.seller).toEqual(product.seller);
    expect(decoded.kind).toEqual(product.kind);
    expect(decoded.assetAddress).toEqual(product.assetAddress);
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
        nextProductId: 1,
        nextOrderId: 1,
        products: [],
        orders: [],
    });
    val res = contract.deploy(deployer.address, { value: grams("0.05") });
    expect(res).toHaveSuccessfulDeploy({
        to: contract.address,
    });

    return (contract, deployer, notDeployer);
}
