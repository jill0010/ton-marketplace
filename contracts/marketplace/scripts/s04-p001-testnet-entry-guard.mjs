// S04-P001 isolated Testnet execution gate. No network, secrets, or signing.
import process from "node:process";
const fail = (reason) => { console.error("S04-P001 BLOCKED: " + reason); process.exit(1); };
const e = process.env;
if (e.GITHUB_REF !== "refs/heads/feature/reserve-refund-v3-audit") fail("wrong branch");
if (e.S04_P001_NETWORK !== "testnet") fail("network must be testnet");
if (e.S04_P001_MODE !== "preflight") fail("only preflight is enabled; on-chain execution is not approved by this entry");
if (e.S04_P001_CONFIRM !== "S04-P001-FRESH-TESTNET-ONLY") fail("missing explicit fresh-order confirmation");
const id = e.S04_P001_ORDER_ID || "";
if (!/^[1-9][0-9]{0,14}$/.test(id) || BigInt(id) <= 4n) fail("order ID must be fresh and greater than historical orders 1-4");
if (!/^[a-f0-9]{64}$/i.test(e.S04_P001_PAYMENT_HASH || "")) fail("64-character nonzero payment hash required");
if (/^0+$/.test(e.S04_P001_PAYMENT_HASH || "")) fail("payment hash cannot be zero");
if (e.S04_P001_EXISTING_VAULT || e.S04_P001_EXISTING_BUYER) fail("existing vault or buyer reuse forbidden");
console.log(JSON.stringify({
  scope:"S04-P001", branch:e.GITHUB_REF, network:"testnet",
  mode:"preflight", orderId:id, paymentHash:e.S04_P001_PAYMENT_HASH,
  freshVaultRequired:true, freshRejectorRequired:true,
  onChainTransactionsEnabled:false, mainnetEnabled:false,
  result:"PASS: isolated execution prerequisites only; no deployment or refund performed"
},null,2));
