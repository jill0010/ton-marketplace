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

test("archival HTTP 542 falls back to read-only hash-indexed inspection", async () => {
  const expected = HISTORICAL_PAYMENT;
  let archivalAttempts = 0;
  let indexedCalls = 0;
  const report = await inspectHistoricalTestnetPayment(async (url, options) => {
    assert.equal(options.method, "GET");
    if (url.includes("/api/v2/getTransactions")) {
      archivalAttempts++;
      return {ok:false,status:542};
    }
    indexedCalls++;
    const parsed = new URL(url);
    assert.equal(parsed.pathname, "/api/v3/transactions");
    assert.equal(parsed.searchParams.get("hash"), expected.hash);
    return {ok:true,json:async()=>({transactions:[{
      hash: expected.hash,
      account: parsed.searchParams.get("account"),
      in_msg: {value:"210000000"},
      out_msgs: [],
      account_state_before:{balance:"1000000000"},
      account_state_after:{balance:"1200000000"},
      total_fees:"10000000",
      description:{aborted:true,compute_ph:{exit_code:212}},
    }]})};
  });
  assert.equal(archivalAttempts,3);
  assert.equal(indexedCalls,1);
  assert.equal(report.source,"TON Center v3 indexed");
  assert.equal(report.inboundMatches,true);
  assert.equal(report.balanceDeltaNano,"200000000");
  assert.equal(report.computeExitCode,212);
  assert.equal(report.refundConfirmed,false);
  assert.equal(report.retryAuthorized,false);
  assert.equal(report.archivalV2FailureStatus,542);
});
test("indexed lookup rejects mismatched Marketplace account", async () => {
  await assert.rejects(
    () => inspectHistoricalTestnetPayment(async (url) => url.includes("/api/v2/") ?
      {ok:false,status:542} : {ok:true,json:async()=>({transactions:[{
        hash:HISTORICAL_PAYMENT.hash,
        account:"0:"+"0".repeat(64),
        in_msg:{value:"210000000"},
      }]})}),
    /account does not match/,
  );
});

test("hash identity diagnosis finds sender transaction without claiming refund", async () => {
  const report = await inspectHistoricalTestnetPayment(async (url) => {
    if (url.includes("/api/v2/")) return {ok:false,status:542};
    const parsed = new URL(url);
    if (parsed.searchParams.has("account")) return {ok:true,json:async()=>({transactions:[]})};
    if (parsed.pathname === "/api/v3/transactions") return {ok:true,json:async()=>({transactions:[{
      account:"0:"+"1".repeat(64),hash:HISTORICAL_PAYMENT.hash,
    }]})};
    throw new Error("Unexpected endpoint");
  });
  assert.equal(report.state,"UNRESOLVED");
  assert.equal(report.reason,"HASH_NOT_FOUND_FOR_MARKETPLACE");
  assert.equal(report.hashIdentity.kind,"transaction");
  assert.equal(report.hashIdentity.accounts.length,1);
  assert.equal(report.refundConfirmed,false);
});
test("hash identity diagnosis also checks message hash when transaction hash is absent", async () => {
  const report = await inspectHistoricalTestnetPayment(async (url) => {
    if (url.includes("/api/v2/")) return {ok:false,status:542};
    const parsed = new URL(url);
    if (parsed.pathname === "/api/v3/transactionsByMessage") {
      assert.equal(parsed.searchParams.get("msg_hash"),HISTORICAL_PAYMENT.hash);
      return {ok:true,json:async()=>({transactions:[{account:"0:"+"2".repeat(64)}]})};
    }
    return {ok:true,json:async()=>({transactions:[]})};
  });
  assert.equal(report.hashIdentity.kind,"message");
  assert.equal(report.refundConfirmed,false);
});
