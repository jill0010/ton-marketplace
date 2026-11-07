import test from "node:test";
import assert from "node:assert/strict";
import { inspectV3TestnetOrder, parseV3StackInteger, validV3GetterCell } from "./inspect-v3-testnet-order.mjs";
import { beginCell } from "@ton/core";
const marketplace = "0:" + "a".repeat(64);
const validBoc = beginCell().storeUint(1, 1).endCell().toBoc().toString("base64");
test("rejects malformed and negative getter integers", () => {
  assert.equal(parseV3StackInteger([["num", "0x2a"]]), 42n);
  assert.equal(parseV3StackInteger([["null", ""]]), null);
  assert.throws(() => parseV3StackInteger([["num", "-1"]]), /Invalid TVM integer/);
  assert.throws(() => parseV3StackInteger([["num", "hello"]]), /Invalid TVM integer/);
});
test("order inspector uses read-only POST getters and never claims settlement", async () => {
  const methods = [];
  const fetcher = async (url, opts) => {
    assert.equal(url, "https://testnet.toncenter.com/api/v2/runGetMethod");
    assert.equal(opts.method, "POST");
    const req = JSON.parse(opts.body);
    methods.push(req.method);
    assert.equal(req.address, marketplace);
    assert.deepEqual(req.stack, [["num", "0x1"]]);
    return { ok: true, json: async () => ({ ok: true, result: {
      exit_code: 0, stack: [["cell", { bytes: validBoc }]],
    } }) };
  };
  const report = await inspectV3TestnetOrder({ marketplace, orderId: 1 }, fetcher);
  assert.deepEqual(methods, ["orderCellV2", "testPurchaseReserve"]);
  assert.equal(report.orderExists, true);
  assert.equal(report.reservePresent, true);
  assert.equal(report.settlementVerified, false);
  assert.equal(report.refundFinalityVerified, false);
  assert.equal(report.mainnetApproved, false);
});
test("missing order cannot pass existence check", async () => {
  const fetcher = async () => ({ ok: true, json: async () =>
    ({ ok: true, result: { exit_code: 0, stack: [["null", ""]] } }) });
  const report = await inspectV3TestnetOrder({ marketplace, orderId: 1 }, fetcher);
  assert.equal(report.orderExists, false);
  assert.equal(report.reservePresent, false);
});
test("rejects malformed response and invalid order IDs", async () => {
  await assert.rejects(inspectV3TestnetOrder({ marketplace, orderId: 0 }), /Invalid order ID/);
  const fetcher = async () => ({ ok: true, json: async () =>
    ({ ok: true, result: { exit_code: 0, stack: [["num", "0x1"]] } }) });
  await assert.rejects(inspectV3TestnetOrder({ marketplace, orderId: 1 }, fetcher),
    /Unrecognized order getter response/);
});

test("malformed BOC cannot masquerade as an existing order or reserve", () => {
  assert.equal(validV3GetterCell([["cell", { bytes: "mock" }]]), false);
  assert.equal(validV3GetterCell([["cell", { bytes: validBoc }]]), true);
});
test("TON Center empty tvm.list represents an absent optional order or reserve", async () => {
  const methods = [];
  const fetcher = async (_url, options) => {
    const method = JSON.parse(options.body).method;
    methods.push(method);
    return { ok: true, json: async () => ({ ok: true, result: {
      exit_code: 0, stack: [["list", { "@type": "tvm.list", elements: [] }]],
    } }) };
  };
  const report = await inspectV3TestnetOrder({ marketplace, orderId: 1 }, fetcher);
  assert.deepEqual(methods, ["orderCellV2", "testPurchaseReserve"]);
  assert.equal(report.orderExists, false);
  assert.equal(report.reservePresent, false);
  assert.equal(report.noTransactionSent, true);
});


test("normalizes empty optional getter stack variants", async () => {
  for (const emptyStack of [
    [],
    ["list", { "@type": "tvm.list", elements: [] }],
    [["list", { "@type": "tvm.list", elements: [] }]],
  ]) {
    const fetcher = async () => ({ ok: true, json: async () => ({
      ok: true, result: { exit_code: 0, stack: emptyStack },
    }) });
    const report = await inspectV3TestnetOrder({ marketplace, orderId: 1 }, fetcher);
    assert.equal(report.orderExists, false);
    assert.equal(report.reservePresent, false);
  }
});

test("recognizes only the exact empty four-slot Tolk optional result", async () => {
  const emptyOptional = [
    ["list", { "@type": "tvm.list", elements: [] }],
    ["list", { "@type": "tvm.list", elements: [] }],
    ["list", { "@type": "tvm.list", elements: [] }],
    ["num", "0x0"],
  ];
  const fetcher = async () => ({ ok: true, json: async () => ({
    ok: true, result: { exit_code: 0, stack: emptyOptional },
  }) });
  const report = await inspectV3TestnetOrder({ marketplace, orderId: 1 }, fetcher);
  assert.equal(report.orderExists, false);
  assert.equal(report.reservePresent, false);
  assert.equal(report.noTransactionSent, true);
  const malformed = [...emptyOptional];
  malformed[2] = ["num", "0x1"];
  const malformedFetcher = async () => ({ ok: true, json: async () => ({
    ok: true, result: { exit_code: 0, stack: malformed },
  }) });
  await assert.rejects(inspectV3TestnetOrder({ marketplace, orderId: 1 }, malformedFetcher),
    /Unexpected optional TVM getter stack/);
});
