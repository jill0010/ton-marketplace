// S04-P001 exact bounced-amount attestation; Testnet ONLY.
// Re-check on-chain RichBounce linkage and Vault state before any signing or broadcast.
import { sign } from "node:crypto";
import { Address, beginCell, Dictionary, toNano } from "@ton/core";
import { mnemonicToPrivateKey } from "@ton/crypto";
import { TonClient, WalletContractV5R1, internal } from "@ton/ton";
import { inspectFailedRefund } from "./collect-s04-p001-failed-refund-evidence.mjs";
import { deriveV3ValidatorKey } from "./derive-v3-validator-keys.mjs";

const API = "https://testnet.toncenter.com/api/v2";
const ORDER = "666969981";
const PRINCIPAL = 200000000n;
const RETURNED = 199815198n;
const VAULT = Address.parse("kQB9H6xuScwj6Jn5jI_iSA8Zr5y-8gvweh6nQTTNvODz8f4u");
const RECIPIENT = Address.parse("kQDCFOYiVkLV4H-UqNxPO2XEnm5lJpEEnYnU7fjH1iXqKXvy");
const VERIFIER = Address.parse("kQB_3iLBqs2iW0qC2QbPeOisGfxPf46yGLZUOw3GgGxXZYO4");
const OWNER = Address.parse("0QDQEewIr69mGcq6uDIlAtibxW37gm7rJfKWru7o4_hSPbzu");
const required = (name) => { const v=process.env[name]?.trim(); if(!v) throw Error("Missing "+name); return v; };
const delay=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
async function rpc(method, params={}) {
  const url = new URL(API+"/"+method);
  for (const [k,v] of Object.entries(params)) url.searchParams.set(k,String(v));
  for(let i=0;i<6;i++){
    const response=await fetch(url,{headers:process.env.TONCENTER_TESTNET_API_KEY?{"X-API-Key":process.env.TONCENTER_TESTNET_API_KEY}:{},redirect:"error"});
    if(response.ok){const data=await response.json();if(!data.ok)throw Error(method+" ok=false");return data.result;}
    if(![429,500,502,503,504,542].includes(response.status)||i===5)throw Error(method+" HTTP "+response.status);
    await delay(1000*(i+1));
  }
}
const uint256=(hash)=>{const s=String(hash||"");if(!/^[0-9a-f]{64}$/i.test(s)&&!/^[A-Za-z0-9+/]{43}=$/.test(s))throw Error("invalid 256-bit hash encoding");const b=/^[0-9a-f]{64}$/i.test(s)?Buffer.from(s,"hex"):Buffer.from(s,"base64");if(b.length!==32)throw Error("invalid 256-bit transaction hash");return BigInt("0x"+b.toString("hex"));};
async function getNumber(client,address,name){return (await client.runMethod(address,name)).stack.readBigNumber();}
async function main(){
  if(process.env.GITHUB_REF!=="refs/heads/feature/reserve-refund-v3-audit")throw Error("wrong branch");
  if(required("S04_P001_ATTEST_APPROVED")!=="true")throw Error("explicit testnet attestation not enabled");
  const client=new TonClient({endpoint:API+"/jsonRPC",...(process.env.TONCENTER_TESTNET_API_KEY?{apiKey:process.env.TONCENTER_TESTNET_API_KEY}:{})});
  const [vaultTx,buyerTx,mc]=await Promise.all([
    rpc("getTransactions",{address:VAULT.toRawString(),limit:100}),
    rpc("getTransactions",{address:RECIPIENT.toRawString(),limit:100}),
    rpc("getMasterchainInfo"),
  ]);
  const evidence=inspectFailedRefund({vault:VAULT.toRawString().toLowerCase(),buyer:RECIPIENT.toRawString().toLowerCase(),vaultTransactions:vaultTx,buyerTransactions:buyerTx,expectedOrderId:ORDER});
  if(evidence.outbound.length!==1||evidence.failedReceipts.length!==1)throw Error("not exactly one dispatch/bounce");
  const dispatch=evidence.outbound[0],bounce=evidence.failedReceipts[0],body=dispatch.body;
  if(!bounce.matchingBuyerOutbound||body?.orderId!==ORDER||body.operationId!=="1"||body.queryId!=="1"||
    body.amount!==String(PRINCIPAL)||bounce.decodedBounce.exitCode!==814||
    bounce.decodedBounce.format!=="rich"||bounce.decodedBounce.bodyHashHex!==body.bodyHashHex||
    BigInt(bounce.returnedNano)!==RETURNED||BigInt(dispatch.valueNano)!==PRINCIPAL||
    bounce.dispatchTransaction.hash!==dispatch.transaction.hash)throw Error("exact 0.2 TON bounce linkage mismatch");
  const [status,inFlight,principal,paid,available,operation,query,retries,dispatchHash,accepted,enabled,recipientVault,epoch,network,threshold,verifierMarketplace]=await Promise.all([
    getNumber(client,VAULT,"reserveVaultStatusV3"),getNumber(client,VAULT,"reserveVaultInFlightV3"),
    getNumber(client,VAULT,"reserveVaultPrincipalV3"),getNumber(client,VAULT,"reserveVaultPaidV3"),
    getNumber(client,VAULT,"reserveVaultAvailableV3"),getNumber(client,VAULT,"reserveVaultOperationV3"),
    getNumber(client,VAULT,"reserveVaultQueryV3"),getNumber(client,VAULT,"reserveVaultRetryCountV3"),
    getNumber(client,VAULT,"reserveVaultDispatchMessageHashV3"),
    getNumber(client,RECIPIENT,"s04P001RecipientAcceptedCount"),getNumber(client,RECIPIENT,"s04P001RecipientEnabled"),
    (await client.runMethod(RECIPIENT,"s04P001RecipientVault")).stack.readAddress(),
    getNumber(client,VERIFIER,"verifierEpoch"),getNumber(client,VERIFIER,"verifierNetwork"),
    getNumber(client,VERIFIER,"verifierThreshold"),
    (await client.runMethod(VERIFIER,"verifierMarketplace")).stack.readAddress(),
  ]);
  if(status!==2n||inFlight!==PRINCIPAL||principal!==PRINCIPAL||paid!==0n||available!==0n||
    operation!==1n||query!==1n||retries!==0n||dispatchHash===0n||accepted!==0n||
    enabled!==0n||!recipientVault.equals(VAULT)||epoch!==1n||network!==-3n||
    threshold!==3n||!verifierMarketplace.equals(OWNER))throw Error("on-chain Vault/recipient/verifier state changed; attestation blocked");
  // TON Center transaction hashes identify the actual dispatch and the inbound bounced transfer.
  const seq=BigInt(mc?.last?.seqno||0);
  if(seq<=0n)throw Error("masterchain not confirmed");
  const identity=beginCell().storeAddress(OWNER).storeAddress(VAULT).storeAddress(RECIPIENT)
    .storeUint(BigInt(ORDER),64).storeCoins(PRINCIPAL).endCell();
  const op=beginCell().storeUint(operation,64).storeUint(query,64).endCell();
  const d=beginCell().storeUint(uint256(dispatch.transaction.hash),256).storeUint(dispatchHash,256).endCell();
  const result=beginCell().storeUint(2,8).storeUint(uint256(bounce.transaction.hash),256)
    .storeUint(uint256(bounce.messageHash),256).storeCoins(RETURNED)
    .storeUint(seq,32).storeUint(BigInt(Math.floor(Date.now()/1000)+600),64).storeUint(epoch,32).endCell();
  const statement=beginCell().storeUint(0x56523301,32).storeUint(1,16).storeInt(-3,32)
    .storeRef(identity).storeRef(op).storeRef(d).storeRef(result).endCell();
  const keys=[0,1,2].map(i=>deriveV3ValidatorKey(required("V3_VALIDATOR_"+i+"_SEED")));
  if(new Set(keys.map(k=>k.publicKeyDecimal)).size!==3)throw Error("not 3 independent validator keys");
  for(let i=0;i<3;i++){
    const onchain=(await client.runMethod(VERIFIER,"verifierValidatorKey",[{type:"int",value:BigInt(i)}])).stack.readBigNumber();
    if(onchain!==BigInt(keys[i].publicKeyDecimal))throw Error("validator "+i+" public key mismatch");
  }
  const sigs=Dictionary.empty(Dictionary.Keys.Uint(8),Dictionary.Values.Cell());
  keys.forEach((k,i)=>sigs.set(i,beginCell().storeBuffer(sign(null,statement.hash(),k.privateKey)).endCell()));
  const sigBundle=beginCell().storeDict(sigs).endCell();
  const words=required("DEPLOYER_MNEMONIC").split(/\s+/);
  const pair=await mnemonicToPrivateKey(words);
  const wallet=WalletContractV5R1.create({workchain:0,publicKey:pair.publicKey,walletId:{networkGlobalId:-3}});
  if(!wallet.address.equals(OWNER))throw Error("deployer wallet mismatch");
  const before=await getNumber(client,VAULT,"reserveVaultStatusV3");
  if(before!==2n)throw Error("state changed immediately before attestation");
  console.log("S04-P001 VERIFIED: linked RichBounce exit 814; returnedNano="+RETURNED+"; topUpNano="+(PRINCIPAL-RETURNED)+"; validators=3/3");
  const bodyMessage=beginCell().storeUint(0x72730503,32).storeRef(statement).storeRef(sigBundle).endCell();
  await client.open(wallet).sendTransfer({seqno:await client.open(wallet).getSeqno(),secretKey:pair.secretKey,messages:[internal({to:VAULT,value:toNano("0.12"),bounce:true,body:bodyMessage})]});
  console.log("S04-P001 submitted 3/3 bounce attestation; checking Vault transition");
  for(let i=0;i<18;i++){
    await delay(5000);
    const s=await getNumber(client,VAULT,"reserveVaultStatusV3");
    if(s===4n){
      const a=await getNumber(client,VAULT,"reserveVaultAvailableV3");
      const f=await getNumber(client,VAULT,"reserveVaultInFlightV3");
      if(a!==RETURNED||f!==0n)throw Error("unexpected partial bounce accounting");
      console.log("S04-P001 ATTESTED: status=4 availableNano="+a+" exactTopUpNano="+(PRINCIPAL-a));
      return;
    }
    if(s!==2n)throw Error("Vault unexpected status "+s);
  }
  throw Error("attestation broadcast but Vault has not reached partial bounce state: do not resubmit");
}
main().catch(e=>{console.error("S04-P001 BLOCKED: "+e.message);process.exitCode=1;});
