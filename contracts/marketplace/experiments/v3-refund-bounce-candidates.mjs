// Read-only quarantine of suspected V3 bounced refund messages.
// TON Center API data cannot independently prove principal returned to vault.
// Never authorize a retry from a bounce candidate.
const raw = (x) => typeof x === "string" && /^(?:-?1|0):[0-9a-fA-F]{64}$/.test(x);
const normalize = (x) => typeof x === "string" ? x.toLowerCase() : "";
const decimal = (x) => typeof x === "string" && /^[0-9]+$/.test(x);

export function findV3RefundBounceCandidates({ vaultResponse, vault, buyer }) {
  if (vaultResponse?.source !== "toncenter-v2-unverified" ||
      vaultResponse?.trusted !== false ||
      normalize(vaultResponse.address) !== normalize(vault) ||
      !raw(vault) || !raw(buyer) || !Array.isArray(vaultResponse.transactions)) {
    throw new TypeError("Invalid vault bounce investigation response");
  }
  const candidates = [];
  for (const tx of vaultResponse.transactions) {
    const msg = tx?.in_msg;
    if (normalize(msg?.destination) !== normalize(vault) ||
        normalize(msg?.source) !== normalize(buyer) ||
        msg?.bounced !== true || !decimal(msg?.value) ||
        BigInt(msg.value) === 0n) continue;
    candidates.push({
      transactionHash: typeof tx?.transaction_id?.hash === "string" ? tx.transaction_id.hash : null,
      transactionLt: decimal(tx?.transaction_id?.lt) ? tx.transaction_id.lt : null,
      amountNano: msg.value,
      messageHash: typeof msg?.hash === "string" ? msg.hash : null,
      // The bounced flag is provider-reported and can never prove principal.
      evidenceStatus: "BOUNCE_CANDIDATE_UNVERIFIED",
      principalVerified: false,
      mayRetry: false,
    });
  }
  return { candidates, proofStatus: "UNVERIFIED", mayRetry: false };
}
