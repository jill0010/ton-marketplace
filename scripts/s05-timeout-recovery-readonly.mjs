// Read-only forensic check for S05 run 43728417510. No wallet secrets, signing, or broadcast.
import {Address,Cell,loadTransaction} from "@ton/core";
const A={deployer:"0QDQEewIr69mGcq6uDIlAtibxW37gm7rJfKWru7o4_hSPbzu",seller:"0QASRB4XGtN81Pwaef6fWnSJyRwwJEvbbPn-ksz0KQI-bFa0",escrow:"kQAp5SqhqBj1LK3q9mHpBDsVzUnMyWBiH-nvtTB7q0vdP0mG",marketplace:"kQB9Q03obJYKG84bfXFrpL6OtUcX41z54A3m4LFGf_0a14D_",item:"EQAk73VdUMdm_H9RYLNVfjHaEAfDC-fVm2s4bc_X669XZOin"};
const headers=process.env.TONCENTER_API_KEY?{"X-API-Key":process.env.TONCENTER_API_KEY}:{};
async function rpc(method,params){const u=new URL("https://testnet.toncenter.com/api/v2/"+method);for(const [k,v] of Object.entries(params))u.searchParams.set(k,String(v));for(let n=1;n<=5;n++){try{const r=await fetch(u,{headers,signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error("HTTP "+r.status);const j=await r.json();if(!j.ok)throw Error(JSON.stringify(j));return j.result}catch(e){if(n===5||!/429|500|502|503|504|542|timeout|fetch failed/i.test(String(e)))throw e;await new Promise(resolve=>setTimeout(resolve,n*1600))}}}
async function getter(address,method,stack=[]){const r=await fetch("https://testnet.toncenter.com/api/v2/runGetMethod",{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({address,method,stack}),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error(method+" HTTP "+r.status);const j=await r.json();if(!j.ok||j.result?.exit_code!==0)throw Error(method+" "+JSON.stringify(j));return j.result.stack}
function transactionExecution(tx){
 const result={aborted:null,computeExit:null,actionResult:null,executionVerified:false};
 try {
  const boc=tx.data??tx.raw_data??tx.boc;
  if(!boc) return {...result,verificationError:"transaction BOC unavailable"};
  const parsed=loadTransaction(Cell.fromBase64(boc).beginParse());
  const d=parsed.description;
  if(d.type!=="generic") return {...result,verificationError:"non-generic transaction"};
  return {aborted:d.aborted,computeExit:d.computePhase.type==="vm"?d.computePhase.exitCode:null,actionResult:d.actionPhase?.resultCode??null,executionVerified:true};
 }catch(e){return {...result,verificationError:String(e)}}
}
const strict=process.env.S05_RESUME_PREFLIGHT==="true";
const observed={};
const start=Date.parse("2026-11-15T15:09:00Z")/1000;
const end=Date.parse("2026-11-15T15:14:00Z")/1000;
for(const [role,address] of Object.entries(A)){
 const state=await rpc("getAddressInformation",{address});
 console.log("S05_ACCOUNT",role,JSON.stringify({state:state.state,balance:state.balance,lastTransaction:state.last_transaction_id}));
 let cursor,matched=0,matchedTransactions=[];
 for(let page=0;page<12;page++){
  const params={address,limit:10};if(cursor){params.lt=cursor.lt;params.hash=cursor.hash}
  let batch;try{batch=await rpc("getTransactions",params)}catch(e){console.log("S05_TRANSACTION_HISTORY_UNAVAILABLE",role,String(e));break;}
  for(const tx of batch){if(tx.utime<start||tx.utime>end)continue;matched++;matchedTransactions.push(tx);console.log("S05_TX",role,JSON.stringify({time:new Date(tx.utime*1000).toISOString(),hash:tx.transaction_id?.hash,in:{source:tx.in_msg?.source,value:tx.in_msg?.value},out:(tx.out_msgs??[]).map(m=>({destination:m.destination,value:m.value})),...transactionExecution(tx)}))}
  if(batch.length<10||batch.some(t=>t.utime<start))break;
  cursor=batch.at(-1)?.transaction_id;if(!cursor?.lt||!cursor?.hash)break;
 }
 observed[role]={matched,matchedTransactions,lastTransaction:state.last_transaction_id};
 console.log("S05_MATCHING_TX_COUNT",role,matched);
}
const s=await getter(A.item,"get_nft_data");const owner=Cell.fromBase64(s[3][1].bytes).beginParse().loadAddress();console.log("S05_CURRENT_NFT_OWNER",owner?.toString());console.log("S05_OWNER_IS_SELLER",owner?.equals(Address.parse(A.seller)));console.log("S05_OWNER_IS_ESCROW",owner?.equals(Address.parse(A.escrow)));
for(const [role,method] of [["marketplace","nextProductIdV2"],["marketplace","nextQueryIdV2"]]){try{console.log("S05_GETTER",method,JSON.stringify(await getter(A[role],method)))}catch(e){console.log("S05_GETTER_ERROR",method,String(e))}}
if(strict){
 const escrowTx=observed.escrow.matchedTransactions;
 const deployerTx=observed.deployer.matchedTransactions;
 if(escrowTx.length!==1||deployerTx.length!==1||observed.seller.matched!==0||observed.marketplace.matched!==0||observed.item.matched!==0)throw Error("S05_RESUME_BLOCKED: transaction history differs from verified checkpoint");
 if(observed.escrow.lastTransaction?.hash!=="cSjZTMCfFwXIQkV+eDLvyYKzi4s9vJGhL+QKS4tgyRc="||observed.deployer.lastTransaction?.hash!=="DaQqMGWIHKW/zJNjkDyX/0xOQTdR39KbzJXJaM4WfG8=")throw Error("S05_RESUME_BLOCKED: newer deployer or Escrow transaction detected");
 const e=transactionExecution(escrowTx[0]);
 if(!e.executionVerified||e.aborted!==false||e.computeExit!==0||e.actionResult!==0)throw Error("S05_RESUME_BLOCKED: escrow checkpoint execution not successful");
 if(!Address.parse(escrowTx[0].in_msg?.source).equals(Address.parse(A.deployer))||escrowTx[0].in_msg?.value!=="50000000")throw Error("S05_RESUME_BLOCKED: escrow checkpoint sender/value mismatch");
 if(!owner?.equals(Address.parse(A.seller)))throw Error("S05_RESUME_BLOCKED: NFT owner changed");
 console.log("S05_RESUME_PREFLIGHT_PASSED: true");
}
console.log("S05_READ_ONLY_NO_BROADCAST: true");
