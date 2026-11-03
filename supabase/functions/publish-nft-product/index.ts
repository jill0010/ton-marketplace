import { handleCors, jsonResponse } from "../_shared/http.ts";

/**
 * NFT publishing is intentionally disabled until the escrow-first flow is
 * implemented and verified end-to-end.
 *
 * The previous implementation marked an NFT as "listed" while the NFT was
 * still owned by the seller wallet. That violates the marketplace's
 * escrow-before-listing invariant and could expose an asset that the
 * marketplace cannot deliver to a buyer.
 *
 * Do not re-enable this endpoint by restoring the previous direct-insert
 * implementation. The replacement must create an escrow-pending record,
 * verify the on-chain escrow deposit, and only then mark the product listed.
 */
Deno.serve((request: Request) => {
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  return jsonResponse({
    success: false,
    code: "ESCROW_FLOW_NOT_IMPLEMENTED",
    error:
      "NFT publishing is temporarily unavailable. NFT escrow deposit and on-chain confirmation must be implemented before listing.",
  }, 503);
});
