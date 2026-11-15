import {Address,Cell} from "@ton/core";
const collection=Address.parse("EQABD-C8AWc8PnlrsZYg-aDWrB3MhsB0etXI91KO6lZs3KO4");

const seller=Address.parse("0QASRB4XGtN81Pwaef6fWnSJyRwwJEvbbPn-ksz0KQI-bFa0");
const headers=process.env.TONCENTER_API_KEY?{"X-API-Key":process.env.TONCENTER_API_KEY}:{};
async function get(method,params){
 const url=new URL("https://testnet.toncenter.com/api/v2/"+method);
 for(const [k,v] of Object.entries(params))url.searchParams.set(k,String(v));
 for(let i=1;i<=4;i++){
  try{const r=await fetch(url,{headers,signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error("HTTP "+r.status);const j=await r.json();if(!j.ok)throw Error(JSON.stringify(j));return j.result;}
  catch(e){if(i===4||!/429|500|502|503|504|542|timeout|fetch failed/i.test(String(e)))throw e;await new Promise(resolve=>setTimeout(resolve,1500*i));}
 }
}
async function getter(address,method,stack=[]){
 const r=await fetch("https://testnet.toncenter.com/api/v2/runGetMethod",{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({address:address.toString(),method,stack}),signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error(method+" HTTP "+r.status);
 const j=await r.json();if(!j.ok)throw Error(method+" "+JSON.stringify(j));return j.result;
}
const cs=await get("getAddressInformation",{address:collection.toString()});
const isMinted=cs.state==="active"&&!!cs.data?Cell.fromBase64(cs.data).beginParse():null;
let minted=null;
if(isMinted){isMinted.loadAddress();isMinted.loadUintBig(256);isMinted.loadRef();minted=isMinted.loadBit();}
console.log("S05_COLLECTION_MINTED:",minted);
const collectionGetter=await getter(collection,"get_nft_address_by_index",[["num","1"]]);
if(collectionGetter.exit_code!==0)throw Error("Collection getter exited nonzero");
const addressCell=Cell.fromBase64(collectionGetter.stack[0][1].bytes);
const item=addressCell.beginParse().loadAddress();
if(!item)throw Error("Collection returned no item address");
console.log("S05_DERIVED_ITEM_ADDRESS:",item.toString());
const itemState=await get("getAddressInformation",{address:item.toString()});
console.log("S05_ITEM_STATE:",itemState.state);
console.log("S05_ITEM_CODE_PRESENT:",Boolean(itemState.code));
for(const [label,address] of [["COLLECTION",collection],["ITEM",item]]){
 const txs=await get("getTransactions",{address:address.toString(),limit:10});
 for(const tx of txs.filter(tx=>tx.utime>=Date.parse("2026-11-15T14:32:00Z")/1000)){
  console.log("S05_"+label+"_TX:",JSON.stringify({time:new Date(tx.utime*1000).toISOString(),hash:tx.transaction_id?.hash,source:tx.in_msg?.source,value:tx.in_msg?.value,computeExit:tx.description?.compute_ph?.exit_code,aborted:tx.description?.aborted,out:tx.out_msgs?.map(m=>({destination:m.destination,value:m.value}))}));
 }
}
if(itemState.state!=="active"||!itemState.code)throw Error("S05 NFT item not active");
if(itemState.state==="active"){
 const nft=await getter(item,"get_nft_data");
 console.log("S05_ITEM_GETTER_EXIT:",nft.exit_code);
 console.log("S05_ITEM_GETTER_STACK:",JSON.stringify(nft.stack));
 const initialized=BigInt(nft.stack[0][1])===-1n;
 const index=BigInt(nft.stack[1][1])===1n;
 const decode=(entry)=>{if(entry?.[0]!=="cell"||!entry[1]?.bytes)throw Error("Invalid NFT address stack entry");const address=Cell.fromBase64(entry[1].bytes).beginParse().loadAddress();if(!address)throw Error("NFT address is null");return address;};
 const actualCollection=decode(nft.stack[2]);
 const actualOwner=decode(nft.stack[3]);
 console.log("S05_ACTUAL_OWNER:",actualOwner.toString());
 console.log("S05_EXPECTED_SELLER:",seller.toString());
 console.log("S05_ACTUAL_COLLECTION:",actualCollection.toString());
 if(!initialized||!index||!actualCollection.equals(collection)||!actualOwner.equals(seller))throw Error("S05 NFT initialization, index, Collection or seller Owner mismatch");
 console.log("S05_SELLER_OWNER_VERIFIED: true");
}
console.log("S05_READ_ONLY_NO_BROADCAST: true");
