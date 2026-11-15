// S05: inspect testnet transactions; read-only, no signer or mnemonic.
import { Address } from "@ton/core";
const deployer="0QDQEewIr69mGcq6uDIlAtibxW37gm7rJfKWru7o4_hSPbzu";
const nft="kQCq13VYJqQ0Oov-a2-MKE57MWIuEtiQaoF_lYNCAEnAofhm";
const seller="0QASRB4XGtN81Pwaef6fWnSJyRwwJEvbbPn-ksz0KQI-bFa0";
const base="https://testnet.toncenter.com/api/v2/";
if(!process.env.TONCENTER_API_KEY)throw Error("Missing testnet API key");
async function rpc(method,params){
 const u=new URL(base+method);for(const [k,v] of Object.entries(params))u.searchParams.set(k,String(v));
 for(let i=0;i<4;i++){
  const r=await fetch(u,{headers:{"X-API-Key":process.env.TONCENTER_API_KEY},signal:AbortSignal.timeout(20000)});
  if([429,500,502,503,504,520,522,524,542].includes(r.status)&&i<3){console.log("S05_RPC_RETRY:",method,r.status,"attempt",i+1);await new Promise(x=>setTimeout(x,1500*(i+1)));continue;}
  if(!r.ok)throw Error(method+" HTTP "+r.status);
  const j=await r.json();if(!j.ok)throw Error(method+": "+JSON.stringify(j.description));
  return j.result;
 }throw Error("RPC retries exhausted");
}
const canonical=a=>{const value=(a&&typeof a==="object")?a.address:a;try{return Address.parse(String(value)).toRawString()}catch{return String(value??"")}};
const item=canonical(nft);
const fmt=m=>({source:m?.source??null,destination:m?.destination??null,value:m?.value??null,op:m?.message?.slice(0,70)??null});
async function tonapiTransactions(address,limit){
 const url=`https://testnet.tonapi.io/v2/blockchain/accounts/${encodeURIComponent(address)}/transactions?limit=${limit}`;
 for(let i=0;i<4;i++){
  const r=await fetch(url,{signal:AbortSignal.timeout(20000)});
  if([429,500,502,503,504,542].includes(r.status)&&i<3){await new Promise(x=>setTimeout(x,1500*(i+1)));continue;}
  if(!r.ok)throw Error("TonAPI HTTP "+r.status);
  const j=await r.json();return (j.transactions??[]).map(t=>({...t,utime:t.utime??t.now,transaction_id:t.transaction_id??{lt:t.lt,hash:t.hash},out_msgs:t.out_msgs??t.out_msgs}));
 }throw Error("TonAPI history retry exhausted");
}
async function transactions(address,limit){
 try{return await rpc("getTransactions",{address,limit,archival:false});}
 catch(e){
  console.log("S05_NON_ARCHIVAL_RPC_FAILED:",String(e));
  try{return await rpc("getTransactions",{address,limit:Math.min(20,limit),archival:true});}
  catch(archivalError){console.log("S05_ARCHIVAL_RPC_FAILED:",String(archivalError));console.log("S05_FALLBACK_PROVIDER: TonAPI testnet");return await tonapiTransactions(address,limit);}
 }
}
const txs=await transactions(deployer,30);
const itemTxs=await transactions(nft,20);
const start=Date.parse("2026-11-15T11:53:00Z")/1000,end=Date.parse("2026-11-15T12:02:00Z")/1000;
const within=t=>Number(t.utime)>=start&&Number(t.utime)<=end;
const candidate=txs.filter(t=>within(t)||t.out_msgs?.some(m=>canonical(m.destination)===item));
console.log("S05_DEPLOYER_RECENT_TX_COUNT:",txs.length);
console.log("S05_NFT_RECENT_TX_COUNT:",itemTxs.length);
console.log("S05_DEPLOYER_WINDOW_TX_COUNT:",txs.filter(within).length);
for(const t of candidate.slice(0,20)){
 console.log("S05_DEPLOYER_TX:",JSON.stringify({time:new Date(Number(t.utime)*1000).toISOString(),lt:t.transaction_id?.lt,hash:t.transaction_id?.hash,fee:t.fee,description:t.description?.compute_ph?.exit_code,action:t.description?.action?.result_code,outputs:(t.out_msgs??[]).map(fmt)}));
}
for(const t of itemTxs.filter(within).slice(0,20)){
 console.log("S05_NFT_TX:",JSON.stringify({time:new Date(Number(t.utime)*1000).toISOString(),lt:t.transaction_id?.lt,hash:t.transaction_id?.hash,incoming:fmt(t.in_msg),aborted:t.description?.aborted??t.compute_phase?.skipped,compute_exit:t.description?.compute_ph?.exit_code??t.compute_phase?.exit_code,action_exit:t.description?.action?.result_code??t.action_phase?.result_code,compute_phase:t.compute_phase,action_phase:t.action_phase,bounce_phase:t.bounce_phase,in_msg_bounced:t.in_msg?.bounced,in_msg_op:t.in_msg?.op_code,in_msg_body:t.in_msg?.decoded_body?.op??null,source_raw:canonical(t.in_msg?.source),expected_owner_raw:canonical(deployer),source_is_owner:canonical(t.in_msg?.source)===canonical(deployer),recipient_is_nft:canonical(t.in_msg?.destination)===canonical(nft),in_msg_body_base64:t.in_msg?.raw_body??null,in_msg_decoded:t.in_msg?.decoded_body??null,outputs:(t.out_msgs??[]).map(fmt)}));
}
// Current owner already independently verified by the dedicated S05 identity workflow.
// Do not use a GET query for TonCenter runGetMethod (the endpoint returns HTTP 404).
console.log("S05_SELLER_EXPECTED:",seller);
console.log("S05_DIAGNOSTIC_READ_ONLY: true");
