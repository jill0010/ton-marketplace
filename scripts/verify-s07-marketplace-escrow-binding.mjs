import { writeFileSync } from "node:fs";
import { Address, Cell } from "@ton/core";
const marketplace = Address.parse("kQB9Q03obJYKG84bfXFrpL6OtUcX41z54A3m4LFGf_0a14D_");
const productionEscrow = Address.parse("kQBdX2PpCASy50dZOmspilaHrnPa6mgJ-DhuzBpNR4LJpQOP");
const evidence = { network:"testnet", observedAt:new Date().toISOString(), marketplace:marketplace.toRawString(), productionEscrow:productionEscrow.toRawString(), marketplaceBoundEscrow:null, escrowConfigured:null, reciprocalBindingVerified:false, mainnetApproved:false };
try {
  const response = await fetch("https://testnet.toncenter.com/api/v3/runGetMethod", {
    method:"POST", headers:{"Content-Type":"application/json",...(process.env.TONCENTER_API_KEY?{"X-API-Key":process.env.TONCENTER_API_KEY}:{})},
    body:JSON.stringify({address:marketplace.toRawString(),method:"escrowV2",stack:[]}),signal:AbortSignal.timeout(15000)
  });
  if (!response.ok) throw Error("RPC HTTP "+response.status);
  const data = await response.json();
  if ((data.exit_code??data.result?.exit_code)!==0) throw Error("Getter TVM exit code not zero");
  const stack=data.stack??data.result?.stack;
  if (!Array.isArray(stack)||stack.length!==1) throw Error("Unexpected escrowV2 stack");
  const item=stack[0];
  if (!["slice","cell"].includes(item?.type)) throw Error("Unexpected escrowV2 address type");
  const boc=item.cell??item.value;
  if(typeof boc!=="string") throw Error("Missing escrowV2 BOC");
  const slice=Cell.fromBase64(boc).beginParse();
  const address=slice.loadAddress();
  if(slice.remainingBits||slice.remainingRefs) throw Error("Unexpected trailing data");
  evidence.marketplaceBoundEscrow=address.toRawString();
  evidence.reciprocalBindingVerified=address.equals(productionEscrow);
  console.log(JSON.stringify(evidence,null,2));
  if(!evidence.reciprocalBindingVerified) process.exitCode=1;
} catch(error) { evidence.error=String(error?.message??error); console.error(evidence.error); process.exitCode=1; }
finally {writeFileSync("s07-marketplace-escrow-binding-evidence.json",JSON.stringify(evidence,null,2)+"\n");}
