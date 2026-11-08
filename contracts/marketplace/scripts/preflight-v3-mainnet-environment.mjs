// Read-only preflight for the local V3 Mainnet deployment launcher.
// No private keys, wallet signing, network calls, or deployment transactions.
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const EXPECTED_MAINNET_GLOBAL_ID = -239;
const ADDRESS = /^(?:UQ|EQ)[A-Za-z0-9_-]{46}$/;
const UINT256_MAX = (1n << 256n) - 1n;

export function inspectV3MainnetEnvironment(env = process.env) {
  const problems = [];
  const approved = env.V3_MAINNET_DEPLOY_APPROVED === "true";
  const deployer = (env.V3_MAINNET_DEPLOYER_ADDRESS ?? "").trim();
  const treasury = (env.PLATFORM_TREASURY_ADDRESS ?? "").trim();
  const signer = (env.V3_CONNECTED_DEPLOYER_ADDRESS ?? "").trim();
  if (!approved) problems.push("V3_MAINNET_DEPLOY_APPROVED must be exactly true; no signing is authorized.");
  if (!ADDRESS.test(deployer)) problems.push("V3_MAINNET_DEPLOYER_ADDRESS is missing or not a standard user-friendly TON address.");
  if (!ADDRESS.test(treasury)) problems.push("PLATFORM_TREASURY_ADDRESS is missing or not a standard user-friendly TON address.");
  if (deployer && treasury && deployer === treasury) problems.push("Deployer and treasury must be distinct.");
  if (signer && !ADDRESS.test(signer)) problems.push("V3_CONNECTED_DEPLOYER_ADDRESS is not a standard user-friendly TON address.");
  if (signer && deployer && signer !== deployer) {
    problems.push("Connected signer address differs from V3_MAINNET_DEPLOYER_ADDRESS (compare normalized on-chain addresses if formats differ).");
  }
  const keys = [];
  for (let i = 0; i < 3; i++) {
    const variable = `V3_VALIDATOR_${i}_PUBLIC_KEY`;
    const raw = (env[variable] ?? "").trim();
    if (!/^[0-9]+$/.test(raw)) {
      problems.push(`${variable} must be a decimal uint256 public key.`);
      continue;
    }
    const value = BigInt(raw);
    if (value <= 0n || value > UINT256_MAX) problems.push(`${variable} must be within 1..2^256-1.`);
    keys.push(value.toString());
  }
  if (keys.length === 3 && new Set(keys).size !== 3) problems.push("Validator public keys must be three distinct numbers.");
  const nonce = (env.V3_MAINNET_DEPLOYMENT_NONCE ?? "1").trim();
  if (!/^[0-9]+$/.test(nonce) || BigInt(nonce) <= 0n || BigInt(nonce) >= 9223372036854775807n) {
    problems.push("V3_MAINNET_DEPLOYMENT_NONCE must be a positive int64 below 9223372036854775807.");
  }
  // This check cannot know which wallet Acton will actually connect to, or
  // prove base64 address normalization, code hashes, or independent security review.
  return {
    networkGlobalId: EXPECTED_MAINNET_GLOBAL_ID,
    environmentValid: problems.length === 0,
    signerVerified: false,
    contractReleaseApproved: false,
    safeToBroadcast: false,
    checks: { approvalFlag: approved, deployerPresent: ADDRESS.test(deployer), treasuryPresent: ADDRESS.test(treasury), keysPresent: keys.length === 3, nonceValid: /^[0-9]+$/.test(nonce) },
    problems,
    next: "Confirm the selected TonConnect wallet with Acton and complete independent release checks. This preflight never authorizes Mainnet deployment."
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = inspectV3MainnetEnvironment();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.environmentValid ? 0 : 1;
}
