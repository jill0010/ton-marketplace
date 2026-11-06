import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  findFinalizedMarketplaceBuyInTrace,
  verifyMarketplaceV2OrderPaymentIdentity,
} from "./marketplace-v2-payment-verification.ts";

const buyer = "0:" + "1".repeat(64);
const marketplace = "0:" + "2".repeat(64);
const rootHash = "a".repeat(64);
const marketTxHash = "b".repeat(64);
const msgHash = "c".repeat(64);

function trace(overrides: Record<string, unknown> = {}) {
  return {
    trace_id: "trace-1",
    mc_seqno_end: "12345",
    is_incomplete: false,
    trace_info: { pending_messages: 0 },
    transactions: {
      [rootHash]: {
        hash: rootHash, account: buyer, emulated: false,
        description: { aborted: false, compute_ph: { success: true }, action: { success: true } },
      },
      [marketTxHash]: {
        hash: marketTxHash, account: marketplace, emulated: false,
        description: { aborted: false, compute_ph: { success: true }, action: { success: true } },
        in_msg: {
          hash: msgHash, source: buyer, destination: marketplace, value: "1200000000",
          message_content: { body: "body-boc" },
        },
      },
    },
    ...overrides,
  };
}

Deno.test("finds the unique finalized Marketplace buy transaction in a complete trace", () => {
  const result = findFinalizedMarketplaceBuyInTrace(trace(), {
    buyerRootTransactionHash: rootHash,
    inboundMessageHash: msgHash,
    buyerAddress: buyer,
    marketplaceAddress: marketplace,
  });
  assertEquals(result.traceId, "trace-1");
  assertEquals(result.marketplaceTransactionHash, marketTxHash);
  assertEquals(result.marketplaceTransaction.in_msg?.value, "1200000000");
});

Deno.test("rejects incomplete traces, missing root linkage, and duplicate Marketplace matches", () => {
  const input = {
    buyerRootTransactionHash: rootHash,
    inboundMessageHash: msgHash,
    buyerAddress: buyer,
    marketplaceAddress: marketplace,
  };
  assertThrows(() => findFinalizedMarketplaceBuyInTrace(trace({ is_incomplete: true }), input));
  assertThrows(() => findFinalizedMarketplaceBuyInTrace(trace({ mc_seqno_end: "0" }), input));
  assertThrows(() => findFinalizedMarketplaceBuyInTrace(trace({ trace_info: { pending_messages: 1 } }), input));
  assertThrows(() => findFinalizedMarketplaceBuyInTrace(trace({ trace_info: {} }), input));
  assertThrows(() => findFinalizedMarketplaceBuyInTrace(trace({ transactions: {} }), input));

  const duplicateRoot = trace();
  (duplicateRoot.transactions as Record<string, unknown>)["e".repeat(64)] = {
    ...(duplicateRoot.transactions as Record<string, Record<string, unknown>>)[rootHash],
    hash: rootHash,
  };
  assertThrows(() => findFinalizedMarketplaceBuyInTrace(duplicateRoot, input));

  const duplicate = trace();
  (duplicate.transactions as Record<string, unknown>)["d".repeat(64)] = {
    ...(duplicate.transactions as Record<string, Record<string, unknown>>)[marketTxHash],
    hash: "d".repeat(64),
  };
  assertThrows(() => findFinalizedMarketplaceBuyInTrace(duplicate, input));
});

Deno.test("rejects mismatched trace map keys and normalized duplicate transaction hashes", () => {
  const input = {
    buyerRootTransactionHash: rootHash,
    inboundMessageHash: msgHash,
    buyerAddress: buyer,
    marketplaceAddress: marketplace,
  };

  const wrongKey = trace();
  (wrongKey.transactions as Record<string, unknown>)["e".repeat(64)] = {
    ...(wrongKey.transactions as Record<string, Record<string, unknown>>)[rootHash],
    hash: "f".repeat(64),
  };
  assertThrows(() => findFinalizedMarketplaceBuyInTrace(wrongKey, input));

  const duplicateAlias = trace();
  const rootBytes = new Uint8Array(32).fill(0xaa);
  const rootBase64 = btoa(String.fromCharCode(...rootBytes));
  (duplicateAlias.transactions as Record<string, unknown>)[rootBase64] = {
    ...(duplicateAlias.transactions as Record<string, Record<string, unknown>>)[rootHash],
    hash: rootBase64,
  };
  assertThrows(() => findFinalizedMarketplaceBuyInTrace(duplicateAlias, input));

  const invalid = trace();
  (invalid.transactions as Record<string, unknown>)["e".repeat(64)] = null;
  assertThrows(() => findFinalizedMarketplaceBuyInTrace(invalid, input));
});

Deno.test("cross-checks immutable order identity and the 0.2 TON reserve", () => {
  const order = {
    productId: "7", buyer, grossNano: "1000000000",
    processingReserveNano: "200000000", paymentQueryId: "99",
  } as Parameters<typeof verifyMarketplaceV2OrderPaymentIdentity>[0];
  const payment = {
    productId: 7n, expectedPriceNano: 1000000000n, queryId: 99n,
    deadline: 1, reserveNano: 200000000n, totalPaymentNano: 1200000000n,
    buyerRaw: buyer,
  };
  verifyMarketplaceV2OrderPaymentIdentity(order, payment);
  assertThrows(() => verifyMarketplaceV2OrderPaymentIdentity({ ...order, buyer: marketplace }, payment));
  assertThrows(() => verifyMarketplaceV2OrderPaymentIdentity({ ...order, processingReserveNano: "1" }, payment));
});

Deno.test("normalizes base64 message and root hashes before exact trace matching", () => {
  const rootBytes = new Uint8Array(32).fill(0xaa);
  const messageBytes = new Uint8Array(32).fill(0xcc);
  const rootBase64 = btoa(String.fromCharCode(...rootBytes));
  const messageBase64 = btoa(String.fromCharCode(...messageBytes));
  const rootHex = "aa".repeat(32);
  const messageHex = "cc".repeat(32);
  const txs = trace({
    transactions: {
      [rootHex]: {
        hash: rootHex, account: buyer, emulated: false,
        description: { aborted: false, compute_ph: { success: true }, action: { success: true } },
      },
      [marketTxHash]: {
        hash: marketTxHash, account: marketplace, emulated: false,
        description: { aborted: false, compute_ph: { success: true }, action: { success: true } },
        in_msg: {
          hash: messageHex, source: buyer, destination: marketplace, value: "1200000000",
          message_content: { body: "body-boc" },
        },
      },
    },
  });
  const result = findFinalizedMarketplaceBuyInTrace(txs, {
    buyerRootTransactionHash: rootBase64,
    inboundMessageHash: messageBase64,
    buyerAddress: buyer,
    marketplaceAddress: marketplace,
  });
  assertEquals(result.marketplaceTransactionHash, marketTxHash);
  assertEquals(result.inboundMessageHash, messageHex);
});

Deno.test("rejects a failed Marketplace transaction even when the wallet root is valid", () => {
  const failed = trace();
  (failed.transactions as Record<string, Record<string, unknown>>)[marketTxHash].description = {
    aborted: true,
    compute_ph: { success: false },
    action: { success: false },
  };
  assertThrows(() => findFinalizedMarketplaceBuyInTrace(failed, {
    buyerRootTransactionHash: rootHash,
    inboundMessageHash: msgHash,
    buyerAddress: buyer,
    marketplaceAddress: marketplace,
  }));
});
