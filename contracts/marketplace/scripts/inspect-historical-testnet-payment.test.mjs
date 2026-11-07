import test from "node:test";
import assert from "node:assert/strict";
import { classifyHistoricalPayment, inspectHistoricalTestnetPayment, HISTORICAL_PAYMENT } from "./inspect-historical-testnet-payment.mjs";
const tx = { transaction_id: { hash: HISTORICAL_PAYMENT.hash }, in_msg: { value: "210000000" }, out_msgs: [] };
test("historical inbound is not mistaken for a confirmed refund", () => {
  const result = classifyHistoricalPayment([tx]);
  assert.equal(result.inboundMatches, true);
  assert.equal(result.outboundCount, 0);
  assert.equal(result.refundConfirmed, false);
  assert.equal(result.retryAuthorized, false);
});
test("wrong inbound amount and missing transaction fail closed", () => {
  assert.equal(classifyHistoricalPayment([{...tx, in_msg: {value:"200000000"}}]).reason, "INBOUND_AMOUNT_MISMATCH");
  assert.equal(classifyHistoricalPayment([]).state, "UNRESOLVED");
  assert.equal(classifyHistoricalPayment([tx,tx]).reason, "DUPLICATE_TRANSACTION");
});
test("RPC inspection only GETs testnet history and does not authorize funds", async () => {
  const report = await inspectHistoricalTestnetPayment(async (url, options) => {
    assert.match(url, /^https:\/\/testnet\.toncenter\.com\/api\/v2\/getTransactions\?/);
    assert.equal(options.method, "GET");
    return {ok:true,json:async()=>({ok:true,result:[tx]})};
  });
  assert.equal(report.inboundMatches,true);
  assert.equal(report.readOnly,true);
  assert.equal(report.mainnetApproved,false);
});

test("archival pagination advances using oldest transaction cursor and finds target", async () => {
  const filler = Array.from({length:100}, (_,i) => ({
    transaction_id: {hash: (i+1).toString(16).padStart(64,"0"),lt:String(1000-i)},
    in_msg: {value:"1"}, out_msgs: [],
  }));
  let calls=0;
  const report=await inspectHistoricalTestnetPayment(async url => {
    calls++;
    if (calls===2) {
      const parsed=new URL(url);
      assert.equal(parsed.searchParams.get("lt"),"901");
      assert.equal(parsed.searchParams.get("hash"),filler[99].transaction_id.hash);
    }
    return {ok:true,json:async()=>({ok:true,result:calls===1?filler:[tx]})};
  });
  assert.equal(calls,2);
  assert.equal(report.pagesInspected,2);
  assert.equal(report.inspectedTransactions,101);
  assert.equal(report.inboundMatches,true);
});
test("bounded history without target remains unresolved", async () => {
  const report=await inspectHistoricalTestnetPayment(async()=>({
    ok:true,json:async()=>({ok:true,result:[]}),
  }));
  assert.equal(report.state,"UNRESOLVED");
  assert.equal(report.refundConfirmed,false);
  assert.equal(report.retryAuthorized,false);
});
