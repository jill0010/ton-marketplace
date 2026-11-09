// S04-P001: fund exactly one newly deployed isolated Testnet Vault.
// No dispatch, retry, attestation, or Mainnet transaction in this stage.
import "@acton/env"
import "@acton/io"
import "@acton/emulation/network"
import "@acton/emulation/scripts"
import "@contracts/ReserveVaultV3"

fun main() {
    assert (env<bool>("S04_P001_FUND_APPROVED") ?? false) throw 871;
    val orderId = env<int>("S04_P001_ORDER_ID") ?? 0;
    val paymentHash = env<int>("S04_P001_PAYMENT_HASH_INT") ?? 0;
    val vault = env<address>("S04_P001_VAULT_ADDRESS");
    val expectedOwner = env<address>("S04_P001_OWNER_ADDRESS");
    assert (orderId > 4 && paymentHash > 0 && vault != null && expectedOwner != null) throw 872;
    val owner = scripts.wallet("deployer").address;
    assert (owner == expectedOwner!! && vault!! != owner) throw 873;
    // A second funding attempt must not send any funds.
    assert (net.runGetMethod<uint8>(vault!!, "reserveVaultStatusV3") == 0) throw 874;
    assert (net.runGetMethod<coins>(vault!!, "reserveVaultAvailableV3") == 0) throw 875;
    assert (net.runGetMethod<coins>(vault!!, "reserveVaultPrincipalV3") == grams("0.2")) throw 876;

    val funding = net.send(
        owner,
        createMessage({
            bounce: BounceMode.RichBounce,
            value: grams("0.29"),
            dest: vault!!,
            body: FundReserveV3 {
                orderId: orderId as uint64,
                paymentHash: paymentHash as uint256,
            }.toCell(),
        }),
    );
    funding.waitForTrace();
    assert (net.runGetMethod<uint8>(vault!!, "reserveVaultStatusV3") == 1) throw 877;
    assert (net.runGetMethod<coins>(vault!!, "reserveVaultAvailableV3") == grams("0.2")) throw 878;
    assert (net.runGetMethod<coins>(vault!!, "reserveVaultInFlightV3") == 0) throw 879;
    println("S04-P001 TESTNET reserve funded: {}", vault!!);
    println("S04-P001 TESTNET available principal: 0.2 TON");
    println("S04-P001 refund dispatch NOT performed.");
}
