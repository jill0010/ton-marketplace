import assert from "node:assert/strict";
import {Cell,Address} from "@ton/core";
const collection=Address.parse("EQABD-C8AWc8PnlrsZYg-aDWrB3MhsB0etXI91KO6lZs3KO4");
const deployer=Address.parse(process.env.S05_TESTNET_DEPLOYER_ADDRESS);
const seller=Address.parse(process.env.S05_TESTNET_SELLER_ADDRESS);
const itemCode=Cell.fromBoc(Buffer.from(process.env.S05_PEPPERMINT_ITEM_CODE_BOC_HEX,"hex"))[0];
assert.equal(itemCode.hash().toString("hex"),"30dcd7d5b6fcf5968c2791e1e31ad732f2672f2986e1d6970eb03cca22d23251");
const headers={"X-API-Key":process.env.TONCENTER_API_KEY};
async function rpc(method,params){
  const url=new URL("https://testnet.toncenter.com/api/v2/"+method);
  for(const [k,v] of Object.entries(params))url.searchParams.set(k,String(v));
  for(let attempt=1;attempt<=4;attempt++){
    try{
      const res=await fetch(url,{headers,signal:AbortSignal.timeout(20000)});
      if(!res.ok)throw Error(method+" HTTP "+res.status);
      const data=await res.json();
      if(!data.ok)throw Error(method+" API "+JSON.stringify(data.error));
      return data.result;
    }catch(e){
      if(attempt===4||!/429|500|502|503|504|542|timeout|fetch failed/i.test(String(e)))throw e;
      await new Promise(r=>setTimeout(r,1500*attempt));
    }
  }
}
const state=await rpc("getAddressInformation",{address:collection.toString()});
assert.equal(state.state,"active","Collection must be active");
assert.ok(state.code&&state.data,"Collection code and data must exist");
const data=Cell.fromBase64(state.data).beginParse();
const owner=data.loadAddress();
const index=data.loadUintBig(256);
const chainItemCode=data.loadRef();
const minted=data.loadBit();
assert.ok(owner.equals(deployer),"Collection owner mismatch");
assert.equal(index,1n,"Collection item index mismatch");
assert.ok(chainItemCode.hash().equals(itemCode.hash()),"Item code hash mismatch");
assert.equal(minted,false,"Collection already minted; do not broadcast");
const getter=await fetch("https://testnet.toncenter.com/api/v2/runGetMethod",{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({address:collection.toString(),method:"get_nft_address_by_index",stack:[["num","1"]]}),signal:AbortSignal.timeout(20000)});
assert.ok(getter.ok,"Collection getter HTTP failure");
const result=await getter.json();
assert.equal(result.ok,true);
assert.equal(result.result.exit_code,0);
const nftAddress=Address.parse(Cell.fromBase64(result.result.stack[0][1].bytes).beginParse().loadAddress().toString());
const nftState=await rpc("getAddressInformation",{address:nftAddress.toString()});
assert.notEqual(nftState.state,"active","NFT item already active; do not mint");
console.log("S05_PREFLIGHT_COLLECTION:",collection.toString());
console.log("S05_PREFLIGHT_ITEM:",nftAddress.toString());
console.log("S05_PREFLIGHT_SELLER:",seller.toString());
console.log("S05_PREFLIGHT_MINTED_FALSE: true");
console.log("S05_PREFLIGHT_OK: true");
