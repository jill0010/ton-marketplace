import {parseV3ContractCode} from './verify-v3-testnet.mjs';
const candidates={
 marketplace:'0:bf521476c12b5898598f97f5b669c616eda78b50c0569fb1a040de1bd469b1a8',
 escrow:'0:4c597f5a81ccc1e4c1a0a87413054db28554bb0295808e181a7a814776440146',
 coordinator:'0:31522ecb4dfbf2d369b363f777a1d81b2249678b494db4e9f9544c2d6b864c16',
 verifier:'0:7dd51d2284f7e522115116b7c42aad0884841fcdca1acec7fa04f51ad35ff6ed'
};
const expectedEscrowHash='b4672de5774209c33b39c6d20a2763749911b28484b5e3795cd8b165ea824f38';
const expectedVerifierHash='58bd090fb8b11c904d7635b355a1ca1b07faffbe8c7c25570058bf6b4ba15615';
const expectedMarketplaceHash='ad3dee71e21d733399b82421d16bc74268f47c9ac068b73ba159a0aba64650eb';
for(const [name,address] of Object.entries(candidates)){
 const url=new URL('https://testnet.toncenter.com/api/v2/getAddressInformation');url.searchParams.set('address',address);
 let response;
 for(let attempt=0;attempt<5;attempt++){
  response=await fetch(url,{headers:process.env.TONCENTER_API_KEY?{'X-API-Key':process.env.TONCENTER_API_KEY}:{},redirect:'error'});
  if(response.ok)break;
  if(![429,500,502,503,504].includes(response.status)||attempt===4)throw Error(name+' RPC HTTP '+response.status);
  await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));
 }
 const data=await response.json();
 if(data.ok!==true||!data.result)throw Error('Invalid testnet RPC response for '+name);
 const state=data.result.state;const code=parseV3ContractCode(data.result.code);
 console.log(name+': '+state+', codeHash='+(code?.codeHash??'none'));
 if(name==='marketplace'){
  if(state!=='active'||code?.codeHash!==expectedMarketplaceHash)throw Error('Existing Marketplace V3 is not verified: abort deployment');
 }else if(name==='escrow'){
  if(state!=='active'||code?.codeHash!==expectedEscrowHash)throw Error('Existing Escrow V2 is not verified: abort deployment');
 }else if(name==='verifier'){
  if(state!=='active'||code?.codeHash!==expectedVerifierHash)throw Error('Existing Verifier V3 is not verified: abort deployment');
 }else if(state!=='uninitialized'||code!==null){
  throw Error(name+' is not uninitialized: abort to prevent duplicate deployment');
 }
 await new Promise(resolve=>setTimeout(resolve,1200));
}
console.log('S07_COORDINATOR_ONLY_PREFLIGHT_PASSED: true');
