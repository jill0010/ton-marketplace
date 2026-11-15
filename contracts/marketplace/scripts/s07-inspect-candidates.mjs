import {readFileSync} from 'node:fs';
import {verifyV3ProductionTestnet} from './verify-v3-production-testnet.mjs';
const log=readFileSync(process.argv[2],'utf8');
const names=['marketplace','escrow','coordinator','verifier'];
const addresses={}; const hashes={};
for(const name of names){
 const a=log.match(new RegExp('V3 testnet candidate '+name+':\\s*(\\S+)'));
 const h=log.match(new RegExp('V3 trusted compiled '+name+' code hash:\\s*(\\d+)'));
 if(!a||!h)throw Error('Missing '+name+' candidate evidence');
 addresses[name]=a[1]; hashes[name]=h[1];
}
const result=await verifyV3ProductionTestnet(addresses,fetch,hashes);
console.log(JSON.stringify({originalRunId:43747006664,addresses,contracts:result.contracts,allActive:result.allActive,codeHashesVerified:result.codeHashesVerified,noTransactionSent:true,mainnetApproved:false},null,2));
