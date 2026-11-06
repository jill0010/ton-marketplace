// Read-only V3 transaction investigation: compose transport and candidate extraction.
// Never turn API output into finalized proof or payment authorization.
import { fetchReserveVaultTransactions } from "./v3-toncenter-readonly.mjs";
import { extractReserveTransactionCandidates } from "./v3-toncenter-candidates.mjs";

export async function inspectReserveRefundTransfers({
  vault,
  buyer,
  apiBase,
  apiKey,
  limit,
  fetchImpl,
}) {
  const response = await fetchReserveVaultTransactions({
    address: vault,
    apiBase,
    apiKey,
    limit,
    fetchImpl,
  });
  const transactions = extractReserveTransactionCandidates(response, { vault, buyer });
  return {
    network: response.network,
    vault,
    buyer,
    transactions,
    proofStatus: "UNVERIFIED",
    mayRetry: false,
  };
}
