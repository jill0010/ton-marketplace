import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@contracts/TestReserveCoordinator"
import "@contracts/TestReserveVault"

fun coordinatorSetup(vaultCode: cell? = null): (address, address, address, address) {
    val owner = testing.treasury("coordinatorOwner").address;
    val marketplace = testing.treasury("emulatedMarketplace").address;
    val buyer = testing.treasury("coordinatorBuyer").address;
    val state: ContractState = {
        code: build("TestReserveCoordinator"),
        data: TestReserveCoordinatorStorage {
            owner,
            marketplace,
            vaultCode: vaultCode ?? build("TestReserveVault"),
            bindings: [],
        }.toCell(),
    };
    val destination = AutoDeployAddress {
        workchain: 0,
        stateInit: state,
    };
    val address = destination.calculateAddress();
    expect(
        net.send(
            owner,
            createMessage({
                bounce: false,
                value: grams("0.1"),
                dest: destination,
            }),
        ),
    ).toHaveSuccessfulDeploy({ to: address });
    return (address, owner, marketplace, buyer);
}

fun coordinatorSend(
    from: address,
    coordinator: address,
    orderId: uint64,
    buyer: address,
    value: coins,
): SendResultList {
    return net.send(
        from,
        createMessage({
            bounce: BounceMode.RichBounce,
            value,
            dest: coordinator,
            body: AllocateTestReserve {
                orderId,
                buyer,
                paymentHash: 12345,
            },
        }),
    );
}

get fun `test coordinator allocates reserve deploys vault and accepts exact funding acknowledgement`() {
    val (coordinator, owner, marketplace, buyer) = coordinatorSetup();
    expect(
        coordinatorSend(marketplace, coordinator, 1, buyer, grams("0.28")),
    ).toHaveSuccessfulTx({ to: coordinator });
    val binding = net.runGetMethod<TestReserveBinding?>(coordinator, "testReserveBinding", [1]);
    assert (binding != null) throw 799;
    expect(binding!!.status).toEqual(2);
    expect(binding.buyer).toEqual(buyer);
    expect(net.runGetMethod<uint8>(binding.vault, "testReserveStatus")).toEqual(1);
    expect(
        net.send(
            owner,
            createMessage({
                bounce: BounceMode.RichBounce,
                value: grams("0.05"),
                dest: binding.vault,
                body: ReviewTestReserve {
                    orderId: 1,
                    evidenceHash: 6789,
                    attributedCosts: grams("0.006"),
                    terminalKind: 1,
                },
            }),
        ),
    ).toHaveSuccessfulTx({ from: binding.vault, to: buyer });
    expect(net.runGetMethod<coins>(binding.vault, "testReserveRefund")).toEqual(grams("0.194"));
}

get fun `test coordinator blocks wrong source amount and duplicate order before any allocation`() {
    val (coordinator, owner, marketplace, buyer) = coordinatorSetup();
    expect(
        coordinatorSend(owner, coordinator, 1, buyer, grams("0.28")),
    ).toHaveFailedTx({ to: coordinator, exitCode: 721 });
    expect(
        coordinatorSend(marketplace, coordinator, 1, buyer, grams("0.27")),
    ).toHaveFailedTx({ to: coordinator, exitCode: 724 });
    expect(
        net.runGetMethod<TestReserveBinding?>(coordinator, "testReserveBinding", [1]) == null,
    ).toEqual(true);
    expect(
        coordinatorSend(marketplace, coordinator, 1, buyer, grams("0.28")),
    ).toHaveSuccessfulTx({ to: coordinator });
    expect(
        coordinatorSend(marketplace, coordinator, 1, buyer, grams("0.28")),
    ).toHaveFailedTx({ to: coordinator, exitCode: 723 });
}

get fun `test coordinator rejects forged ACK and accepts exact idempotent replay`() {
    val (coordinator, owner, marketplace, buyer) = coordinatorSetup();
    expect(
        coordinatorSend(marketplace, coordinator, 1, buyer, grams("0.28")),
    ).toHaveSuccessfulTx({ to: coordinator });
    val binding = net.runGetMethod<TestReserveBinding?>(coordinator, "testReserveBinding", [1])!!;
    expect(
        net.send(
            owner,
            createMessage({
                bounce: false,
                value: grams("0.01"),
                dest: coordinator,
                body: TestReserveFunded {
                    orderId: 1,
                    paymentHash: 12345,
                },
            }),
        ),
    ).toHaveFailedTx({ to: coordinator, exitCode: 721 });
    // Use the vault's real owner-only callback retry, not an impersonated sender.
    expect(
        net.send(
            owner,
            createMessage({
                bounce: false,
                value: grams("0.02"),
                dest: binding.vault,
                body: RetryTestReserveFundingAck { orderId: 1 },
            }),
        ),
    ).toHaveSuccessfulTx({ from: binding.vault, to: coordinator });
    expect(
        net.runGetMethod<TestReserveBinding?>(coordinator, "testReserveBinding", [1])!!.status,
    ).toEqual(2);
}

get fun `test coordinator derives separate vaults for separate orders`() {
    val (coordinator, _, marketplace, buyer) = coordinatorSetup();
    expect(
        coordinatorSend(marketplace, coordinator, 1, buyer, grams("0.28")),
    ).toHaveSuccessfulTx({ to: coordinator });
    expect(
        coordinatorSend(marketplace, coordinator, 2, buyer, grams("0.28")),
    ).toHaveSuccessfulTx({ to: coordinator });
    val first = net.runGetMethod<TestReserveBinding?>(coordinator, "testReserveBinding", [1])!!;
    val second = net.runGetMethod<TestReserveBinding?>(coordinator, "testReserveBinding", [2])!!;
    expect(first.vault == second.vault).toEqual(false);
    expect(first.status).toEqual(2);
    expect(second.status).toEqual(2);
}

get fun `test coordinator records failed vault funding without marking it funded`() {
    val (coordinator, _, marketplace, buyer) = coordinatorSetup(build("Empty"));
    val result = coordinatorSend(marketplace, coordinator, 1, buyer, grams("0.28"));
    expect(result).toHaveSuccessfulTx({ to: coordinator });
    val binding = net.runGetMethod<TestReserveBinding?>(coordinator, "testReserveBinding", [1])!!;
    expect(binding.status).toEqual(3);
    expect(binding.returnedNano > 200000000).toEqual(true);
    expect(
        coordinatorSend(marketplace, coordinator, 1, buyer, grams("0.28")),
    ).toHaveFailedTx({ to: coordinator, exitCode: 723 });
}
