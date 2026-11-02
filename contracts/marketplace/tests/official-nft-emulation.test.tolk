import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/fmt"
import "@acton/io"
import "@acton/tlb/maybe"
import "@acton/types/transaction"
import "@acton/types/message"
import "@contracts/types"

get fun `test official Desk Calendar NFT deployment and getter`() {
    testing.registerLibrary(parseCellFromHex("b5ee9c72010226010007f4000114ff00f4a413f4bcf2c80b0102012003020064f230f8276f10ed44d0d4f404d1d0fa40d4f404d4d14533237ff02732034414c85004cf1612ccf400ccc901c8ccf400c9ed540201480d040201200a05020120090602012008070067b74a7da89a1a9e809a263a1f481a9e809a9a226be0640dd2e60dae0a8e00041c1a1a9a9a263a1f481f401f401a60fa63fa63fa300097b7d05da89a1a9e809a263a1f481a9e809a9a226be0640dde5a1b7a1a9a9a261a1e809f401a63fa2dae0a608dd226b3abe0605a1f481f401a63fa28889c4450413c267017727083e67bcaa430005db8fcfed44d0d4f404d101d0d3fffa40d1226e9632708b02136de002d0fa40d4f404d4d15bd0d4f404d4d15b7f444480201200c0b0039b8ed7ed44d0d4f404d131d0fa40d4f404d4d16c31d0d30fd30ffa40d180067b8f82ed44d0d4f404d131d0fa40d4f404d4d110235f03d0d4f404d4d16c21d0d30701aa02d7180101d30701aa02d7180101d13080202ca1a0e020148160f020148111000714fa40fa00d4d4d4d43001f029206e935f076de010364540f0288b02511370f02732136d500502c8ccf400ccc959c85004cf1612ccf400ccc98020120131200cb08343e903e803e8034c1f4c7f4c7f44d4920c7ac016085dfffffffec092082e4e1c02e4930c01455ae456c052c40b04044ac406082024ea02f2c4870406c486082784ce02f2c64d7c11b7800a5407e08e80077db4080b23d00007e80b2c7f24040723333326002eb3435353440743d013e8034c7f4483080086082784ce02eec24fe08e8379490ae7cb434c8b43e903e803e8034c1f4c7f4c7f44c0cccd45dbe08f21400f3c5807e80b2c7f27e08d62804ed8249b080149a2f85ec249c0db78920840ee6b28028006999056a2998e0192a41052d82485ba44c78c39400e01514002002c8f40001fa02cb1fc90101c8ccccc900a401d0fa40fa00d31fd130268209c9c380a101b60820c2008e368210557cea20f825221034596d71708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb0015a104915be20201f4191701f308b435353440743d013e8034c7f44c483080086082784ce02eec3e08d62e6c6497c1380d0064be0037889ba4d7c0db78343e903e803e8034c1f4c7f4c7f457c140b43e903e8034c7f440f434c3f4c3fe90345c20840144e3647e0960840e049f7848f2140373c587328006f2c7c9be808632c7c990c5122a9c601800a2708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb0020c20026c200b05345c705b3b08e12544116a9845240b6085144a14554f026431393303233e21023f026016d008d08a0827270e028406d82083080238d20840dc3fb147e0948840d165b5c9c20043232c15401f3c594017e808572da84b2c7f2cfc89ba44ca51633c5c0788072407ec0286456f8a004f7d7b68bb7efe09dbc400b434c0c05c6c2497c1383e903e900c7e800c7d010c7e800c7e800c1cea6d0008b1c0245c2540b4c7d40cf8bb5134353d0134487434fffe903454c1b1c178c0889bbcb43480b43e90353d01353449e0841a4f4e542eb8c089e0840bf2c9a8aeb8c08d0d0970000a62d88dd1bdc1d5c231c16c22524231b03f629d74ac000b0925f0be0236e8e2c519aa140132370f027206e8e1954719026c85004cf1612ccf400ccc9525001c8ccf400c9ed54de512aa04319df258210371638aebae302236e8e2a363703c000f2e0d610364470f02841302370f027324313c85004cf1612ccf400ccc901c8ccf400c9ed54e13a24c000e3022422211c02fc8210487a8e81ba8e68323333355321c705f2e0dc03d33fd430f029206ef2d0df10234604c85004cf1612ccf400ccc9218e3213708210a37a098358056d8040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb00923330e20101c8ccf400c9ed54e00482105fcc3d14bae3025f091e1d0006f2c0d002c85153c705f2e0d806505301d33ffa40fa40f404fa003223fa4430c000f2e14d078209c9c380a127945375a0a1de22d70b01c300209206a19136e220c2fff2e0ce27941027365be30d0293135f03e30d4433c85004cf1612ccf400ccc901c8ccf400c9ed54201f007223fa4430c000f2e14d43308210d53276db016d71708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb00007e821005138d91c85008cf1658cf1671245146104a10395092708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb0010340014375f053331c705f2e0d700ee35353737266ef2d0db5dc705f2e0dc04d33f3006d0d4d4d130d0f404fa00d31fd15b6ef2e0dd586d5005c85004cf1612ccf400ccc9238e3312708210a37a098358056d8040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb0001926c22e201c8ccf400c9ed5400845f0450785f0501d33f307082108b77173505c8cbff5004cf1610248040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb00007a3b5f0833d33f30708210a8cb00adc804d014cf1643308040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb0000be5b333335048210299a3e15baf2e0d5036e8e1466f02a206e9b3101c8ccf400c9ed54db31e13031926c21e2fa4030708210a43227e1f8256d8040708010c8cb055007cf165005fa0215cb6a12cb1fcb3f226e91329458cf1701e201c901fb00"));

    val deployer = testing.treasury("officialNftDeployer");
    val collection = testing.treasury("officialNftCollection");
    val buyer = testing.treasury("officialNftBuyer");

    val code = parseCellFromHex("b5ee9c72010101010023000842022498bd63f3e9cc2c20c79abe58899a4816ea156855b8d4fcd47cda4bae9e911a");

    expect(code.hash()).toEqual(
        0x8b711e6809672c0335dc61d1da1dcc4059c973248af707bd586245085ea70b32
    );

    val config = beginCell()
        .storeUint(0, 256)
        .storeAddress(collection.address)
        .endCell();

    val data = beginCell()
        .storeRef(config)
        .storeUint(0, 1)
        .endCell();

    val stateInit: ContractState = {
        code: code,
        data: data,
    };

    val destination = AutoDeployAddress {
        workchain: 0,
        stateInit: stateInit,
    };

    val nftItem = destination.calculateAddress();

    val tokenInfo = beginCell()
        .storeUint(1, 8).storeUint(65, 8)
        .storeUint(1, 8).storeUint(66, 8)
        .endCell();

    val nftContent = beginCell()
        .storeUint(1, 8).storeUint(120, 8)
        .endCell();

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
        .storeAddress(deployer.address)
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

    val nftTx = deployResult.findTransaction({
        to: nftItem,
    });

    if (nftTx == null) {
        println("NFT Item transaction not found");
        return;
    }

    println("NFT Item transaction found");

    val description = nftTx!.description.load();

    if (description is TlbTransOrd) {
        println("Transaction aborted: {}", description.aborted);

        if (description.computePh is TlbTrComputeVm) {
            val compute = description.computePh;
            val vm = compute.data.load();

            println("VM success: {}", compute.success);
            println("VM exit code: {}", vm.exitCode);
            println("VM gas used: {}", vm.gasUsed);
            println("VM gas limit: {}", vm.gasLimit);
            println("VM steps: {}", vm.vmSteps);
        } else {
            println("VM compute phase was skipped");
        }

        if (description.bounce is TlbJust) {
            println("Bounce phase is present");
        } else {
            println("Bounce phase is absent");
        }
    } else {
        println("Transaction is not an ordinary transaction");
    }

    val getterResult = net.runGetMethodExt<tuple>(
        nftItem,
        "get_nft_data",
    );

    expect(getterResult.isSuccess()).toEqual(true);

    val stack = getterResult.unwrap();

    expect(stack.size()).toEqual(5);
    expect(stack.get(0) as int).toEqual(-1);
    expect(stack.get(1) as int).toEqual(0);
    expect(stack.get(2) as address).toEqual(collection.address);
    expect(stack.get(3) as address).toEqual(deployer.address);

    val transferBody = NftTransfer {
        queryId: 1,
        newOwner: buyer.address,
        responseDestination: deployer.address,
        customPayload: null,
        forwardAmount: grams("0.01"),
        forwardPayload: beginCell().endCell().beginParse(),
    };

    val transferMessage = createMessage({
        bounce: false,
        value: grams("0.1"),
        dest: nftItem,
        body: transferBody,
    });

    val transferResult = net.send(deployer.address, transferMessage);

    expect(transferResult).toHaveSuccessfulTx({
        from: deployer.address,
        to: nftItem,
    });

    val afterTransfer = net.runGetMethodExt<tuple>(
        nftItem,
        "get_nft_data",
    );

    expect(afterTransfer.isSuccess()).toEqual(true);
    val afterStack = afterTransfer.unwrap();
    expect(afterStack.get(3) as address).toEqual(buyer.address);

    val transferNftTx = transferResult.findTransaction({ to: nftItem });
    expect(transferNftTx).toBeNotNull();

    val messages = transferNftTx!!.messages.load();

    val notificationLookup = messages.outMsgs.get(0);
    expect(notificationLookup.isFound).toEqual(true);

    val notificationCell = notificationLookup.loadValue();
    val notificationMessage = (
        notificationCell as cell as Cell<TlbMessageRelaxed<NftOwnershipAssigned>>
    ).load();

    expect(notificationMessage.info.dest).toEqual(buyer.address);

    val notification = notificationMessage.loadBody();
    expect(notification.queryId).toEqual(1);
    expect(notification.prevOwner).toEqual(deployer.address);

    val excessLookup = messages.outMsgs.get(1);
    expect(excessLookup.isFound).toEqual(true);

    val excessCell = excessLookup.loadValue();
    val excessMessage = (
        excessCell as cell as Cell<TlbMessageRelaxed<NftExcesses>>
    ).load();

    expect(excessMessage.info.dest).toEqual(deployer.address);

    val excess = excessMessage.loadBody();
    expect(excess.queryId).toEqual(1);
}
