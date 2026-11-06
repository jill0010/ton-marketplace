// Offline reserve conservation checker. Values are independent, reviewed
// accounting inputs, NOT inferred from untrusted TON Center observations.
// No transfer, signature, receipt confirmation, or retry authorization.
const decimal = (x) => typeof x === "string" && /^(0|[1-9][0-9]*)$/.test(x);
const read = (input, key) => {
  const value = input?.[key];
  if (!decimal(value)) throw new TypeError("Invalid nonnegative nano amount: " + key);
  return BigInt(value);
};

export function auditV3ReserveConservation(input) {
  const keys = [
    "fundedNano", "vaultRemainingNano", "buyerCreditedNano",
    "returnedToVaultNano", "pendingOutboundNano", "feesNano",
    "externalCompensationNano",
  ];
  const values = Object.fromEntries(keys.map((key) => [key, read(input, key)]));
  const {
    fundedNano, vaultRemainingNano, buyerCreditedNano,
    returnedToVaultNano, pendingOutboundNano, feesNano, externalCompensationNano,
  } = values;
  const reasons = [];
  // A bounced refund may be reflected in vaultRemaining; returnedToVault
  // is a historical event metric and MUST NOT be added to the balance sum.
  if (fundedNano !== vaultRemainingNano + buyerCreditedNano +
      pendingOutboundNano + feesNano) reasons.push("RESERVE_CONSERVATION_MISMATCH");
  if (returnedToVaultNano > fundedNano) reasons.push("RETURN_EXCEEDS_FUNDING");
  if (buyerCreditedNano > fundedNano) reasons.push("BUYER_CREDIT_EXCEEDS_FUNDING");
  if (externalCompensationNano > 0n) reasons.push("EXTERNAL_COMPENSATION_REPAYMENT_BARRIER");
  if (buyerCreditedNano > 0n && returnedToVaultNano > 0n) {
    reasons.push("RECEIPT_AND_RETURN_REQUIRE_INDEPENDENT_RECONCILIATION");
  }
  if (pendingOutboundNano > 0n) reasons.push("OUTBOUND_STILL_PENDING");
  if (input?.evidenceVerified !== true) reasons.push("NO_INDEPENDENT_CHAIN_PROOF");
  // Deliberately informational: no inputs, including a balanced ledger or
  // caller-asserted evidenceVerified, may authorize on-chain action.
  return {
    balanced: !reasons.includes("RESERVE_CONSERVATION_MISMATCH"),
    accountingStatus: reasons.length ? "QUARANTINED" : "ARITHMETIC_ONLY",
    reasons,
    verifiedBuyerCreditNano: "0",
    verifiedReturnedToVaultNano: "0",
    mayRetry: false,
    mayReleaseFunds: false,
    mayConfirmReceipt: false,
    mayConfirmBounce: false,
    proofStatus: "UNVERIFIED",
  };
}
