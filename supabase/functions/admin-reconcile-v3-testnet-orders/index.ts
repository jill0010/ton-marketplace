import { Address } from "npm:@ton/core@0.63.1";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { reconcileV3TestnetPurchaseObservation } from "../_shared/marketplace-v3-testnet-payment-reconciliation.ts";
import { extractV3TestnetGetterStack } from "../_shared/marketplace-v3-testnet-getter.ts";

const ADMIN_UID = "0744f173-3f36-438f-b265-9cb3be95ad78";
const ORIGINS = new Set(["https://ton-marketplace-cvj.pages.dev", "http://localhost:5173"]);
function response(origin: string, status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization,apikey,x-client-info,content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Cache-Control": "no-store", "Vary": "Origin",
  } });
}
function chainNumber(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Missing chain getter value");
  const x = value as Record<string, unknown>;
  if (x.type !== "num" || typeof x.value !== "string" ||
      !(/^(0|[1-9][0-9]*)$/.test(x.value) || /^0x[0-9a-f]+$/i.test(x.value))) {
    throw Error("Invalid chain getter number");
  }
  return BigInt(x.value).toString(10);
}

/**
 * S06-P003 admin-only, TESTNET-only, one existing order per invocation.
 * No transaction signing, dispatch, order creation or finalization.
 * DB rows are only candidate bindings: independently verify product/order
 * binding and status on chain before storing unfinalized observations.
 */
Deno.serve(async req => {
  const origin = req.headers.get("origin") ?? "";
  if (!ORIGINS.has(origin)) return new Response("Forbidden", { status: 403 });
  if (req.method === "OPTIONS") return response(origin, 204, {});
  if (req.method !== "POST") return response(origin, 405, { success: false });
  try {
    const token = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return response(origin, 401, { success: false, error: "Authentication required" });
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const key = Deno.env.get("TONCENTER_TESTNET_API_KEY");
    const configured = Deno.env.get("V3_PRODUCTION_TESTNET_MARKETPLACE_ADDRESS");
    if (!url || !anon || !service || !key || !configured) {
      return response(origin, 503, { success: false, error: "Testnet indexer is not configured" });
    }
    const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: who, error: authError } = await auth.auth.getUser(token);
    if (authError || who.user?.id !== ADMIN_UID || who.user.is_anonymous) {
      return response(origin, 403, { success: false, error: "Administrator required" });
    }
    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).length !== 1 || typeof (body as Record<string, unknown>).order_id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test((body as { order_id: string }).order_id)) {
      return response(origin, 400, { success: false, error: "Existing order UUID required" });
    }
    const marketplace = Address.parse(configured).toRawString().toLowerCase();
    if (!marketplace.startsWith("0:")) throw Error("Invalid Testnet marketplace workchain");
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: order, error: dbError } = await admin.from("marketplace_v3_testnet_orders")
      .select("id,network_global_id,marketplace_raw,chain_order_id,chain_product_id,payment_query_id,buyer_wallet_raw,price_nano,reserve_nano,payment_state,payment_tx_hash")
      .eq("id", (body as { order_id: string }).order_id).maybeSingle();
    if (dbError) throw Error("Unable to read Testnet order projection");
    if (!order || order.network_global_id !== -3 || order.marketplace_raw !== marketplace) {
      return response(origin, 404, { success: false, error: "Matching Testnet order not found" });
    }
    if (order.payment_state === "finalized" || order.payment_tx_hash) {
      return response(origin, 409, { success: false, error: "Existing payment evidence must be reviewed; no replay" });
    }
    const headers = { "Accept": "application/json", "X-API-Key": key };
    async function getter(method: string): Promise<string> {
      const rpc = await fetch("https://testnet.toncenter.com/api/v3/runGetMethod", {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          address: marketplace, method,
          stack: [{ type: "num", value: String(order.chain_product_id) }],
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!rpc.ok) throw Error("Testnet chain getter unavailable");
      const payload: unknown = await rpc.json();
      const stack = extractV3TestnetGetterStack(payload as Record<string, unknown>, 8);
      if (stack.length !== 1) throw Error("Unexpected chain getter stack");
      return chainNumber(stack[0]);
    }
    const [orderId, status] = await Promise.all([
      getter("orderIdForProductV2"), getter("productStatusV2"),
    ]);
    const txUrl = new URL("https://testnet.toncenter.com/api/v3/transactions");
    txUrl.searchParams.set("account", marketplace);
    txUrl.searchParams.set("limit", "100");
    txUrl.searchParams.set("sort", "desc");
    const txResponse = await fetch(txUrl, { headers, signal: AbortSignal.timeout(10000) });
    if (!txResponse.ok) throw Error("Testnet transactions unavailable");
    const page: unknown = await txResponse.json();
    if (!page || typeof page !== "object" || !Array.isArray((page as { transactions?: unknown }).transactions)) {
      throw Error("Invalid Testnet transaction page");
    }
    const evidence = reconcileV3TestnetPurchaseObservation(
      (page as { transactions: unknown[] }).transactions,
      {
        network: "-3", marketplaceRaw: marketplace,
        orderId: String(order.chain_order_id), productId: String(order.chain_product_id),
        paymentQueryId: String(order.payment_query_id), buyerRaw: String(order.buyer_wallet_raw),
        priceNano: String(order.price_nano), reserveNano: String(order.reserve_nano) as "200000000",
        onChainOrderIdForProduct: orderId, onChainProductStatus: status,
      },
    );
    if (!evidence) {
      return response(origin, 200, { success: true, found: false, persisted: false,
        note: "No matching payment in recent Testnet page; no state changes." });
    }
    const { error: insertError } = await admin.from("marketplace_v3_testnet_receipts").insert({
      order_id: order.id, evidence_kind: "payment_inbound",
      account_raw: marketplace, tx_hash: evidence.paymentTxHash,
      message_hash: evidence.inboundMessageHash, lt: evidence.transactionLt,
      query_id: evidence.paymentQueryId,
      amount_nano: (BigInt(evidence.priceNano) + 200000000n).toString(),
      tx_success: true, recipient_finalized: false, block_seqno: evidence.blockSeqno,
    });
    if (insertError && insertError.code !== "23505") throw Error("Could not persist Testnet receipt");
    // Never advance payment_state automatically. A separate independent
    // buyer root/finality verifier must decide observed -> finalized.
    return response(origin, 200, { success: true, found: true, persisted: !insertError,
      state: "observed_unfinalized", transaction_hash: evidence.paymentTxHash,
      note: "Read-only chain evidence only. Payment, NFT delivery, payout and reserve are NOT finalized." });
  } catch {
    return response(origin, 502, { success: false, error: "Testnet reconciliation unavailable or evidence inconsistent" });
  }
});
