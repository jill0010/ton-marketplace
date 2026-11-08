import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { Address, Cell } from "@ton/core";

const roles = ["marketplace", "escrow", "coordinator"];
const expected = {
  marketplace: "78359546161773769121804334657237004017492887152734900376191088699783038521579",
  // This historic production TESTNET deployment uses the escrow Testnet fixture code,
  // not the production NFTEscrowV2 code hash. Never conflate the two.
  escrow: "101764511745891446825793649001643455668042447699317077464808806092838979242128",
  coordinator: "66691359611383353754318373230718900986162645101604635612762337495115879334100",
};
const output = { escrowCodeVariant: "testnet-fixture (not production NFTEscrowV2)", network: "testnet", baseline: "223cebcd0977d90486c71417645a6fe2cbaa4953", candidate: "4d97607a6bd22494e105852a3c375fc905a9d219", contracts: {}, allMatch: false };
let ok = true;
for (const role of roles) {
  const address = process.env["V3_TESTNET_" + role.toUpperCase() + "_ADDRESS"];
  assert(address, "Missing testnet " + role + " address");
  const parsed = Address.parse(address);
  assert.equal(parsed.workChain, 0, "Only workchain 0 supported");
  const endpoint = new URL("https://testnet.toncenter.com/api/v2/getAddressInformation");
  endpoint.searchParams.set("address", parsed.toRawString());
  const headers = {};
  if (process.env.TONCENTER_API_KEY) headers["X-API-Key"] = process.env.TONCENTER_API_KEY;
  let result;
  try {
    const response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(15000) });
    assert(response.ok, role + ": HTTP " + response.status);
    const json = await response.json();
    assert(json.ok === true && json.result, role + ": invalid RPC response");
    result = json.result;
  } catch (error) {
    output.contracts[role] = { address: parsed.toRawString(), match: false, error: String(error?.message || error) };
    ok = false;
    continue;
  }
  const active = result.state === "active";
  const code = typeof result.code === "string" && result.code.length > 0 ? result.code : null;
  const observed = code ? BigInt("0x" + Cell.fromBase64(code).hash().toString("hex")).toString() : null;
  const match = active && observed === expected[role];
  output.contracts[role] = { address: parsed.toRawString(), active, codePresent: Boolean(code), observedCodeHashDecimal: observed, expectedCodeHashDecimal: expected[role], match };
  if (!match) ok = false;
}
output.allMatch = ok;
writeFileSync(process.env.V3_EVIDENCE_OUTPUT || "v3-testnet-evidence.json", JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify(output, null, 2));
if (!ok) process.exitCode = 1;
