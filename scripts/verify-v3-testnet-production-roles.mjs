import { writeFileSync } from "node:fs";
import { Address, Cell } from "@ton/core";

const roles = [
  ["vault", "V3_TESTNET_VAULT_ADDRESS", "96403339264512730204843696723697573046015770335637526243123230074643027115550"],
  ["verifier", "V3_TESTNET_VERIFIER_ADDRESS", "40137527310137199081220684777089428003119541313287351217810842336613359506965"],
  ["productionEscrow", "V3_TESTNET_PRODUCTION_ESCROW_ADDRESS", "81598614757632845067695927561143533301816638303328283688424659201933137039160"],
];
const evidence = { network: "testnet", candidate: "4d97607a6bd22494e105852a3c375fc905a9d219", observedAt: new Date().toISOString(), results: {}, allProvidedMatch: false, allProductionRolesVerified: false, mainnetApproved: false };
let valid = true, supplied = 0;
for (const [role, envName, expected] of roles) {
  const value = process.env[envName]?.trim();
  if (!value) { evidence.results[role] = { status: "NOT_PROVIDED", verified: false }; continue; }
  supplied++;
  try {
    const addr = Address.parse(value);
    if (addr.workChain !== 0) throw Error("Expected workchain 0");
    const endpoint = new URL("https://testnet.toncenter.com/api/v2/getAddressInformation");
    endpoint.searchParams.set("address", addr.toRawString());
    const headers = process.env.TONCENTER_API_KEY ? { "X-API-Key": process.env.TONCENTER_API_KEY } : {};
    const response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error("RPC HTTP " + response.status);
    const json = await response.json();
    if (json.ok !== true || !json.result) throw Error("Invalid RPC result");
    const active = json.result.state === "active";
    const code = json.result.code;
    const observed = typeof code === "string" && code ? BigInt("0x" + Cell.fromBase64(code).hash().toString("hex")).toString() : null;
    const verified = active && observed === expected;
    evidence.results[role] = { address: addr.toRawString(), state: json.result.state, expectedCodeHashDecimal: expected, observedCodeHashDecimal: observed, verified };
    if (!verified) valid = false;
  } catch (error) {
    evidence.results[role] = { address: value, verified: false, error: String(error?.message || error) };
    valid = false;
  }
}
evidence.allProvidedMatch = valid && supplied > 0;
evidence.allProductionRolesVerified = valid && supplied === roles.length;
writeFileSync(process.env.V3_EVIDENCE_OUTPUT || "v3-production-roles-evidence.json", JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify(evidence, null, 2));
if (!evidence.allProductionRolesVerified) process.exitCode = 1;
