// V3 security review evidence gate. It never authorizes deployment.
// Source presence and self-attestation are insufficient for a security audit.
const required = [
  "independentContractAudit",
  "criticalFindingsResolved",
  "cryptographicReceiptProof",
  "cryptographicReturnProof",
  "finalityVerification",
  "atomicIdempotency",
  "reserveConservation",
  "realTestnetSettlement",
  "emergencyPause",
  "deploymentReproducibility",
];
const allowed = new Set(required);
export function evaluateV3ReleaseEvidence(evidence = {}) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new TypeError("Invalid release evidence");
  }
  const failures = required.filter((key) => {
    const item = evidence[key];
    return !item || item.status !== "verified" ||
      typeof item.artifact !== "string" ||
      !/^sha256:[0-9a-f]{64}$/.test(item.artifact) ||
      item.independent !== true;
  });
  // Even a complete self-reported manifest is not an audited verification.
  // An external trusted verification service must independently authenticate
  // artifact contents, reviewer identity and provenance before release.
  return {
    requiredChecks: required,
    unverifiedChecks: failures,
    manifestComplete: failures.length === 0,
    evidenceAuthenticated: false,
    releaseApproved: false,
    mainnetDeployAllowed: false,
    realFundsAllowed: false,
    retryAllowed: false,
    reasons: [...failures.map((key) => "UNVERIFIED_" + key.toUpperCase()),
      "EVIDENCE_PROVENANCE_NOT_INDEPENDENTLY_AUTHENTICATED"],
    ignoredClaims: Object.keys(evidence).filter((key) => !allowed.has(key)),
  };
}
