#!/usr/bin/env node
// S07-09: strictly read-only discovery of compatible, seller-owned TESTNET NFT Items.
// Production Escrow V2 only accepts these two immutable code hashes.
import { Address, Cell } from "@ton/core";
const owner = process.env.V3_TESTNET_DEPLOYER_ADDRESS;
const allowed = new Set([
 "8b711e6809672c0335dc61d1da1dcc4059c973248af707bd586245085ea70b32",
 "30dcd7d5b6fcf5968c2791e1e31ad732f2672f2986e1d6970eb03cca22d23251"
]);
if (!owner) throw Error("Seller address required");
const base = "https://testnet.tonapi.io";
async function get(path) {
 const r = await fetch(base + path, {headers:{accept:"application/json"},signal:AbortSignal.timeout(25000)});
 if(!r.ok) throw Error("Testnet API HTTP "+r.status+" "+path);
 return r.json();
}
let offset=0, scanned=0, compatible=[];
for(let page=0;page<10;page++){
 const data=await get("/v2/accounts/"+encodeURIComponent(owner)+"/nfts?limit=100&offset="+offset);
 const items=data.nft_items||[];
 for(const item of items){
  scanned++;
  const address=item.address;
  if(!address)continue;
  const ownerAddress=item.owner?.address||item.owner;
  if(ownerAddress && typeof ownerAddress==="string" && !Address.parse(ownerAddress).equals(Address.parse(owner)))continue;
  try{
   const account=await get("/v2/blockchain/accounts/"+encodeURIComponent(address));
   if(!account.code)continue;
   const code=Cell.fromBoc(Buffer.from(account.code,"base64"))[0];
   const hash=code.hash().toString("hex");
   console.log("S07_09_CANDIDATE:",JSON.stringify({address,collection:item.collection?.address||null,code_hash:hash,allowed:allowed.has(hash)}));
   if(allowed.has(hash))compatible.push({address,collection:item.collection?.address||null,code_hash:hash});
  }catch(e){console.log("S07_09_CANDIDATE_INSPECTION_ERROR:",JSON.stringify({address,error:String(e)}));}
 }
 offset+=items.length;
 if(items.length<100)break;
}
console.log("S07_09_SCANNED_SELLER_NFTS:",scanned);
console.log("S07_09_COMPATIBLE_SELLER_NFTS:",JSON.stringify(compatible));
console.log("S07_09_COMPATIBILITY_SEARCH_COMPLETE:",scanned<1000);
if(scanned>=1000)process.exitCode=2;
