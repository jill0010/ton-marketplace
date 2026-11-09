// S04-P001: enable ONLY the isolated Testnet reject-once recipient.
// Do not dispatch or retry a refund here.
import "@acton/env"
import "@acton/io"
import "@acton/emulation/network"
import "@acton/emulation/scripts"
import "@contracts/ReserveVaultV3"
import "@contracts/S04P001RejectOnceRecipient"

fun main() {
    assert (env<bool>("S04_P001_ENABLE_APPROVED") ?? false) throw 911;
    val owner = scripts.wallet("deployer").address;
    val expectedOwner = env<address>("S04_P001_OWNER_ADDRESS");
    val vault = env<address>("S04_P001_VAULT_ADDRESS");
    val recipient = env<address>("S04_P001_RECIPIENT_ADDRESS");
    assert (expectedOwner != null && vault != null && recipient != null) throw 912;
    assert (owner == expectedOwner!! && vault!! != recipient!!) throw 913;
    assert (net.runGetMethod<uint8>(vault!!, "reserveVaultStatusV3") == 1) throw 914;
    assert (net.runGetMethod<coins>(vault!!, "reserveVaultPrincipalV3") == grams("0.2")) throw 915;
    assert (net.runGetMethod<coins>(vault!!, "reserveVaultAvailableV3") == grams("0.2")) throw 916;
    assert (net.runGetMethod<coins>(vault!!, "reserveVaultInFlightV3") == 0) throw 917;
    assert (net.runGetMethod<coins>(vault!!, "reserveVaultPaidV3") == 0) throw 918;
    assert (net.runGetMethod<uint8>(vault!!, "reserveVaultRetryCountV3") == 0) throw 919;
    assert (net.runGetMethod<uint64>(vault!!, "reserveVaultOperationV3") == 1) throw 920;
    assert (net.runGetMethod<address>(recipient!!, "s04P001RecipientVault") == vault!!) throw 921;
    assert (!net.runGetMethod<bool>(recipient!!, "s04P001RecipientEnabled")) throw 922;
    assert (net.runGetMethod<uint32>(recipient!!, "s04P001RecipientAcceptedCount") == 0) throw 923;

    val enable = net.send(
        owner,
        createMessage({
            bounce: BounceMode.RichBounce,
            value: grams("0.025"),
            dest: recipient!!,
            body: S04P001EnableReceipt {}.toCell(),
        }),
    );
    enable.waitForTrace();
    assert (net.runGetMethod<bool>(recipient!!, "s04P001RecipientEnabled")) throw 924;
    assert (net.runGetMethod<uint32>(recipient!!, "s04P001RecipientAcceptedCount") == 0) throw 925;
    assert (net.runGetMethod<uint8>(vault!!, "reserveVaultStatusV3") == 1) throw 926;
    assert (net.runGetMethod<uint8>(vault!!, "reserveVaultRetryCountV3") == 0) throw 927;
    println("S04-P001 TESTNET recipient enabled; acceptedCount=0; vault status=1; retryCount=0");
    println("S04-P001 no refund retry performed in this step.");
}
