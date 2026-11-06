import { Address } from "npm:@ton/core@0.63.1";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { validateBuyProductV2Transaction } from "../_shared/marketplace-v2-buy-message.ts";
import { buildTransactionsByMessageUrl, resolveBuyerWalletRootTransaction } from "../_shared/marketplace-v2-parent-transaction.ts";
import { decodeMarketplaceV2OrderCell } from "../_shared/marketplace-v2-order-cell.ts";
import { buildOrderCellRunGetMethodRequest, extractOrderCellBoc, extractSingleUint64StackValue, parseMarketplaceV2OrderId } from "../_shared/marketplace-v2-order-get-method.ts";
import { findFinalizedMarketplaceBuyInTrace, verifyMarketplaceV2OrderPaymentIdentity } from "../_shared/marketplace-v2-payment-verification.ts";

const ADMIN_UID = "0744f173-3f36-438f-b265-9cb3be95ad78";
const ALLOWED_ORIGINS = new Set(["https://ton-marketplace-cvj.pages.dev", "http://localhost:5173"]);
const API = "https://toncenter.com/api/v3";

function headers(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
}
function reply(data: Record<string, unknown>, status: number, origin: string) {
  return Response.json(data, { status, headers: headers(origin) });
}
async function postToncenter(path: string, body: unknown, apiKey: string) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`TON Center request failed (${response.status})`);
  return await response.json();
}
async function getToncenter(url: URL, apiKey: string) {
  const response = await fetch(url, { headers: { "Accept": "application/json", "X-API-Key": apiKey } });
  if (!response.ok) throw new Error(`TON Center request failed (${response.status})`);
  return await response.json();
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (!ALLOWED_ORIGINS.has(origin)) return new Response("Forbidden", { status: 403 });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(origin) });
  if (req.method !== "POST") return reply({ success: false, error: "Method not allowed" }, 405, origin);

  try {
    const token = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return reply({ success: false, error: "Authentication required" }, 401, origin);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    let publishable = Deno.env.get("SUPABASE_ANON_KEY");
    if (!publishable) {
      try {
        const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
        publishable = typeof keys.default === "string" ? keys.default : undefined;
      } catch { publishable = undefined; }
    }
    const apiKey = Deno.env.get("TONCENTER_API_KEY");
    if (!supabaseUrl || !publishable || !apiKey) return reply({ success: false, error: "Server configuration unavailable" }, 503, origin);

    const auth = createClient(supabaseUrl, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await auth.auth.getUser(token);
    if (error || data.user?.id !== ADMIN_UID || data.user.is_anonymous === true) {
      return reply({ success: false, error: "Administrator access required" }, 403, origin);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) ||
      typeof body.message_hash !== "string" || typeof body.buyer_address !== "string") {
      return reply({ success: false, error: "message_hash and buyer_address are required" }, 400, origin);
    }
    const configured = Deno.env.get("MARKETPLACE_V2_ADDRESS");
    if (!configured) return reply({ success: false, error: "Marketplace V2 address is not configured" }, 503, origin);
    const marketplace = Address.parse(configured).toRawString().toLowerCase();
    const buyer = Address.parse(body.buyer_address).toRawString().toLowerCase();

    const lookupUrl = buildTransactionsByMessageUrl(body.message_hash);
    const lookup = await getToncenter(lookupUrl, apiKey) as Record<string, unknown>;
    if (!Array.isArray(lookup.transactions)) return reply({ success: false, error: "TON Center message lookup returned invalid data" }, 502, origin);
    const rootResolution = resolveBuyerWalletRootTransaction(lookup.transactions, {
      messageHash: body.message_hash, buyerAddress: buyer, marketplaceAddress: marketplace,
    });
    if (rootResolution.status !== "matched") {
      return reply({ success: false, error: "Buyer wallet root transaction is not uniquely verified", resolution: rootResolution }, 409, origin);
    }

    const traceUrl = new URL(`${API}/traces`);
    traceUrl.searchParams.set("tx_hash", rootResolution.buyerWalletRootTransactionHash);
    traceUrl.searchParams.set("limit", "2");
    traceUrl.searchParams.set("include_actions", "true");
    const traceResponse = await getToncenter(traceUrl, apiKey) as Record<string, unknown>;
    if (!Array.isArray(traceResponse.traces) || traceResponse.traces.length !== 1) {
      return reply({ success: false, error: "TON Center did not return exactly one complete buyer payment trace" }, 409, origin);
    }
    const trace = traceResponse.traces[0];
    const match = findFinalizedMarketplaceBuyInTrace(trace, {
      buyerRootTransactionHash: rootResolution.buyerWalletRootTransactionHash,
      inboundMessageHash: body.message_hash,
      buyerAddress: buyer,
      marketplaceAddress: marketplace,
    });
    const marketplaceTx = match.marketplaceTransaction;
    const inMsg = marketplaceTx.in_msg!;
    const payment = validateBuyProductV2Transaction({
      bodyBocBase64: inMsg.message_content!.body as string,
      destination: inMsg.destination as string,
      expectedMarketplaceAddress: marketplace,
      source: inMsg.source as string,
      transactionValueNano: inMsg.value as string,
      transactionHash: match.marketplaceTransactionHash,
      messageHash: match.inboundMessageHash,
      masterchainBlockSeqno: marketplaceTx.mc_block_seqno as number,
      emulated: marketplaceTx.emulated === true,
      aborted: marketplaceTx.description?.aborted !== false,
      computeSuccess: marketplaceTx.description?.compute_ph?.success === true,
      actionSuccess: marketplaceTx.description?.action?.success === true,
    });

    const productId = parseMarketplaceV2OrderId(payment.productId.toString());
    const orderIdResponse = await postToncenter(`${API}/runGetMethod`,
      buildOrderCellRunGetMethodRequest(marketplace, "orderIdForProductV2", productId), apiKey) as Record<string, unknown>;
    const orderId = extractSingleUint64StackValue(orderIdResponse);
    if (orderId === null || orderId === "0") {
      return reply({ success: false, error: "No persisted Marketplace V2 order exists for the paid product" }, 409, origin);
    }
    const cellResponse = await postToncenter(`${API}/runGetMethod`,
      buildOrderCellRunGetMethodRequest(marketplace, "orderCellV2", orderId), apiKey);
    const order = decodeMarketplaceV2OrderCell(extractOrderCellBoc(cellResponse));
    if (order.id !== orderId) return reply({ success: false, error: "Getter returned a mismatched order ID" }, 502, origin);
    verifyMarketplaceV2OrderPaymentIdentity(order, payment);

    return reply({
      success: true,
      network: "mainnet",
      verification: "payment_message_root_trace_and_immutable_order_match",
      buyer_wallet_root_transaction_hash: rootResolution.buyerWalletRootTransactionHash,
      marketplace_transaction_hash: match.marketplaceTransactionHash,
      inbound_message_hash: payment.inboundMessageHash,
      trace_id: match.traceId,
      order,
      persisted: false,
      notice: "Read-only chain verification only. No database writes, signing, refunds, or transactions are performed. This endpoint requires the current Marketplace V2 contract getters to be deployed at the configured address.",
    }, 200, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to verify Marketplace V2 payment";
    return reply({ success: false, error: message }, 400, origin);
  }
});
