// Conservative structural screening only. A trusted TON indexer or independent
// transaction proof verifier MUST establish authenticity before these flags are true.
// Never use this module to sign, send, or authorize refunds.
const HASH = /^[0-9a-f]{64}$/i;
const RAW_ADDRESS = /^-?\d+:[0-9a-f]{64}$/i;
export function validateRefundChainRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new TypeError("Chain record must be an object");
  }
  const required = ["orderId", "operationId", "transactionId", "accountAddress", "counterpartyAddress"];
  if (required.some(key => typeof record[key] !== "string" || !record[key].trim())) {
    return { valid: false, reason: "MISSING_IDENTIFIERS", verified: false };
  }
  if (!HASH.test(record.transactionId) || !RAW_ADDRESS.test(record.accountAddress) ||
      !RAW_ADDRESS.test(record.counterpartyAddress)) {
    return { valid: false, reason: "INVALID_CHAIN_IDENTIFIERS", verified: false };
  }
  if (typeof record.amountNano !== "string" || !/^[1-9]\d*$/.test(record.amountNano)) {
    return { valid: false, reason: "INVALID_AMOUNT", verified: false };
  }
  if (typeof record.logicalTime !== "string" || !/^[1-9]\d*$/.test(record.logicalTime)) {
    return { valid: false, reason: "INVALID_LOGICAL_TIME", verified: false };
  }
  // A structurally plausible transaction is NOT authenticated evidence.
  return { valid: true, reason: "STRUCTURE_ONLY_NOT_VERIFIED", verified: false };
}
