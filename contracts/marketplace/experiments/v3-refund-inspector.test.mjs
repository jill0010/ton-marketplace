import test from "node:test";
import assert from "node:assert/strict";
import { inspectReserveRefundTransfers } from "./v3-refund-inspector.mjs";

const vault = "0:" + "a".repeat(64);
const buyer = "0:" + "b".repeat(64);
const other = "0:" + "c".repeat(64);

test("end-to-end read-only inspection extracts candidates without enabling refund retry", async () => {
  let calls = 0;
  const report = await inspectReserveRefundTransfers({
    vault, buyer,
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url.searchParams.get("address"), vault);
      assert.equal(options.method, "GET");
      return {
        ok: true,
        json: async () => ({
          ok: true,
          result: [{
            transaction_id: { lt: "99", hash: "transaction-hash" },
            out_msgs: [
              { source: vault, destination: buyer, value: "194000000" },
              { source: vault, destination: other, value: "194000000" },
            ],
          }],
        }),
      };
    },
  });
  assert.equal(calls, 1);
  assert.equal(report.network, "testnet");
  assert.equal(report.transactions[0].outgoingCandidates.length, 1);
  assert.equal(report.transactions[0].outgoingCandidates[0].verified, false);
  assert.equal(report.proofStatus, "UNVERIFIED");
  assert.equal(report.mayRetry, false);
});
test("failed provider request does not produce an apparently successful report", async () => {
  await assert.rejects(inspectReserveRefundTransfers({
    vault, buyer,
    fetchImpl: async () => ({ ok: false }),
  }), /failed/);
});
