import test from "node:test";
import assert from "node:assert/strict";
import {analyzeFollowupTransactions,auditHistoricalFollowup} from "./audit-historical-payment-followup.mjs";
const account="0:c2e6a047aef7306896a6c04cd94dbb88e188ca5f77c47a040757621782ef45ae";
const anchor={account,hash:"e1b4a8f5e7c3f6078406b20c063c0878e25261866bf92d667cd8127bf58c6043",lt:"100",out_msgs:[]};
test("later outbound messages remain unconfirmed refunds",()=>{
 const result=analyzeFollowupTransactions([anchor,{account,hash:"a".repeat(64),lt:"101",out_msgs:[{destination:"0:"+"1".repeat(64),value:"209000000",hash:"b".repeat(64)}]}]);
 assert.equal(result.laterTransactions,1);
 assert.equal(result.outboundMessages[0].valueNano,"209000000");
 assert.equal(result.refundConfirmed,false);
 assert.equal(result.retryAuthorized,false);
});
test("missing anchor never declares historical funds settled",()=>{
 const result=analyzeFollowupTransactions([]);
 assert.equal(result.state,"UNRESOLVED");
 assert.equal(result.refundConfirmed,false);
});
test("follow-up lookup only performs read-only testnet GET",async()=>{
 const result=await auditHistoricalFollowup(async(url,options)=>{
   const u=new URL(url);
   assert.equal(u.hostname,"testnet.toncenter.com");
   assert.equal(u.pathname,"/api/v3/transactions");
   assert.equal(options.method,"GET");
   return {ok:true,json:async()=>({transactions:[anchor]})};
 });
 assert.equal(result.readOnly,true);
 assert.equal(result.historyComplete,false);
 assert.equal(result.refundConfirmed,false);
});
