// S05: inspect testnet transactions; read-only, no signer or mnemonic.
import { Address, Cell } from "@ton/core";
const deployer="0QDQEewIr69mGcq6uDIlAtibxW37gm7rJfKWru7o4_hSPbzu";
const nft="kQCq13VYJqQ0Oov-a2-MKE57MWIuEtiQaoF_lYNCAEnAofhm";
const seller="0QASRB4XGtN81Pwaef6fWnSJyRwwJEvbbPn-ksz0KQI-bFa0";
const base="https://testnet.toncenter.com/api/v2/";
if(!process.env.TONCENTER_API_KEY)throw Error("Missing testnet API key");
async function rpc(method,params){
 const u=new URL(base+method);for(const [k,v] of Object.entries(params))u.searchParams.set(k,String(v));
 for(let i=0;i<4;i++){
  const r=await fetch(u,{headers:{"X-API-Key":process.env.TONCENTER_API_KEY},signal:AbortSignal.timeout(20000)});
  if([429,500,502,503,504].includes(r.status)&&i<3){await new Promise(x=>setTimeout(x,1200*(i+1)));continue;}
  if(!r.ok)throw Error(method+" HTTP "+r.status);
  const j=await r.json();if(!j.ok)throw Error(method+": "+JSON.stringify(j.description));
  return j.result;
 }throw Error("RPC retries exhausted");
}
const canonical=a=>{try{return Address.parse(a).toRawString()}catch{return String(a??"")}};
const wallet=canonical(deployer),item=canonical(nft);
const fmt=m=>({source:m?.source??null,destination:m?.destination??null,value:m?.value??null,op:m?.message?.slice(0,70)??null});
const txs=await rpc("getTransactions",{address:deployer,limit:50,archival:true});
const itemTxs=await rpc("getTransactions",{address:nft,limit:30,archival:true});
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
 console.log("S05_NFT_TX:",JSON.stringify({time:new Date(Number(t.utime)*1000).toISOString(),lt:t.transaction_id?.lt,hash:t.transaction_id?.hash,incoming:fmt(t.in_msg),aborted:t.description?.aborted,compute_exit:t.description?.compute_ph?.exit_code,action_exit:t.description?.action?.result_code,outputs:(t.out_msgs??[]).map(fmt)}));
}
const getter=await rpc("runGetMethod",{address:nft,method:"get_nft_data",stack:"[]"});
console.log("S05_GETTER_EXIT:",getter.exit_code);
console.log("S05_GETTER_OWNER_STACK:",JSON.stringify(getter.stack?.[3]??null));
console.log("S05_SELLER_EXPECTED:",seller);
console.log("S05_DIAGNOSTIC_READ_ONLY: true");
