// S05 read-only on-chain NFT code hash and owner compatibility gate.
// Never signs, deploys, transfers, lists, or purchases anything.
import { Cell, Address } from "@ton/core";
const nftAddress = "kQCq13VYJqQ0Oov-a2-MKE57MWIuEtiQaoF_lYNCAEnAofhm";
const expectedCollection = "0QDQEewIr69mGcq6uDIlAtibxW37gm7rJfKWru7o4_hSPbzu";
const expectedSeller = "0QASRB4XGtN81Pwaef6fWnSJyRwwJEvbbPn-ksz0KQI-bFa0";
const allowed = new Set([
  "8b711e6809672c0335dc61d1da1dcc4059c973248af707bd586245085ea70b32",
  "30dcd7d5b6fcf5968c2791e1e31ad732f2672f2986e1d6970eb03cca22d23251",
]);
const endpoint = "https://testnet.toncenter.com/api/v2/";
async function rpc(method, params, post=false) {
  const url = new URL(endpoint + method);
  if (!post) for (const [key,value] of Object.entries(params)) url.searchParams.set(key,String(value));
  for (let attempt=0;attempt<4;attempt++) {
    const response=await fetch(url,{
      method:post?"POST":"GET",
      headers:{"X-API-Key":process.env.TONCENTER_API_KEY??"",...(post?{"Content-Type":"application/json"}:{})},
      body:post?JSON.stringify(params):undefined,
      signal:AbortSignal.timeout(20000)
    });
    if ([429,500,502,503,504].includes(response.status)&&attempt<3) {
      await new Promise(r=>setTimeout(r,1000*(attempt+1)));continue;
    }
    if (!response.ok) throw new Error(method+" HTTP "+response.status+": "+(await response.text()).slice(0,300));
    const data=await response.json();
    if (data.ok!==true) throw new Error(method+" RPC error "+JSON.stringify(data.description??data.error));
    return data.result;
  }
  throw new Error("RPC retries exhausted");
}
if (!process.env.TONCENTER_API_KEY) throw new Error("Missing testnet TON Center API key");
const account=await rpc("getAddressInformation",{address:nftAddress});
if (account.state!=="active") throw new Error("NFT account not active: "+account.state);
if (typeof account.code!=="string"||!account.code) throw new Error("No account code returned");
const roots=Cell.fromBoc(Buffer.from(account.code,"base64"));
if (roots.length!==1) throw new Error("Unexpected NFT code BOC root count");
const hash=roots[0].hash().toString("hex");
console.log("S05_NFT_CODE_HASH:",hash);
console.log("S05_ESCROW_CODE_ALLOWLIST_MATCH:",allowed.has(hash));
if (!allowed.has(hash)) throw new Error("Production Escrow code allowlist mismatch; custody forbidden");
const data=await rpc("runGetMethod",{address:nftAddress,method:"get_nft_data",stack:[]},true);
if (data.exit_code!==0||!Array.isArray(data.stack)||data.stack.length!==5) throw new Error("Unexpected NFT getter response");
function getNumber(entry){if(entry?.[0]!=="num")throw new Error("Unexpected number stack entry");return BigInt(entry[1]);}
function getAddress(entry){
  if (!["cell","slice"].includes(entry?.[0])||typeof entry[1]?.bytes!=="string")throw new Error("Unexpected address stack entry");
  const cells=Cell.fromBoc(Buffer.from(entry[1].bytes,"base64"));
  if(cells.length!==1)throw new Error("Unexpected address BOC");
  const a=cells[0].beginParse().loadAddress();
  if(!a)throw new Error("Null NFT address");
  return a;
}
const initialized=getNumber(data.stack[0])!==0n;
const index=getNumber(data.stack[1]);
const collection=getAddress(data.stack[2]);
const owner=getAddress(data.stack[3]);
const eq=(a,b)=>a.equals(Address.parse(b));
console.log("S05_NFT_INITIALIZED:",initialized);
console.log("S05_NFT_INDEX:",index.toString());
console.log("S05_COLLECTION_MATCH:",eq(collection,expectedCollection));
console.log("S05_OWNER:",owner.toString());
console.log("S05_SELLER_MATCH:",eq(owner,expectedSeller));
if (!initialized||index!==1n||!eq(collection,expectedCollection))throw new Error("NFT identity mismatch");
if (!eq(owner,expectedSeller)) {
 console.log("S05_NEXT_ACTION: NFT code accepted; owner must transfer to seller before custody");
 console.log("S05_CUSTODY_AUTHORIZED: false");
} else {
 console.log("S05_NEXT_ACTION: seller matches; prepare separate guarded custody transaction");
 console.log("S05_CUSTODY_AUTHORIZED: false");
}
