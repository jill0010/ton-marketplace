// Read-only follow-up audit for the rejected 0.21 TON payment.
// Lists subsequent Marketplace transactions without signing or transferring.
import { pathToFileURL } from "node:url";
import { HISTORICAL_PAYMENT } from "./inspect-historical-testnet-payment.mjs";
import { normalizeV3TestnetAddress } from "./verify-v3-testnet.mjs";
const RECEIVER_HASH = "e1b4a8f5e7c3f6078406b20c063c0878e25261866bf92d667cd8127bf58c6043";
const ACCOUNT = normalizeV3TestnetAddress(HISTORICAL_PAYMENT.marketplace);
function hex(value) {
  if (typeof value !== "string") return null;
  if (/^[a-f0-9]{64}$/i.test(value)) return value.toLowerCase();
  try { const b=Buffer.from(value,"base64");return b.length===32?b.toString("hex"):null; } catch {return null;}
}
export function analyzeFollowupTransactions(transactions) {
  if (!Array.isArray(transactions)) throw new TypeError("transactions must be array");
  const anchor=transactions.filter(t=>hex(t.hash)===RECEIVER_HASH && normalizeV3TestnetAddress(t.account)===ACCOUNT);
  if(anchor.length!==1) return {state:"UNRESOLVED",reason:"ANCHOR_TRANSACTION_MISSING_OR_DUPLICATE",refundConfirmed:false,retryAuthorized:false};
  const anchorLt=BigInt(anchor[0].lt);
  const later=transactions.filter(t=>t!==anchor[0] &&
    normalizeV3TestnetAddress(t.account)===ACCOUNT &&
    /^(0|[1-9][0-9]*)$/.test(String(t.lt??"")) && BigInt(t.lt)>anchorLt);
  const outbounds=later.flatMap(t=>(Array.isArray(t.out_msgs)?t.out_msgs:[]).map(m=>({
    transactionHash:hex(t.hash),transactionLt:String(t.lt),
    destination:m.destination??null,valueNano:String(m.value??""),messageHash:hex(m.hash),
  })));
  return {state:"UNRESOLVED",reason:"FOLLOWUP_OUTBOUND_CANDIDATES_REQUIRE_RECIPIENT_FINALITY",
    anchorHash:RECEIVER_HASH,anchorLt:String(anchorLt),
    laterTransactions:later.length,outboundMessages:outbounds,
    refundConfirmed:false,retryAuthorized:false,mainnetApproved:false};
}
export async function auditHistoricalFollowup(fetcher=fetch) {
  const url=new URL("https://testnet.toncenter.com/api/v3/transactions");
  url.searchParams.set("account",ACCOUNT);
  url.searchParams.set("limit","100");
  const response=await fetcher(url.toString(),{method:"GET",redirect:"error",
    headers:process.env.TONCENTER_API_KEY?{"X-API-Key":process.env.TONCENTER_API_KEY}:{}});
  if(!response.ok)throw new Error("Follow-up indexed RPC HTTP "+response.status);
  const body=await response.json();
  if(!Array.isArray(body.transactions))throw new Error("Invalid follow-up transaction response");
  return {network:"testnet",marketplace:ACCOUNT,readOnly:true,
    inspectedTransactions:body.transactions.length,historyComplete:false,
    ...analyzeFollowupTransactions(body.transactions)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{const report=await auditHistoricalFollowup();console.log(JSON.stringify(report,null,2));
    if(report.reason==="ANCHOR_TRANSACTION_MISSING_OR_DUPLICATE")process.exitCode=1;
  }catch(e){console.error("FOLLOWUP_AUDIT_FAILED:",e.message);process.exitCode=1;}
}
