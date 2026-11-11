import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@contracts/ReserveCoordinatorV3"
import "@contracts/ReserveVaultV3"

fun productionCoordinatorSetup(vaultCode: cell? = null): (
    address,
    address,
    address,
    address,
    address,
) {
    val owner = testing.treasury("productionCoordinatorOwner").address;
    val marketplace = testing.treasury("productionCoordinatorMarketplace").address;
    val verifier = testing.treasury("productionCoordinatorVerifier").address;
    val buyer = testing.treasury("productionCoordinatorBuyer").address;
    val state: ContractState = {
        code: build("ReserveCoordinatorV3"),
        data: ReserveCoordinatorStorageV3 {
            owner,
            marketplace,
            verifier,
            vaultCode: vaultCode ?? build("ReserveVaultV3"),
            bindings: [],
        }.toCell(),
    };
    val destination = AutoDeployAddress {
        workchain: 0,
        stateInit: state,
    };
    val coordinator = destination.calculateAddress();
    expect(
        net.send(
            owner,
            createMessage({ bounce: false, value: grams("0.1"), dest: destination }),
        ),
    ).toHaveSuccessfulDeploy({ to: coordinator });
    return (coordinator, owner, marketplace, verifier, buyer);
}

fun productionCoordinatorAllocate(
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
            body: AllocateReserveV3 {
                orderId,
                buyer,
                paymentHash: 12345 + orderId,
            }.toCell(),
        }),
    );
}

get fun `test production coordinator deploys and funds a dedicated vault for each order`() {
    val (coordinator, _, marketplace, verifier, buyer) = productionCoordinatorSetup();
    expect(
        productionCoordinatorAllocate(marketplace, coordinator, 1, buyer, grams("0.28")),
    ).toHaveSuccessfulTx({ to: coordinator });
    val first = net.runGetMethod<ReserveCoordinatorBindingV3?>(
        coordinator,
        "reserveCoordinatorBindingV3",
        [1],
    )!!;
    expect(first.status).toEqual(2);
    expect(first.buyer).toEqual(buyer);
    expect(net.runGetMethod<uint8>(first.vault, "reserveVaultStatusV3")).toEqual(1);
    expect(net.runGetMethod<coins>(first.vault, "reserveVaultPrincipalV3")).toEqual(grams("0.2"));
    expect(net.runGetMethod<coins>(first.vault, "reserveVaultAvailableV3")).toEqual(grams("0.2"));
    expect(
        net.runGetMethod<address>(coordinator, "reserveCoordinatorVerifierV3"),
    ).toEqual(verifier);
    expect(
        productionCoordinatorAllocate(marketplace, coordinator, 2, buyer, grams("0.28")),
    ).toHaveSuccessfulTx({ to: coordinator });
    val second = net.runGetMethod<ReserveCoordinatorBindingV3?>(
        coordinator,
        "reserveCoordinatorBindingV3",
        [2],
    )!!;
    expect(first.vault == second.vault).toEqual(false);
    expect(second.status).toEqual(2);
}

get fun `test production coordinator rejects wrong source amount and duplicate order`() {
    val (coordinator, owner, marketplace, _, buyer) = productionCoordinatorSetup();
    expect(
        productionCoordinatorAllocate(owner, coordinator, 1, buyer, grams("0.28")),
    ).toHaveFailedTx({ to: coordinator, exitCode: 781 });
    expect(
        productionCoordinatorAllocate(marketplace, coordinator, 1, buyer, grams("0.27")),
    ).toHaveFailedTx({ to: coordinator, exitCode: 784 });
    expect(
        net.runGetMethod<ReserveCoordinatorBindingV3?>(
            coordinator,
            "reserveCoordinatorBindingV3",
            [1],
        ) ==
            null,
    ).toEqual(true);
    expect(
        productionCoordinatorAllocate(marketplace, coordinator, 1, buyer, grams("0.28")),
    ).toHaveSuccessfulTx({ to: coordinator });
    expect(
        productionCoordinatorAllocate(marketplace, coordinator, 1, buyer, grams("0.28")),
    ).toHaveFailedTx({ to: coordinator, exitCode: 783 });
}

get fun `test production coordinator quarantines failed vault funding and returns only reserve principal`() {
    val (coordinator, _, marketplace, _, buyer) = productionCoordinatorSetup(build("Empty"));
    val result = productionCoordinatorAllocate(marketplace, coordinator, 1, buyer, grams("0.28"));
    expect(result).toHaveSuccessfulTx({ to: coordinator });
    expect(result).toHaveSuccessfulTx<ReserveAllocationFailedV3>({
        from: coordinator,
        to: marketplace,
    });
    val binding = net.runGetMethod<ReserveCoordinatorBindingV3?>(
        coordinator,
        "reserveCoordinatorBindingV3",
        [1],
    )!!;
    expect(binding.status).toEqual(3);
    expect(binding.returnedNano > 200000000).toEqual(true);
}
