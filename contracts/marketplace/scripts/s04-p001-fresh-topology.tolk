// S04-P001: derive isolated Testnet vault/recipient StateInit without sending.
import "@acton/build"
import "@acton/env"
import "@acton/io"
import "@acton/emulation/network"
import "@contracts/ReserveVaultV3"
import "@contracts/S04P001RejectOnceRecipient"

fun main() {
    assert (env<bool>("S04_P001_TOPOLOGY_APPROVED") ?? false) throw 851;
    val orderId = env<int>("S04_P001_ORDER_ID") ?? 0;
    val paymentHash = env<int>("S04_P001_PAYMENT_HASH_INT") ?? 0;
    val owner = env<address>("S04_P001_OWNER_ADDRESS");
    val marketplace = env<address>("S04_P001_MARKETPLACE_ADDRESS");
    val funder = env<address>("S04_P001_FUNDER_ADDRESS");
    val verifier = env<address>("S04_P001_VERIFIER_ADDRESS");
    assert (orderId > 4 && paymentHash > 0) throw 852;
    assert (owner != null && marketplace != null && funder != null && verifier != null) throw 853;
    assert (owner!! != marketplace!! && owner!! != funder!! && owner!! != verifier!!) throw 854;
    val recipientState: ContractState = {
        code: build("S04P001RejectOnceRecipient"),
        data: S04P001RecipientStorage {
            owner: owner!!,
            vault: owner!!,
            enabled: false,
            received: 0,
            acceptedCount: 0,
        }.toCell(),
    };
    val recipient = AutoDeployAddress { workchain: 0, stateInit: recipientState }.calculateAddress();
    // A recipient bound to a vault and a vault bound to that recipient are
    // mutually recursive. Refuse to claim a valid pair from this naive topology.
    println("S04-P001 recipient candidate (NOT DEPLOYABLE, placeholder vault): {}", recipient);
    println("S04-P001 topology requires a non-circular binding design before broadcasting.");
    throw 855;
}
