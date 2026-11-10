import { Address, beginCell } from "npm:@ton/core@0.63.1";
import { MARKETPLACE_V2_BUY_OPCODE } from "./marketplace-v2-buy-message.ts";
import { reconcileV3TestnetPurchaseObservation, type V3TestnetOrderBinding } from "./marketplace-v3-testnet-payment-reconciliation.ts";

const marketplace = Address.parseRaw(`0:${"2".repeat(64)}`);
const buyer = Address.parseRaw(`0:${"1".repeat(64)}`);
const price = 1_500_000_000n;
const body = beginCell()
  .storeUint(MARKETPLACE_V2_BUY_OPCODE, 32)
  .storeUint(42, 64)
  .storeCoins(price)
  .storeUint(987654321, 64)
  .storeUint(1_800_000_000, 32)
  .endCell().toBoc().toString("base64");
const binding: V3TestnetOrderBinding = {
  network: "-3", marketplaceRaw: marketplace.toRawString(),
  orderId: "77", productId: "42", paymentQueryId: "987654321",
  buyerRaw: buyer.toRawString(), priceNano: price.toString(),
  reserveNano: "200000000", onChainOrderIdForProduct: "77",
  onChainProductStatus: "3",
};
function tx() {
  return {
    hash: "a".repeat(64), lt: "123456789", mc_block_seqno: 7654321,
    emulated: false,
    description: { aborted: false, compute_ph: { success: true }, action: { success: true } },
    in_msg: {
      hash: "b".repeat(64), in_msg_tx_hash: "c".repeat(64),
      source: buyer.toString(), destination: marketplace.toString(),
      value: (price + 200_000_000n).toString(),
      message_content: { body },
    },
  };
}
Deno.test("S06 Testnet purchase evidence is matched but never marked finalized", () => {
  const found = reconcileV3TestnetPurchaseObservation([tx()], binding);
  if (!found || found.state !== "observed_unfinalized" ||
      found.paymentTxHash !== "a".repeat(64) ||
      found.orderId !== "77" || found.buyerRaw !== buyer.toRawString()) {
    throw new Error("Expected exact unfinalized Testnet evidence");
  }
});
Deno.test("S06 rejects inconsistent on-chain order binding", () => {
  let rejected = false;
  try {
    reconcileV3TestnetPurchaseObservation([tx()], {
      ...binding, onChainOrderIdForProduct: "78",
    });
  } catch { rejected = true; }
  if (!rejected) throw new Error("Inconsistent chain order was accepted");
});
Deno.test("S06 rejects duplicated payment evidence", () => {
  let rejected = false;
  try { reconcileV3TestnetPurchaseObservation([tx(), tx()], binding); }
  catch { rejected = true; }
  if (!rejected) throw new Error("Duplicate chain payment evidence was accepted");
});
Deno.test("S06 ignores an unsuccessful candidate purchase", () => {
  const failed = { ...tx(), description: { aborted: true, compute_ph: { success: false }, action: { success: false } } };
  if (reconcileV3TestnetPurchaseObservation([failed], binding) !== null) {
    throw new Error("Failed transaction was accepted");
  }
});
