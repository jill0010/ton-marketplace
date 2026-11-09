// S04-P001 only: fresh isolated Testnet vault + reject-once recipient.
// No historical orders, no Mainnet, no reserve dispatch or retry in this script.
import "@acton/build"
import "@acton/env"
import "@acton/io"
import "@acton/emulation/network"
import "@acton/emulation/scripts"
import "@contracts/ReserveVaultV3"
import "@contracts/S04P001RejectOnceRecipient"

fun main() {
    assert (env<bool>("S04_P001_DEPLOY_APPROVED") ?? false) throw 851;
    val orderId = env<int>("S04_P001_ORDER_ID") ?? 0;
    val paymentHash = env<int>("S04_P001_PAYMENT_HASH_INT") ?? 0;
    val verifier = env<address>("S04_P001_VERIFIER_ADDRESS");
    val expectedOwner = env<address>("S04_P001_OWNER_ADDRESS");
    val uniqueNonce = env<int>("S04_P001_UNIQUE_NONCE") ?? 0;
    assert (orderId > 4 && uniqueNonce > 0 && paymentHash > 0) throw 852;
    assert (verifier != null && expectedOwner != null) throw 853;
    val owner = scripts.wallet("deployer").address;
    assert (owner == expectedOwner!! && verifier!! != owner) throw 854;

    // Fresh recipient is independent of Vault address; owner binds Vault once
    // after both contracts have been deployed.
    val recipientState: ContractState = {
        code: build("S04P001RejectOnceRecipient"),
        data: S04P001RecipientStorage {
            owner,
            vault: owner,
            enabled: false,
            received: 0,
            acceptedCount: 0,
        }.toCell(),
    };
    val recipientDest = AutoDeployAddress { workchain: 0, stateInit: recipientState };
    val recipient = recipientDest.calculateAddress();

    // Unique order ID + payment hash makes the Vault StateInit unique.
    // The S04-specific nonce must be committed in the payment hash by caller.
    val vaultState: ContractState = {
        code: build("ReserveVaultV3"),
        data: ReserveVaultStorageV3 {
            owner,
            identity: ReserveVaultIdentityV3 {
                funding: ReserveVaultFundingIdentityV3 {
                    fundingSource: owner,
                    marketplace: owner,
                }.toCell(),
                parties: ReserveVaultPartiesV3 {
                    verifier: verifier!!,
                    buyer: recipient,
                }.toCell(),
                order: ReserveVaultOrderIdentityV3 {
                    orderId: orderId as uint64,
                    paymentHash: paymentHash as uint256,
                }.toCell(),
            }.toCell(),
            balances: ReserveVaultBalancesV3 {
                principal: grams("0.2"),
                available: 0,
                inFlight: 0,
                paid: 0,
                operationalBudget: 0,
            }.toCell(),
            operation: ReserveVaultOperationV3 {
                operationId: 0,
                queryId: 0,
                activeStatementHash: 0,
                dispatchMessageHash: 0,
                status: 0,
                retryCount: 0,
            }.toCell(),
            consumedStatements: [],
        }.toCell(),
    };
    val vaultDest = AutoDeployAddress { workchain: 0, stateInit: vaultState };
    val vault = vaultDest.calculateAddress();
    assert (recipient != vault && recipient != owner && vault != owner) throw 855;

    println("S04-P001 fresh Testnet order: {}", orderId);
    println("S04-P001 reject-once recipient: {}", recipient);
    println("S04-P001 isolated reserve vault: {}", vault);

    val deployRecipient = net.send(
        owner,
        createMessage({ bounce: false, value: grams("0.08"), dest: recipientDest }),
    );
    deployRecipient.waitForTrace();
    assert (!net.runGetMethod<bool>(recipient, "s04P001RecipientEnabled")) throw 856;

    val deployVault = net.send(
        owner,
        createMessage({ bounce: false, value: grams("0.12"), dest: vaultDest }),
    );
    deployVault.waitForTrace();
    assert (net.runGetMethod<uint8>(vault, "reserveVaultStatusV3") == 0) throw 857;
    assert (net.runGetMethod<coins>(vault, "reserveVaultPrincipalV3") == grams("0.2")) throw 858;

    val bind = net.send(
        owner,
        createMessage({
            bounce: BounceMode.RichBounce,
            value: grams("0.025"),
            dest: recipient,
            body: S04P001BindVault { vault }.toCell(),
        }),
    );
    bind.waitForTrace();
    assert (!net.runGetMethod<bool>(recipient, "s04P001RecipientEnabled")) throw 859;
    assert (net.runGetMethod<uint32>(recipient, "s04P001RecipientAcceptedCount") == 0) throw 860;

    println("S04-P001 Testnet deployment/binding submitted; verify recipient binding transaction before funding.");
    println("S04-P001 isolated Vault: {}", vault);
    println("S04-P001 isolated recipient: {}", recipient);
    println("No 0.2 TON reserve funding, dispatch, retry, or Mainnet transaction performed.");
}
