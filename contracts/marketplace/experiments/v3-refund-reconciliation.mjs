// Offline V3 reconciliation guard. This does NOT fetch or authenticate TON data.
// The caller must independently verify all records against finalized chain data.
// Never authorize an on-chain retry from this helper alone.
const nonempty = (x) => typeof x === "string" && x.length > 0;
const same = (a, b) => nonempty(a) && a === b;
const amount = (x) => typeof x === "bigint" && x > 0n;

/**
 * Evidence must be supplied by a trusted, finalized chain indexer.
 * Missing or conflicting evidence always produces UNKNOWN.
 */
export function classifyReserveRefund({ operation, outgoing, recipient, returned }) {
  if (!operation || !outgoing || !amount(operation.amount) ||
      !nonempty(operation.vault) || !nonempty(operation.buyer) ||
      !nonempty(operation.messageHash) || !nonempty(operation.txHash) ||
      !Number.isSafeInteger(operation.queryId) || operation.queryId < 1) {
    return "UNKNOWN";
  }
  if (outgoing.finalized !== true || outgoing.success !== true ||
      !same(outgoing.txHash, operation.txHash) ||
      !same(outgoing.messageHash, operation.messageHash) ||
      !same(outgoing.source, operation.vault) ||
      !same(outgoing.destination, operation.buyer) ||
      outgoing.queryId !== operation.queryId ||
      outgoing.amount !== operation.amount) return "UNKNOWN";

  const credited = recipient?.finalized === true &&
    recipient?.success === true &&
    same(recipient.incomingMessageHash, operation.messageHash) &&
    same(recipient.address, operation.buyer) &&
    recipient.amount === operation.amount;

  const bounced = returned?.finalized === true &&
    returned?.success === true &&
    same(returned.originalMessageHash, operation.messageHash) &&
    same(returned.outgoingTxHash, operation.txHash) &&
    same(returned.destination, operation.vault) &&
    same(returned.source, operation.buyer) &&
    returned.queryId === operation.queryId &&
    typeof returned.amount === "bigint" &&
    returned.amount > 0n &&
    returned.amount <= operation.amount &&
    returned.principalVerified === true;

  // A supplied but unverified counter-claim is a conflict, not proof of absence.
  // Do not mark credited/returned while the competing record remains unresolved.
  if (recipient != null && returned != null) return "UNKNOWN";
  // Contradictory evidence is not resolved by guessing.
  if (credited && bounced) return "UNKNOWN";
  if (credited) return "CREDITED";
  if (bounced) return "RETURNED_CANDIDATE";
  return "UNKNOWN";
}

// RETURNED_CANDIDATE is never permission to retry. It requires separate
// authenticated principal accounting and a single-use authorization record.
export function mayAutoRetryReserveRefund() {
  return false;
}
