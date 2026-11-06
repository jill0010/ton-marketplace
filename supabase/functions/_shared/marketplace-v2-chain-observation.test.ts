import { Address, beginCell } from "npm:@ton/core@0.63.1";
import { MARKETPLACE_V2_BUY_OPCODE } from "./marketplace-v2-buy-message.ts";
import { observeMarketplaceV2Buys } from "./marketplace-v2-chain-observation.ts";

const buyer = Address.parseRaw(`0:${"1".repeat(64)}`);
const marketplace = Address.parseRaw(`0:${"2".repeat(64)}`);
const price = 1_500_000_000n;
const boc = beginCell()
  .storeUint(MARKETPLACE_V2_BUY_OPCODE, 32)
  .storeUint(42, 64)
  .storeCoins(price)
  .storeUint(987654321, 64)
  .storeUint(1_800_000_000, 32)
  .endCell()
  .toBoc()
  .toString("base64");

function tx(overrides: Record<string, unknown> = {}) {
  return {
    hash: "a".repeat(64),
    lt: "123456789",
    mc_block_seqno: 7654321,
    emulated: false,
    description: {
      aborted: false,
      compute_ph: { success: true },
      action: { success: true },
    },
    in_msg: {
      hash: "b".repeat(64),
      in_msg_tx_hash: "c".repeat(64),
      source: buyer.toString({ urlSafe: true, bounceable: true }),
      destination: marketplace.toString({ urlSafe: true, bounceable: true }),
      value: (price + 200_000_000n).toString(),
      message_content: { body: boc },
    },
    ...overrides,
  };
}

Deno.test("observes a finalized Marketplace V2 purchase from a TON Center V3 row", () => {
  const observations = observeMarketplaceV2Buys([tx()], marketplace.toString());
  if (observations.length !== 1) throw new Error("Expected exactly one purchase observation");
  const observed = observations[0];
  if (observed.productId !== "42" ||
      observed.expectedPriceNano !== price.toString() ||
      observed.reserveNano !== "200000000" ||
      observed.totalPaymentNano !== (price + 200_000_000n).toString() ||
      observed.paymentQueryId !== "987654321" ||
      observed.parentTransactionHash !== "c".repeat(64) ||
      observed.marketplaceTransactionHash !== "a".repeat(64)) {
    throw new Error("Purchase observation fields are not exact");
  }
});

Deno.test("ignores unrelated, failed, unfinalized and unlinked transaction rows", () => {
  const rows = [
    tx({ in_msg: null }),
    tx({ in_msg: { ...tx().in_msg, in_msg_tx_hash: null } }),
    tx({ mc_block_seqno: 0 }),
    tx({ description: { aborted: true, compute_ph: { success: false }, action: { success: false } } }),
    tx({ in_msg: { ...tx().in_msg, value: (price + 199_000_000n).toString() } }),
    tx({ in_msg: { ...tx().in_msg, value: Number(price + 200_000_000n) } }),
  ];
  const observations = observeMarketplaceV2Buys(rows, marketplace.toString());
  if (observations.length !== 0) throw new Error("An invalid transaction was observed as a purchase");
});

Deno.test("fails closed when the transaction page is not an array", () => {
  let rejected = false;
  try { observeMarketplaceV2Buys({}, marketplace.toString()); } catch { rejected = true; }
  if (!rejected) throw new Error("Invalid transaction page was accepted");
});
