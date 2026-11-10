// S04-P001: final settlement attestation, once, Testnet only.
// Independent read-only transaction verification precedes the 3/3 signature.
// NO reserve funding, recipient enablement or refund retry in this script.
import { sign } from "node:crypto";
import { Address, Cell, beginCell, Dictionary, toNano } from "@ton/core";
import { mnemonicToPrivateKey } from "@ton/crypto";
import { TonClient, WalletContractV5R1, internal } from "@ton/ton";
import { deriveV3ValidatorKey } from "./derive-v3-validator-keys.mjs";

const API="https://testnet.toncenter.com/api/v2";
const ORDER=666969981n, PRINCIPAL=200000000n;
const OWNER=Address.parse("0QDQEewIr69mGcq6uDIlAtibxW37gm7rJfKWru7o4_hSPbzu");
const VAULT=Address.parse("kQB9H6xuScwj6Jn5jI_iSA8Zr5y-8gvweh6nQTTNvODz8f4u");
const RECIPIENT=Address.parse("kQDCFOYiVkLV4H-UqNxPO2XEnm5lJpEEnYnU7fjH1iXqKXvy");
const VERIFIER=Address.parse("kQB_3iLBqs2iW0qC2QbPeOisGfxPf46yGLZUOw3GgGxXZYO4");
const needed=(key)=>{const s=process.env[key]?.trim();if(!s)throw Error("Missing "+key);return s;};
const delay=(n)=>new Promise(resolve=>setTimeout(resolve,n));
const normalize=(s)=>{try{return Address.parse(s).toRawString().toLowerCase();}catch{return null;}};
const rawHash=(value)=>{const s=String(value??"");const bytes=/^[a-f0-9]{64}$/i.test(s)?Buffer.from(s,"hex"):/^[A-Za-z0-9+/]{43}=$/.test(s)?Buffer.from(s,"base64"):null;if(!bytes||bytes.length!==32)throw Error("invalid hash");return BigInt("0x"+bytes.toString("hex"));};
const messages=(list)=>Array.isArray(list)?list:Object.values(list??{});
const bodyOf=(msg)=>{const s=msg?.msg_data?.body??msg?.message_content?.body;if(typeof s!=="string")return null;try{const cells=Cell.fromBoc(Buffer.from(s,"base64"));return cells.length===1?cells[0]:null;}catch{return null;}};
function refundFields(body){
  if(!body)return null;
  try{
    const s=body.beginParse();
    if(s.remainingBits<224||s.loadUint(32)!==0x72730506)return null;
    return {order:s.loadUintBig(64),operation:s.loadUintBig(64),query:s.loadUintBig(64),amount:s.loadCoins()};
  }catch{return null;}
}
async function rpc(method,params={}){
  const url=new URL(API+"/"+method);for(const [k,v] of Object.entries(params))url.searchParams.set(k,String(v));
  for(let i=0;i<6;i++){
    const response=await fetch(url,{headers:process.env.TONCENTER_TESTNET_API_KEY?{"X-API-Key":process.env.TONCENTER_TESTNET_API_KEY}:{},redirect:"error"});
    if(response.ok){const data=await response.json();if(data.ok!==true)throw Error(method+" ok=false");return data.result;}
    if(![429,500,502,503,504,542].includes(response.status)||i===5)throw Error(method+" HTTP "+response.status);
    await delay(Math.min(1500*2**i,16000));
  }
}
async function getter(fn,label){for(let i=0;i<7;i++){try{return await fn();}catch(e){const status=e?.response?.status??e?.status??(String(e.message).includes("429")?429:undefined);if(![429,500,502,503,504,542].includes(status)||i===6)throw Error(label+": "+e.message);await delay(Math.min(1600*2**i,20000));}}}
async function main(){
  if(process.env.GITHUB_REF!=="refs/heads/feature/reserve-refund-v3-audit"||needed("S04_P001_FINAL_ATTEST_APPROVED")!=="true")throw Error("Testnet final-attestation gate not approved");
  const client=new TonClient({endpoint:API+"/jsonRPC",...(process.env.TONCENTER_TESTNET_API_KEY?{apiKey:process.env.TONCENTER_TESTNET_API_KEY}:{})});
  // Read only: compare actual second dispatch and successful synthetic recipient credit.
  const vaultTx=await rpc("getTransactions",{address:VAULT.toRawString(),limit:100});
  const recipientTx=await rpc("getTransactions",{address:RECIPIENT.toRawString(),limit:100});
  const dispatches=[];
  for(const tx of vaultTx)for(const m of messages(tx.out_msgs)){
    if(normalize(m.destination??m.dest)!==normalize(RECIPIENT.toRawString()))continue;
    const body=bodyOf(m),fields=refundFields(body);
    if(fields?.order===ORDER&&fields.amount===PRINCIPAL)
      dispatches.push({tx,message:m,body,fields});
  }
  if(dispatches.length!==2)throw Error("expected exactly two historical refund dispatches");
  const dispatch=dispatches.find(x=>x.fields.operation===2n&&x.fields.query===2n);
  const first=dispatches.find(x=>x.fields.operation===1n&&x.fields.query===1n);
  if(!dispatch||!first||String(dispatch.message.value)!==String(PRINCIPAL))throw Error("second dispatch identity mismatch");
  const matchingReceipts=recipientTx.filter(tx=>{
    const m=tx.in_msg;const f=refundFields(bodyOf(m));
    return normalize(m?.source??m?.src)===normalize(VAULT.toRawString())&&
      String(m?.value)===String(PRINCIPAL)&&f?.order===ORDER&&f.operation===2n&&f.query===2n&&
      f.amount===PRINCIPAL&&m?.hash===dispatch.message.hash&&
      bodyOf(m)?.hash().equals(dispatch.body.hash());
  });
  if(matchingReceipts.length!==1)throw Error("exact second recipient inbound message not found or ambiguous");
  const receipt=matchingReceipts[0];
  // Dedicated recipient state is stricter than TON Center v2's absent aborted/computed flags.
  const get=async(address,name,args=[])=>getter(()=>client.runMethod(address,name,args),name);
  const takeInt=async(address,name,args=[])=>(await get(address,name,args)).stack.readBigNumber();
  const takeBool=async(address,name)=>(await get(address,name)).stack.readBoolean();
  const takeAddress=async(address,name)=>(await get(address,name)).stack.readAddress();
  const state={};
  const reads=[
    ["status",()=>takeInt(VAULT,"reserveVaultStatusV3")],
    ["inFlight",()=>takeInt(VAULT,"reserveVaultInFlightV3")],
    ["principal",()=>takeInt(VAULT,"reserveVaultPrincipalV3")],
    ["available",()=>takeInt(VAULT,"reserveVaultAvailableV3")],
    ["paid",()=>takeInt(VAULT,"reserveVaultPaidV3")],
    ["operation",()=>takeInt(VAULT,"reserveVaultOperationV3")],
    ["query",()=>takeInt(VAULT,"reserveVaultQueryV3")],
    ["retryCount",()=>takeInt(VAULT,"reserveVaultRetryCountV3")],
    ["dispatchHash",()=>takeInt(VAULT,"reserveVaultDispatchMessageHashV3")],
    ["enabled",()=>takeBool(RECIPIENT,"s04P001RecipientEnabled")],
    ["acceptedCount",()=>takeInt(RECIPIENT,"s04P001RecipientAcceptedCount")],
    ["received",()=>takeInt(RECIPIENT,"s04P001RecipientReceived")],
    ["recipientVault",()=>takeAddress(RECIPIENT,"s04P001RecipientVault")],
    ["epoch",()=>takeInt(VERIFIER,"verifierEpoch")],
    ["network",()=>takeInt(VERIFIER,"verifierNetwork")],
    ["threshold",()=>takeInt(VERIFIER,"verifierThreshold")],
    ["verifierMarketplace",()=>takeAddress(VERIFIER,"verifierMarketplace")],
  ];
  for(const [k,fn] of reads){state[k]=await fn();await delay(350);}
  if(state.status!==2n||state.inFlight!==PRINCIPAL||state.principal!==PRINCIPAL||
    state.available!==0n||state.paid!==0n||state.operation!==2n||state.query!==2n||
    state.retryCount!==1n||state.dispatchHash===0n||state.enabled!==true||
    state.acceptedCount!==1n||state.received!==PRINCIPAL||
    !state.recipientVault.equals(VAULT)||state.epoch!==1n||state.network!==-3n||
    state.threshold!==3n||!state.verifierMarketplace.equals(OWNER))throw Error("isolated on-chain state disagrees with final receipt");
  const mc=await rpc("getMasterchainInfo");
  const seq=BigInt(mc?.last?.seqno??0);if(seq<=0n)throw Error("missing Testnet masterchain seqno");
  const keys=[0,1,2].map(i=>deriveV3ValidatorKey(needed("V3_VALIDATOR_"+i+"_SEED")));
  if(new Set(keys.map(k=>k.publicKeyHex)).size!==3)throw Error("validator keys not distinct");
  for(let i=0;i<3;i++){
    const actual=await takeInt(VERIFIER,"verifierValidatorKey",[{type:"int",value:BigInt(i)}]);
    if(actual!==BigInt(keys[i].publicKeyDecimal))throw Error("on-chain validator key "+i+" mismatch");
    await delay(350);
  }
  const identity=beginCell().storeAddress(OWNER).storeAddress(VAULT).storeAddress(RECIPIENT).storeUint(ORDER,64).storeCoins(PRINCIPAL).endCell();
  const operation=beginCell().storeUint(2,64).storeUint(2,64).endCell();
  const dispatchRef=beginCell().storeUint(rawHash(dispatch.tx.transaction_id?.hash),256).storeUint(state.dispatchHash,256).endCell();
  const result=beginCell().storeUint(1,8).storeUint(rawHash(receipt.transaction_id?.hash),256)
    .storeUint(rawHash(receipt.in_msg?.hash),256).storeCoins(PRINCIPAL)
    .storeUint(seq,32).storeUint(BigInt(Math.floor(Date.now()/1000)+600),64).storeUint(state.epoch,32).endCell();
  const statement=beginCell().storeUint(0x56523301,32).storeUint(1,16).storeInt(-3,32)
    .storeRef(identity).storeRef(operation).storeRef(dispatchRef).storeRef(result).endCell();
  const sigs=Dictionary.empty(Dictionary.Keys.Uint(8),Dictionary.Values.Cell());
  keys.forEach((key,i)=>sigs.set(i,beginCell().storeBuffer(sign(null,statement.hash(),key.privateKey)).endCell()));
  const words=needed("DEPLOYER_MNEMONIC").split(/\s+/);
  const pair=await mnemonicToPrivateKey(words);
  const wallet=WalletContractV5R1.create({workchain:0,publicKey:pair.publicKey,walletId:{networkGlobalId:-3}});
  if(!wallet.address.equals(OWNER))throw Error("deployer wallet mismatch");
  console.log("S04-P001 FINAL VERIFIED: second dispatch and recipient receipt match; acceptedCount=1 receivedNano=200000000; validator signatures=3/3");
  const current=await takeInt(VAULT,"reserveVaultStatusV3");
  if(current!==2n)throw Error("status changed before signing; no transaction");
  const body=beginCell().storeUint(0x72730503,32).storeRef(statement).storeRef(beginCell().storeDict(sigs).endCell()).endCell();
  const opened=client.open(wallet);
  const walletSeqno=await getter(()=>opened.getSeqno(),"wallet seqno");
  await opened.sendTransfer({seqno:walletSeqno,secretKey:pair.secretKey,messages:[internal({to:VAULT,value:toNano("0.12"),bounce:true,body})]});
  console.log("S04-P001 FINAL 3/3 proof SUBMITTED; verifying exact Vault settlement, do not rerun if RPC times out");
  for(let i=0;i<18;i++){
    await delay(5000);
    const s=await takeInt(VAULT,"reserveVaultStatusV3");
    if(s===3n){
      const paid=await takeInt(VAULT,"reserveVaultPaidV3");
      const inflight=await takeInt(VAULT,"reserveVaultInFlightV3");
      const count=await takeInt(VAULT,"reserveVaultRetryCountV3");
      if(paid!==PRINCIPAL||inflight!==0n||count!==1n)throw Error("finalized Vault amounts invalid");
      console.log("S04-P001 FINAL SETTLED: Vault status=3 paidNano=200000000 inFlight=0 retryCount=1 recipientReceivedNano=200000000");
      return;
    }
    if(s!==2n)throw Error("unexpected Vault status after proof "+s);
  }
  throw Error("proof submitted but final Vault state unconfirmed; do not resubmit");
}
main().catch(e=>{console.error("S04-P001 FINAL BLOCKED: "+e.message);process.exitCode=1;});
