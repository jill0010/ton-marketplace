// S04-P001: top up only the observed bounce fee difference after quorum proof.
// Never dispatch a refund here. Testnet-only isolated order.
import "@acton/env"
import "@acton/io"
import "@acton/emulation/network"
import "@acton/emulation/scripts"
import "@contracts/ReserveVaultV3"
import "@contracts/S04P001RejectOnceRecipient"

fun main() {
    assert (env<bool>("S04_P001_TOPUP_APPROVED") ?? false) throw 891;
    val owner = scripts.wallet("deployer").address;
    val expectedOwner = env<address>("S04_P001_OWNER_ADDRESS");
    val vault = env<address>("S04_P001_VAULT_ADDRESS");
    val recipient = env<address>("S04_P001_RECIPIENT_ADDRESS");
    assert (expectedOwner != null && vault != null && recipient != null) throw 892;
    assert (owner == expectedOwner!! && vault!! != recipient!!) throw 893;
    assert (net.runGetMethod<uint8>(vault!!, "reserveVaultStatusV3") == 4) throw 894;
    assert (net.runGetMethod<coins>(vault!!, "reserveVaultPrincipalV3") == grams("0.2")) throw 895;
    assert (net.runGetMethod<coins>(vault!!, "reserveVaultAvailableV3") == 199815198) throw 896;
    assert (net.runGetMethod<coins>(vault!!, "reserveVaultPaidV3") == 0) throw 897;
    assert (net.runGetMethod<coins>(vault!!, "reserveVaultInFlightV3") == 0) throw 898;
    assert (net.runGetMethod<uint8>(vault!!, "reserveVaultRetryCountV3") == 0) throw 899;
    assert (net.runGetMethod<uint32>(recipient!!, "s04P001RecipientAcceptedCount") == 0) throw 900;
    assert (!net.runGetMethod<bool>(recipient!!, "s04P001RecipientEnabled")) throw 901;
    assert (net.runGetMethod<address>(recipient!!, "s04P001RecipientVault") == vault!!) throw 902;
    val delta: coins = 184802;
    val topup = net.send(
        owner,
        createMessage({
            bounce: BounceMode.RichBounce,
            value: delta + grams("0.035"),
            dest: vault!!,
            body: TopUpReserveV3 {
                orderId: 666969981,
                fundingId: 666969981,
                principalTopUp: delta,
            }.toCell(),
        }),
    );
    topup.waitForTrace();
    assert (net.runGetMethod<uint8>(vault!!, "reserveVaultStatusV3") == 1) throw 903;
    assert (net.runGetMethod<coins>(vault!!, "reserveVaultAvailableV3") == grams("0.2")) throw 904;
    assert (net.runGetMethod<coins>(vault!!, "reserveVaultInFlightV3") == 0) throw 905;
    assert (net.runGetMethod<coins>(vault!!, "reserveVaultPaidV3") == 0) throw 906;
    assert (net.runGetMethod<uint8>(vault!!, "reserveVaultRetryCountV3") == 0) throw 907;
    println("S04-P001 TESTNET exact top-up confirmed: 184802 nanoTON, available=200000000 nanoTON, status=1");
    println("S04-P001 no recipient enablement or refund retry sent.");
}
