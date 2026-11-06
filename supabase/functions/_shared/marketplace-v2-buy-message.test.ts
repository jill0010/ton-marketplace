import { Address, beginCell } from "npm:@ton/core@0.63.1";
import {
  decodeBuyProductV2Body,
  MARKETPLACE_V2_BUY_OPCODE,
  validateBuyProductV2Transaction,
} from "./marketplace-v2-buy-message.ts";

const buyer = Address.parseRaw(`0:${"1".repeat(64)}`);
const marketplace = Address.parseRaw(`0:${"2".repeat(64)}`);
const price = 1_500_000_000n;
const queryId = 987654321n;
const deadline = 1_800_000_000;

function body(opcode = MARKETPLACE_V2_BUY_OPCODE, extra = false) {
  const builder = beginCell()
    .storeUint(opcode, 32)
    .storeUint(42, 64)
    .storeCoins(price)
    .storeUint(queryId, 64)
    .storeUint(deadline, 32);
  if (extra) builder.storeBit(1);
  return builder.endCell().toBoc().toString("base64");
}

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    bodyBocBase64: body(),
    destination: marketplace.toString({ urlSafe: true, bounceable: true }),
    expectedMarketplaceAddress: marketplace.toString({ urlSafe: true, bounceable: true }),
    source: buyer.toString({ urlSafe: true, bounceable: true }),
    transactionValueNano: (price + 200_000_000n).toString(),
    transactionHash: "a".repeat(64),
    messageHash: "b".repeat(64),
    masterchainBlockSeqno: 123456,
    emulated: false,
    aborted: false,
    computeSuccess: true,
    actionSuccess: true,
    ...overrides,
  };
}

Deno.test("decodes the exact BuyProductV2 ABI and preserves integer precision", () => {
  const decoded = decodeBuyProductV2Body(body());
  if (decoded.productId !== 42n || decoded.expectedPriceNano !== price ||
      decoded.queryId !== queryId || decoded.deadline !== deadline) {
    throw new Error("Decoded BuyProductV2 fields do not match the fixture");
  }
});

Deno.test("accepts only a finalized successful payment with exactly 0.2 TON reserve", () => {
  const decoded = validateBuyProductV2Transaction(transaction());
  if (decoded.reserveNano !== 200_000_000n ||
      decoded.totalPaymentNano !== price + 200_000_000n ||
      decoded.buyerRaw !== buyer.toRawString().toLowerCase()) {
    throw new Error("Validated purchase snapshot is incorrect");
  }
});

Deno.test("rejects a different opcode", () => {
  let rejected = false;
  try { decodeBuyProductV2Body(body(0x71b00001)); } catch { rejected = true; }
  if (!rejected) throw new Error("Unexpected opcode was accepted");
});

Deno.test("rejects trailing body data", () => {
  let rejected = false;
  try { decodeBuyProductV2Body(body(MARKETPLACE_V2_BUY_OPCODE, true)); } catch { rejected = true; }
  if (!rejected) throw new Error("Trailing body data was accepted");
});

Deno.test("rejects underpayment, overpayment, emulation, aborted and unfinalized records", () => {
  const invalid = [
    transaction({ transactionValueNano: (price + 199_999_999n).toString() }),
    transaction({ transactionValueNano: (price + 200_000_001n).toString() }),
    transaction({ emulated: true }),
    transaction({ aborted: true }),
    transaction({ masterchainBlockSeqno: 0 }),
    transaction({ actionSuccess: false }),
  ];
  for (const candidate of invalid) {
    let rejected = false;
    try { validateBuyProductV2Transaction(candidate as Parameters<typeof validateBuyProductV2Transaction>[0]); }
    catch { rejected = true; }
    if (!rejected) throw new Error("An invalid purchase transaction was accepted");
  }
});
