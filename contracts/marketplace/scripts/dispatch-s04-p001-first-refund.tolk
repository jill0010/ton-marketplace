// S04-P001: first refund dispatch only; reject-once recipient must remain disabled.
import "@acton/env"
import "@acton/io"
import "@acton/emulation/network"
import "@acton/emulation/scripts"
import "@contracts/ReserveVaultV3"
import "@contracts/S04P001RejectOnceRecipient"

fun main() {
    assert (env<bool>("S04_P001_DISPATCH_APPROVED") ?? false) throw 881;
    val owner = scripts.wallet("deployer").address;
    val expectedOwner = env<address>("S04_P001_OWNER_ADDRESS");
    val vault = env<address>("S04_P001_VAULT_ADDRESS");
    val recipient = env<address>("S04_P001_RECIPIENT_ADDRESS");
    assert (expectedOwner != null && vault != null && recipient != null) throw 882;
    assert (owner == expectedOwner!! && vault!! != recipient!!) throw 883;
    assert (net.runGetMethod<address>(recipient!!, "s04P001RecipientVault") == vault!!) throw 884;
    assert (!net.runGetMethod<bool>(recipient!!, "s04P001RecipientEnabled")) throw 885;
    assert (net.runGetMethod<uint32>(recipient!!, "s04P001RecipientAcceptedCount") == 0) throw 886;
    assert (net.runGetMethod<uint8>(vault!!, "reserveVaultStatusV3") == 1) throw 887;
    assert (net.runGetMethod<coins>(vault!!, "reserveVaultAvailableV3") == grams("0.2")) throw 888;
    assert (net.runGetMethod<uint64>(vault!!, "reserveVaultOperationV3") == 0) throw 889;
    val dispatch = net.send(
        owner,
        createMessage({
            bounce: BounceMode.RichBounce,
            value: grams("0.05"),
            dest: vault!!,
            body: DispatchReserveRefundV3 { orderId: 666969981 }.toCell(),
        }),
    );
    dispatch.waitForTrace();
    assert (net.runGetMethod<uint8>(vault!!, "reserveVaultStatusV3") == 2) throw 890;
    assert (net.runGetMethod<coins>(vault!!, "reserveVaultInFlightV3") == grams("0.2")) throw 891;
    assert (net.runGetMethod<uint64>(vault!!, "reserveVaultOperationV3") == 1) throw 892;
    assert (net.runGetMethod<uint32>(recipient!!, "s04P001RecipientAcceptedCount") == 0) throw 893;
    println("S04-P001 TESTNET first refund dispatched; operation=1; inFlight=0.2 TON");
    println("S04-P001 TESTNET reject-once recipient acceptedCount=0");
    println("S04-P001 TESTNET no attestation, top-up or retry submitted.");
}
