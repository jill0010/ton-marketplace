import { handleCors, jsonResponse } from "./http.ts";

/**
 * NFT publishing is intentionally disabled until Marketplace V2 is deployed
 * and wallet-to-contract-to-database synchronization is verified end-to-end.
 *
 * The previous implementation marked an NFT as "listed" while the NFT was
 * still owned by the seller wallet. That violates the marketplace's
 * escrow-before-listing invariant and could expose an asset that the
 * marketplace cannot deliver to a buyer.
 *
 * Do not re-enable this endpoint by restoring the previous direct-insert
 * implementation. The replacement must create a Marketplace V2 listing, wait for Escrow query registration, verify the on-chain NFT deposit and seller identity, and only then mirror the listing into products.
 */
Deno.serve((request: Request) => {
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  return jsonResponse({
    success: false,
    code: "MARKETPLACE_V2_NOT_CONFIGURED",
    error:
      "NFT publishing is disabled until Marketplace V2 is deployed and wallet-to-contract-to-database synchronization is verified.",
  }, 503);
});
