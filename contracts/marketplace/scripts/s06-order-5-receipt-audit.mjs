// S06 Order #5 independent TESTNET receipt audit. Strictly read-only; no keys or broadcasts.
const API = "https://testnet.toncenter.com/api/v2";
import { Address } from "@ton/core";
const marketplace = Address.parse("kQB9Q03obJYKG84bfXFrpL6OtUcX41z54A3m4LFGf_0a14D_");
const seller = Address.parse("0:d011ec08afaf6619cabab8322502d89bc56dfb826eeb25f296aeeee8e3f8523d");
const treasury = Address.parse("0QASRB4XGtN81Pwaef6fWnSJyRwwJEvbbPn-ksz0KQI-bFa0");
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
// TonAPI testnet is an independent read-only source when Toncenter history fails.
// Normalize both APIs into the same transaction/message shape before strict matching.
const TONAPI="https://testnet.tonapi.io/v2";
function hashHex(value){
  if(!value)return null;
  if(/^[a-f0-9]{64}$/i.test(value))return value.toLowerCase();
  try{return Buffer.from(value.replace(/-/g,"+").replace(/_/g,"/"),"base64").toString("hex")}catch{return null}
}
function normalizeTonapiMessage(m){
  if(!m)return null;
  return {source:m.source?.address??m.source??null,destination:m.destination?.address??m.destination??null,
    value:String(m.value??0),hash:hashHex(m.hash),
    msg_data:{body:m.raw_body??m.message_content?.body??null},bounced:m.bounced??false};
}
async function tonapiHistory(address){
  const all=[];let before=null;
  for(let page=0;page<8;page++){
    const url=new URL(TONAPI+"/blockchain/accounts/"+encodeURIComponent(address.toRawString())+"/transactions");
    url.searchParams.set("limit","100");
    if(before!==null)url.searchParams.set("before_lt",String(before));
    let response;
    for(let attempt=0;attempt<3;attempt++){
      response=await fetch(url,{redirect:"error"});
      if(response.ok)break;
      if(![429,500,502,503,504].includes(response.status)||attempt===2)throw Error("TonAPI testnet history HTTP "+response.status);
      await sleep(1000*(attempt+1));
    }
    const json=await response.json(),batch=json.transactions;
    if(!Array.isArray(batch))throw Error("TonAPI testnet history response invalid");
    for(const t of batch)all.push({transaction_id:{hash:hashHex(t.hash),lt:String(t.lt)},
      in_msg:normalizeTonapiMessage(t.in_msg),
      out_msgs:(t.out_msgs??[]).map(normalizeTonapiMessage),
      description:t.description,
      compute_phase:t.compute_phase});
    if(batch.length<100)break;
    const last=batch.at(-1)?.lt;
    if(!last||String(last)===String(before))break;
    before=last;
  }
  console.log("S06_HISTORY_PROVIDER: TonAPI testnet");
  return all;
}
async function scanHistory(address){
  try{
    // First try a bounded Toncenter request. Never paginate into persistent HTTP 500.
    const batch=await rpc("getTransactions",{address:address.toRawString(),limit:20});
    if(!Array.isArray(batch))throw Error("Toncenter history invalid");
    // Prefer independent provider for full history, falling back to the available first page.
    try{return await tonapiHistory(address)}catch(e){
      console.error("S06_TONAPI_FALLBACK_WARNING: "+e.message);
      console.log("S06_HISTORY_PROVIDER: Toncenter limited first page");
      return batch;
    }
  }catch(e){
    console.error("S06_TONCENTER_HISTORY_UNAVAILABLE: "+e.message);
    return await tonapiHistory(address);
  }
}
function fields(msg){
  const b=msg?.msg_data?.body??msg?.message_content?.body;
  if(typeof b!=="string")return null;
  try{
    const {Cell}=core;
    const binary=/^[0-9a-f]+$/i.test(b)&&b.length%2===0?Buffer.from(b,"hex"):Buffer.from(b,"base64");
    const cells=Cell.fromBoc(binary);
    if(cells.length!==1)return null;
    const slice=cells[0].beginParse();
    if(slice.remainingBits<96)return null;
    return {opcode:slice.loadUint(32),order:slice.loadUintBig(64)};
  }catch{return null}
}
let core;
async function main(){
  core=await import("@ton/core");
  const txs=await scanHistory(marketplace,30);
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
      if(d===treasury.toRawString().toLowerCase() && v===expected.platform){
        platformValueMatches++;
        if(parsed?.order===order)platformCandidates.push({tx,msg:m});
      }
    }
  }
  console.log("S06_MARKETPLACE_HISTORY_SCANNED: "+txs.length);
  console.log("S06_ORDER_BODY_MATCH_COUNT: "+bodyMatches);
  for(const tx of txs){
    for(const m of msgs(tx.out_msgs)){
      const d=norm(m.destination??m.dest),v=BigInt(m.value??-1);
      if(d===seller.toRawString().toLowerCase()||v===expected.platform||v===expected.seller){
        const body=m.msg_data?.body??m.message_content?.body;
        const decoded=fields(m);
        console.log("S06_PAYOUT_DIAGNOSTIC: "+JSON.stringify({tx:tx.transaction_id?.hash,destination:d,value:String(v),bodyType:typeof body,bodyLength:typeof body==="string"?body.length:0,opcode:decoded?.opcode??null,decodedOrder:decoded?.order?.toString()??null,messageHash:hashHex(m.hash)}));
      }
    }
  }
  console.log("S06_SELLER_AMOUNT_DEST_MATCH_COUNT: "+sellerValueMatches);
  console.log("S06_PLATFORM_AMOUNT_MATCH_COUNT: "+platformValueMatches);
  console.log("S06_SELLER_ORDER_MATCH_COUNT: "+sellerCandidates.length);
  console.log("S06_PLATFORM_ORDER_MATCH_COUNT: "+platformCandidates.length);
  if(sellerCandidates.length!==1 || platformCandidates.length!==1)throw Error("Order 5 payout messages not uniquely identified; seller="+sellerCandidates.length+" platform="+platformCandidates.length);
  if(sellerCandidates[0].tx.transaction_id?.hash!==platformCandidates[0].tx.transaction_id?.hash)throw Error("Payout messages did not originate in same settlement transaction");
  const found={seller:sellerCandidates[0].msg,platform:platformCandidates[0].msg,tx:sellerCandidates[0].tx};
  const platformAddress=Address.parse(found.platform.destination??found.platform.dest);
  if(!platformAddress.equals(treasury)||platformAddress.equals(marketplace)||platformAddress.equals(seller))throw Error("Invalid platform beneficiary");
  async function receipt(out,recipient,kind,amount){
    const recipientTxs=await scanHistory(recipient,30);
    const matches=recipientTxs.filter(t=>{
      const incoming=t.in_msg;
      return norm(incoming?.source??incoming?.src)===marketplace.toRawString().toLowerCase()
        &&BigInt(incoming?.value??-1)===amount
        &&hashHex(incoming?.hash)===hashHex(out.hash)
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
