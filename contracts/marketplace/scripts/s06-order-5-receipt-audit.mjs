// S06 Order #5 independent TESTNET receipt audit. Strictly read-only; no keys or broadcasts.
const API = "https://testnet.toncenter.com/api/v2";
import { Address } from "@ton/core";
const marketplace = Address.parse("kQB9Q03obJYKG84bfXFrpL6OtUcX41z54A3m4LFGf_0a14D_");
const seller = Address.parse("0QASRB4XGtN81Pwaef6fWnSJyRwwJEvbbPn-ksz0KQI-bFa0");
const order = 5n;
const expected = {seller:9700000n, platform:300000n};
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const norm = v=>{try{return Address.parse(v).toRawString().toLowerCase()}catch{return null}};
const msgs = v=>Array.isArray(v)?v:Object.values(v??{});
async function rpc(method, params={}){
  const url=new URL(API+"/"+method);
  for(const [k,v] of Object.entries(params))url.searchParams.set(k,String(v));
  for(let n=0;n<6;n++){
    let res;
    try { res=await fetch(url,{headers:process.env.TONCENTER_TESTNET_API_KEY?{"X-API-Key":process.env.TONCENTER_TESTNET_API_KEY}:{},redirect:"error"}); } catch(e) { if(n===5)throw Error(method+" network failure: "+e.message); await sleep(Math.min(1500*2**n,16000)); continue; }
    if(res.ok){const body=await res.json();if(body.ok!==true)throw Error(method+" RPC not ok");return body.result;}
    if(![429,500,502,503,504,542].includes(res.status)||n===5)throw Error(method+" HTTP "+res.status+" for address "+params.address+" limit "+params.limit);
    await sleep(Math.min(1500*2**n,16000));
  }
}
async function history(address){
  let lastError;
  for(const limit of [20,10,5]){
    try {return await rpc("getTransactions",{address:address.toRawString(),limit});}
    catch(e){lastError=e; console.error("S06_RPC_READ_ONLY_BACKOFF: "+e.message);}
  }
  throw lastError;
}
function fields(msg){
  const b=msg?.msg_data?.body??msg?.message_content?.body;
  if(typeof b!=="string")return null;
  try{
    const {Cell}=core;
    const cells=Cell.fromBoc(Buffer.from(b,"base64"));
    if(cells.length!==1)return null;
    const slice=cells[0].beginParse();
    if(slice.remainingBits<96)return null;
    return {opcode:slice.loadUint(32),order:slice.loadUintBig(64)};
  }catch{return null}
}
let core;
async function main(){
  core=await import("@ton/core");
  const txs=[];
  let cursor=null;
  for(let page=0;page<12;page++){
    const params={address:marketplace.toRawString(),limit:20};
    if(cursor){params.lt=cursor.lt;params.hash=cursor.hash;}
    const batch=await rpc("getTransactions",params);
    if(!Array.isArray(batch)||!batch.length)break;
    const seen=new Set(txs.map(t=>t.transaction_id?.hash));
    txs.push(...batch.filter(t=>!seen.has(t.transaction_id?.hash)));
    const tail=batch.at(-1)?.transaction_id;
    if(!tail?.lt||!tail?.hash||batch.length<20)break;
    if(cursor?.lt===tail.lt&&cursor?.hash===tail.hash)break;
    cursor={lt:tail.lt,hash:tail.hash};
  }
  const sellerCandidates=[], platformCandidates=[];
  let bodyMatches=0, sellerValueMatches=0, platformValueMatches=0;
  for(const tx of txs){
    for(const m of msgs(tx.out_msgs)){
      const d=norm(m.destination??m.dest), v=BigInt(m.value??-1), parsed=fields(m);
      if(parsed?.order===order)bodyMatches++;
      if(d===seller.toRawString().toLowerCase() && v===expected.seller){
        sellerValueMatches++;
        if(parsed?.order===order)sellerCandidates.push({tx,msg:m});
      }
      if(d && d!==seller.toRawString().toLowerCase() && v===expected.platform){
        platformValueMatches++;
        if(parsed?.order===order)platformCandidates.push({tx,msg:m});
      }
    }
  }
  console.log("S06_MARKETPLACE_HISTORY_SCANNED: "+txs.length);
  console.log("S06_ORDER_BODY_MATCH_COUNT: "+bodyMatches);
  console.log("S06_SELLER_AMOUNT_DEST_MATCH_COUNT: "+sellerValueMatches);
  console.log("S06_PLATFORM_AMOUNT_MATCH_COUNT: "+platformValueMatches);
  console.log("S06_SELLER_ORDER_MATCH_COUNT: "+sellerCandidates.length);
  console.log("S06_PLATFORM_ORDER_MATCH_COUNT: "+platformCandidates.length);
  if(sellerCandidates.length!==1 || platformCandidates.length!==1)throw Error("Order 5 payout messages not uniquely identified; seller="+sellerCandidates.length+" platform="+platformCandidates.length);
  const found={seller:sellerCandidates[0].msg,platform:platformCandidates[0].msg,tx:sellerCandidates[0].tx};
  const platformAddress=Address.parse(found.platform.destination??found.platform.dest);
  if(platformAddress.equals(marketplace)||platformAddress.equals(seller))throw Error("Invalid platform beneficiary");
  async function receipt(out,recipient,kind,amount){
    const recipientTxs=[];
    let cursor=null;
    for(let page=0;page<12;page++){
      const params={address:recipient.toRawString(),limit:20};
      if(cursor){params.lt=cursor.lt;params.hash=cursor.hash;}
      const batch=await rpc("getTransactions",params);
      if(!Array.isArray(batch)||!batch.length)break;
      const seen=new Set(recipientTxs.map(t=>t.transaction_id?.hash));
      recipientTxs.push(...batch.filter(t=>!seen.has(t.transaction_id?.hash)));
      const tail=batch.at(-1)?.transaction_id;
      if(!tail?.lt||!tail?.hash||batch.length<20)break;
      if(cursor?.lt===tail.lt&&cursor?.hash===tail.hash)break;
      cursor={lt:tail.lt,hash:tail.hash};
    }
    const matches=recipientTxs.filter(t=>{
      const incoming=t.in_msg;
      return norm(incoming?.source??incoming?.src)===marketplace.toRawString().toLowerCase()
        &&BigInt(incoming?.value??-1)===amount
        &&incoming?.hash===out.hash
        &&fields(incoming)?.order===order
        &&fields(incoming)?.opcode===fields(out)?.opcode;
    });
    if(matches.length!==1)throw Error(kind+" receipt missing or ambiguous: "+matches.length);
    const tx=matches[0];
    if(tx.in_msg?.bounced===true||tx.description?.aborted===true||tx.compute_phase?.exit_code!==undefined&&tx.compute_phase.exit_code!==0)
      throw Error(kind+" recipient transaction aborted/bounced");
    console.log("S06_"+kind+"_RECEIPT_VERIFIED: true");
    console.log("S06_"+kind+"_ADDRESS: "+recipient.toString());
    console.log("S06_"+kind+"_AMOUNT_NANOTON: "+amount);
    console.log("S06_"+kind+"_INBOUND_TX_HASH: "+tx.transaction_id?.hash);
  }
  await receipt(found.seller,seller,"SELLER",expected.seller);
  await receipt(found.platform,platformAddress,"PLATFORM",expected.platform);
  console.log("S06_ORDER_ID: 5");
  console.log("S06_SELLER_PAYOUT_TX_HASH: "+sellerCandidates[0].tx.transaction_id?.hash);
  console.log("S06_PLATFORM_PAYOUT_TX_HASH: "+platformCandidates[0].tx.transaction_id?.hash);
  console.log("S06_RESERVE_INPUT_NANOTON: 200000000");
  console.log("S06_RESERVE_CLASSIFICATION: MarketplaceV2 execution reserve, not V3 Reserve Vault deposit");
  console.log("S06_RESERVE_REFUND_NOT_PROVEN: true");
  console.log("S06_RESERVE_UNSPENT_BALANCE_NOT_ATTRIBUTABLE_WITHOUT_FULL_TRACE: true");
  console.log("S06_READ_ONLY_NO_BROADCAST: true");
}
main().catch(e=>{console.error("S06_RECEIPT_AUDIT_BLOCKED: "+e.message);process.exitCode=1});
