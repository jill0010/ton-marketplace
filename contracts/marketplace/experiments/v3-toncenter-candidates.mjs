// Offline extraction of TON Center v2 transaction linkage.
// Raw provider records are NOT finalized proof and cannot authorize a refund.
const raw = (value) => typeof value === "string" && /^(?:-?1|0):[0-9a-fA-F]{64}$/.test(value);
const integer = (value) => typeof value === "string" && /^[0-9]+$/.test(value);
const positive = (value) => integer(value) && BigInt(value) > 0n;
const hash = (value) => typeof value === "string" && value.length > 0;

export function extractReserveTransactionCandidates(result, { vault, buyer } = {}) {
  if (!result || result.trusted !== false ||
      result.source !== "toncenter-v2-unverified" ||
      !Array.isArray(result.transactions) || !raw(vault) || !raw(buyer) ||
      result.address?.toLowerCase() !== vault.toLowerCase()) {
    throw new TypeError("Invalid untrusted TON Center response or expected addresses");
  }
  return result.transactions.map((tx) => {
    const id = tx?.transaction_id;
    const out = Array.isArray(tx?.out_msgs) ? tx.out_msgs : [];
    const candidates = out.filter((message) =>
      message?.source?.toLowerCase() === vault.toLowerCase() &&
      message?.destination?.toLowerCase() === buyer.toLowerCase() &&
      positive(message?.value)
    ).map((message) => ({
      source: message.source,
      destination: message.destination,
      valueNano: message.value,
      bodyHash: null,
      messageHash: null,
      queryId: null,
      verified: false,
    }));
    return {
      transactionLt: integer(id?.lt) ? id.lt : null,
      transactionHash: hash(id?.hash) ? id.hash : null,
      outgoingCandidates: candidates,
      verified: false,
      finalized: false,
    };
  });
}
