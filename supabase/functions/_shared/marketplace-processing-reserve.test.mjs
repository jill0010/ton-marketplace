import test from "node:test";
import assert from "node:assert/strict";
import { calculateMarketplaceProcessingReserve } from "./marketplace-processing-reserve.js";

const marketplace = `0:${"1".repeat(64)}`;
const escrow = `0:${"2".repeat(64)}`;
const nftItem = `0:${"3".repeat(64)}`;
const buyer = `0:${"4".repeat(64)}`;
const seller = `0:${"5".repeat(64)}`;
const treasury = `0:${"6".repeat(64)}`;
const rootHash = "a".repeat(64);

function fixture(overrides = {}) {
  return {
    trace_id: "trace-1",
    is_incomplete: false,
    mc_seqno_end: "12345",
    trace_info: { pending_messages: 0 },
    transactions: {
      [rootHash]: { hash: rootHash, account: buyer, total_fees: "7000" },
      ["b".repeat(64)]: { hash: "b".repeat(64), account: marketplace, total_fees: "1100000" },
      ["c".repeat(64)]: { hash: "c".repeat(64), account: escrow, total_fees: "800000" },
      ["d".repeat(64)]: { hash: "d".repeat(64), account: nftItem, total_fees: "600000" },
      ["e".repeat(64)]: { hash: "e".repeat(64), account: seller, total_fees: "9000" },
      ["f".repeat(64)]: { hash: "f".repeat(64), account: treasury, total_fees: "8000" },
    },
    ...overrides,
  };
}

const input = {
  rootTransactionHash: rootHash,
  reserveNano: "200000000",
  marketplaceAddress: marketplace,
  escrowAddress: escrow,
  nftItemAddress: nftItem,
  buyerAddress: buyer,
  sellerAddress: seller,
  treasuryAddress: treasury,
};

test("reports observed contract fees without claiming reserve attribution or a refund", () => {
  const result = calculateMarketplaceProcessingReserve(fixture(), input);
  assert.equal(result.observedContractFeesNano, "2500000");
  assert.equal(result.refundableNano, null);
  assert.equal(result.shortfallNano, null);
  assert.equal(result.status, "manual_review_attribution_unproven");
  assert.equal(result.attributionVerified, false);
  assert.equal(result.previewOnly, true);
  assert.equal(result.refundAuthorized, false);
  assert.equal(result.feesByAccount[marketplace], "1100000");
  assert.equal(result.feesByAccount[escrow], "800000");
  assert.equal(result.feesByAccount[nftItem], "600000");
});

test("fails closed for an incomplete trace", () => {
  assert.throws(
    () => calculateMarketplaceProcessingReserve(fixture({ is_incomplete: true }), input),
    /incomplete/,
  );
});

test("fails closed while trace messages remain pending", () => {
  assert.throws(
    () => calculateMarketplaceProcessingReserve(
      fixture({ trace_info: { pending_messages: 1 } }),
      input,
    ),
    /pending messages/,
  );
});

test("fails closed when the payment transaction is not in the trace", () => {
  assert.throws(
    () => calculateMarketplaceProcessingReserve(
      fixture({ transactions: { ["b".repeat(64)]: { hash: "b".repeat(64), account: marketplace, total_fees: "1" } } }),
      input,
    ),
    /not part of/,
  );
});

test("fails closed when an unexpected account appears", () => {
  const trace = fixture();
  trace.transactions["9".repeat(64)] = {
    hash: "9".repeat(64),
    account: `0:${"9".repeat(64)}`,
    total_fees: "1",
  };
  assert.throws(
    () => calculateMarketplaceProcessingReserve(trace, input),
    /unexpected account/,
  );
});

test("never infers a reserve shortfall from pooled contract fees", () => {
  const trace = fixture();
  trace.transactions["b".repeat(64)].total_fees = "200000001";
  const result = calculateMarketplaceProcessingReserve(trace, input);
  assert.equal(result.status, "manual_review_attribution_unproven");
  assert.equal(result.refundableNano, null);
  assert.equal(result.shortfallNano, null);
  assert.equal(result.observedContractFeesNano, "201400001");
});

test("rejects duplicate transaction records", () => {
  const trace = fixture();
  trace.transactions["9".repeat(64)] = {
    hash: "b".repeat(64),
    account: marketplace,
    total_fees: "1",
  };
  assert.throws(
    () => calculateMarketplaceProcessingReserve(trace, input),
    /duplicate transaction/,
  );
});
