// S04-P001 only. Dispatch the sole allowed retry to the already-enabled
// isolated Testnet recipient. Repeated execution is rejected before sending.
import "@acton/env"
import "@acton/io"
import "@acton/emulation/network"
import "@acton/emulation/scripts"
import "@contracts/ReserveVaultV3"
import "@contracts/S04P001RejectOnceRecipient"

fun main() {
    assert (env<bool>("S04_P001_RETRY_APPROVED") ?? false) throw 931;
    val owner = scripts.wallet("deployer").address;
    val expectedOwner = env<address>("S04_P001_OWNER_ADDRESS");
    val vault = env<address>("S04_P001_VAULT_ADDRESS");
    val recipient = env<address>("S04_P001_RECIPIENT_ADDRESS");
    assert (expectedOwner != null && vault != null && recipient != null) throw 932;
    assert (owner == expectedOwner!! && vault!! != recipient!!) throw 933;
    assert (net.runGetMethod<uint8>(vault!!, "reserveVaultStatusV3") == 1) throw 934;
    assert (net.runGetMethod<coins>(vault!!, "reserveVaultPrincipalV3") == grams("0.2")) throw 935;
    assert (net.runGetMethod<coins>(vault!!, "reserveVaultAvailableV3") == grams("0.2")) throw 936;
    assert (net.runGetMethod<coins>(vault!!, "reserveVaultInFlightV3") == 0) throw 937;
    assert (net.runGetMethod<coins>(vault!!, "reserveVaultPaidV3") == 0) throw 938;
    assert (net.runGetMethod<uint8>(vault!!, "reserveVaultRetryCountV3") == 0) throw 939;
    assert (net.runGetMethod<uint64>(vault!!, "reserveVaultOperationV3") == 1) throw 940;
    assert (net.runGetMethod<uint64>(vault!!, "reserveVaultQueryV3") == 1) throw 941;
    assert (net.runGetMethod<address>(recipient!!, "s04P001RecipientVault") == vault!!) throw 942;
    assert (net.runGetMethod<bool>(recipient!!, "s04P001RecipientEnabled")) throw 943;
    assert (net.runGetMethod<uint32>(recipient!!, "s04P001RecipientAcceptedCount") == 0) throw 944;
    assert (net.runGetMethod<coins>(recipient!!, "s04P001RecipientReceived") == 0) throw 945;

    val retry = net.send(
        owner,
        createMessage({
            bounce: BounceMode.RichBounce,
            value: grams("0.05"),
            dest: vault!!,
            body: RetryReserveRefundV3 {
                orderId: 666969981,
            }.toCell(),
        }),
    );
    retry.waitForTrace();

    assert (net.runGetMethod<uint8>(vault!!, "reserveVaultStatusV3") == 2) throw 946;
    assert (net.runGetMethod<coins>(vault!!, "reserveVaultInFlightV3") == grams("0.2")) throw 947;
    assert (net.runGetMethod<coins>(vault!!, "reserveVaultAvailableV3") == 0) throw 948;
    assert (net.runGetMethod<uint8>(vault!!, "reserveVaultRetryCountV3") == 1) throw 949;
    assert (net.runGetMethod<uint64>(vault!!, "reserveVaultOperationV3") == 2) throw 950;
    assert (net.runGetMethod<uint64>(vault!!, "reserveVaultQueryV3") == 2) throw 951;
    assert (net.runGetMethod<uint32>(recipient!!, "s04P001RecipientAcceptedCount") == 1) throw 952;
    assert (net.runGetMethod<coins>(recipient!!, "s04P001RecipientReceived") == grams("0.2")) throw 953;
    println("S04-P001 TESTNET sole refund retry succeeded: recipient acceptedCount=1 received=0.2 TON");
    println("S04-P001 Vault status=2 inFlight=0.2 TON retryCount=1 operation=2 query=2.");
    println("S04-P001 no final settlement attestation performed; no second retry allowed.");
}
