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
  const txs=await history(marketplace);
  const candidates=[];
  for(const tx of txs){
    const outputs=msgs(tx.out_msgs).filter(m=>fields(m)?.order===order);
    const a=outputs.filter(m=>norm(m.destination??m.dest)===seller.toRawString().toLowerCase()&&BigInt(m.value??-1)===expected.seller);
    const b=outputs.filter(m=>norm(m.destination??m.dest)!==seller.toRawString().toLowerCase()&&BigInt(m.value??-1)===expected.platform);
    for(const x of a)for(const y of b)if(fields(x).opcode!==fields(y).opcode)candidates.push({tx,seller:x,platform:y});
  }
  if(candidates.length!==1)throw Error("Expected one exact Order #5 seller/platform payout pair; found "+candidates.length);
  const found=candidates[0];
  const platformAddress=Address.parse(found.platform.destination??found.platform.dest);
  if(platformAddress.equals(marketplace)||platformAddress.equals(seller))throw Error("Invalid platform beneficiary");
  async function receipt(out,recipient,kind,amount){
    const history=await history(recipient);
    const matches=history.filter(t=>{
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
  console.log("S06_MARKETPLACE_PAYOUT_TX_HASH: "+found.tx.transaction_id?.hash);
  console.log("S06_RESERVE_INPUT_NANOTON: 200000000");
  console.log("S06_RESERVE_CLASSIFICATION: MarketplaceV2 execution reserve, not V3 Reserve Vault deposit");
  console.log("S06_RESERVE_REFUND_NOT_PROVEN: true");
  console.log("S06_RESERVE_UNSPENT_BALANCE_NOT_ATTRIBUTABLE_WITHOUT_FULL_TRACE: true");
  console.log("S06_READ_ONLY_NO_BROADCAST: true");
}
main().catch(e=>{console.error("S06_RECEIPT_AUDIT_BLOCKED: "+e.message);process.exitCode=1});
