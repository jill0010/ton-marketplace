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

    val record = EscrowRecord {
        escrowId: 1,
        nftItem: nftItem.address,
        collection: collection.address,
        seller: seller.address,
        productId: 100,
        status: 1,
        createdAt: 1782792000,
    };

    val decoded = EscrowRecord.fromCell(record.toCell());

    expect(decoded.escrowId).toEqual(1);
    expect(decoded.nftItem).toEqual(nftItem.address);
    expect(decoded.collection).toEqual(collection.address);
    expect(decoded.seller).toEqual(seller.address);
    expect(decoded.productId).toEqual(100);
    expect(decoded.status).toEqual(1);
    expect(decoded.createdAt).toEqual(1782792000);
}

// 测试6：Marketplace 可以创建托管
get fun `test marketplace can create escrow`() {
    val (contract, _, _, marketplace) = setupEscrowTest();

    val seller = testing.treasury("testSeller");
    val nftItem = testing.treasury("testNftItem");
    val collection = testing.treasury("testCollection");

    val res = contract.sendCreateEscrow(
        marketplace.address,
        nftItem.address,
        collection.address,
        seller.address,
        100,
        1782792000,
        { value: grams("0.05") },
    );

    expect(res).toHaveSuccessfulTx<CreateEscrow>({
        from: marketplace.address,
        to: contract.address,
    });

    // 直接读取链上保存的托管记录
    val saved = contract.escrowRecord(1);

    assert (saved != null) throw Errors.InvalidEscrow;
    expect(saved!!.escrowId).toEqual(1);
    expect(saved!!.nftItem).toEqual(nftItem.address);
    expect(saved!!.collection).toEqual(collection.address);
    expect(saved!!.seller).toEqual(seller.address);
    expect(saved!!.productId).toEqual(100);
    expect(saved!!.status).toEqual(1);
    expect(saved!!.createdAt).toEqual(1782792000);
}

// 测试7：非 Marketplace 地址不能创建托管
get fun `test non-marketplace cannot create escrow`() {
    val (contract, _, notDeployer, _) = setupEscrowTest();

    val seller = testing.treasury("testSeller2");
    val nftItem = testing.treasury("testNftItem2");
    val collection = testing.treasury("testCollection2");

    val res = contract.sendCreateEscrow(
        notDeployer.address,
        nftItem.address,
        collection.address,
        seller.address,
        101,
        1782792000,
        { value: grams("0.05") },
    );

    expect(res).toHaveFailedTx({
        from: notDeployer.address,
        to: contract.address,
        exitCode: Errors.NotOwner,
    });

    // 未授权请求不能产生托管记录
    val saved = contract.escrowRecord(1);
    expect(saved).toEqual(null);
}

// 测试8：不存在的托管编号返回空值
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
