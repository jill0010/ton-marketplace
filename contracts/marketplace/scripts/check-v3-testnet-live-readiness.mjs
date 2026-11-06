// Fail-closed deployment preflight for experimental V3.
// Static source check is a blocker, NOT an audit or chain proof.
// Do not inject mnemonic, RPC key, or send any transactions.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const contractPath = fileURLToPath(new URL("../contracts/TestReserveVault.tolk", import.meta.url));
export function inspectV3TestnetReadiness(source) {
  if (typeof source !== "string" || !source.includes("contract TestReserveVault")) {
    throw new TypeError("Missing experimental V3 vault contract");
  }
  const retry = source.match(/RetryTestReserve\s*=>\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
  const ownerAttestationOnly = retry.includes("returnEvidenceHash") &&
    !retry.includes("independentVerifiedReturn");
  const receipt = source.match(/ConfirmTestReserveReceipt\s*=>\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
  const ownerAttestedReceipt = receipt.includes("receiptHash") &&
    !receipt.includes("independentVerifiedReceipt");
  return {
    contractFound: true,
    ownerAttestationOnly,
    ownerAttestedReceipt,
    testnetDeploymentApproved: false,
    liveRefundTestApproved: false,
    liveRetryApproved: false,
    mainnetApproved: false,
    reasons: [
      ...(ownerAttestationOnly ? ["OWNER_ATTESTED_RETURN_CAN_TRIGGER_RETRY"] : []),
      ...(ownerAttestedReceipt ? ["OWNER_ATTESTED_RECEIPT_NOT_CHAIN_PROOF"] : []),
      "NO_INDEPENDENT_ONCHAIN_SETTLEMENT_PROOF",
      "NO_ATOMIC_ONCHAIN_REFUND_IDEMPOTENCY_PROOF",
    ],
  };
}
if (process.argv[1] && fileURLToPath(import.meta.url) ===
    fileURLToPath(new URL("file://" + process.argv[1], import.meta.url))) {
  const result = inspectV3TestnetReadiness(readFileSync(contractPath, "utf8"));
  console.log(JSON.stringify(result, null, 2));
  if (!result.testnetDeploymentApproved) process.exitCode = 1;
}
