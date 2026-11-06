// V3 refund return evidence gate: untrusted observations only.
// TON bounced transfers return remaining value after fees; a bounce reported
// as emitted is not proof it was credited to the reserve vault.
// No RPC JSON can authorize another refund or be treated as chain inclusion.
const raw = (x) => typeof x === "string" && /^(?:-1|0):[0-9a-fA-F]{64}$/.test(x);
const uint = (x) => typeof x === "string" && /^(0|[1-9][0-9]*)$/.test(x);
const positive = (x) => uint(x) && BigInt(x) > 0n;
const same = (a, b) => typeof a === "string" &&
  typeof b === "string" && a.toLowerCase() === b.toLowerCase();

export function inspectV3ReturnedRefundEvidence({
  network, vault, buyer, orderId, queryId, sentAmountNano,
  failedBuyerTransaction, bouncedMessage, vaultReceiptTransaction,
  externallyCompensated = false,
} = {}) {
  if (network !== "testnet" || !raw(vault) || !raw(buyer) ||
      same(vault, buyer) || !uint(orderId) || !positive(queryId) ||
      !positive(sentAmountNano)) {
    throw new TypeError("Invalid V3 return investigation identity");
  }
  const reasons = [];
  const failed = failedBuyerTransaction;
  if (!failed || !same(failed.account, buyer) ||
      !positive(failed.lt) || !failed.transactionHash ||
      failed.aborted !== true || failed.bouncePhase !== "ok") {
    reasons.push("MISSING_FAILED_BUYER_TRANSACTION_WITH_BOUNCE_OK");
  }
  const msg = bouncedMessage;
  if (!msg || !same(msg.source, buyer) || !same(msg.destination, vault) ||
      msg.bounced !== true || msg.bounceable !== false ||
      !msg.hash || !positive(msg.amountNano) ||
      BigInt(msg.amountNano) > BigInt(sentAmountNano) ||
      msg.orderId !== orderId || msg.queryId !== queryId ||
      msg.originalAmountNano !== sentAmountNano ||
      !same(msg.originatingBuyerTransactionHash, failed?.transactionHash)) {
    reasons.push("MISSING_EXACT_BOUNCE_MESSAGE_LINKAGE");
  }
  const receipt = vaultReceiptTransaction;
  if (!receipt || !same(receipt.account, vault) ||
      !positive(receipt.lt) || !receipt.transactionHash ||
      !same(receipt.inboundMessageHash, msg?.hash) ||
      !same(receipt.source, buyer) ||
      receipt.inboundBounced !== true ||
      receipt.inboundAmountNano !== msg?.amountNano ||
      receipt.aborted !== false) {
    reasons.push("MISSING_SUCCESSFUL_VAULT_RETURN_RECEIPT");
  }
  if (externallyCompensated) reasons.push("EXTERNAL_COMPENSATION_NO_REPAYMENT");
  // No independent proof of inclusion/finality or exact vault balance change.
  reasons.push("MISSING_INDEPENDENT_BLOCK_INCLUSION_FINALITY_AND_BALANCE_PROOF");
  return {
    observedStructureComplete: reasons.length === 1,
    reportedReturnNano: positive(msg?.amountNano) ? msg.amountNano : "0",
    verifiedReturnedToVaultNano: "0",
    reasons,
    proofStatus: "UNVERIFIED",
    mayConfirmBounce: false, mayRetry: false,
    mayReleaseFunds: false, mayDeployMainnet: false,
  };
}
