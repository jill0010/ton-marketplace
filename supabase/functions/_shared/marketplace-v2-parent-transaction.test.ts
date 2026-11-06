import { Address } from "npm:@ton/core@0.63.1";
import {
  buildTransactionsByMessageUrl,
  resolveBuyerWalletRootTransaction,
} from "./marketplace-v2-parent-transaction.ts";

const buyer = Address.parseRaw("0:" + "1".repeat(64)).toString({ urlSafe: true, bounceable: true });
const marketplace = Address.parseRaw("0:" + "2".repeat(64)).toString({ urlSafe: true, bounceable: true });
const msgHash = "b".repeat(64);
const validTx = () => ({
  account: Address.parse(buyer).toRawString(),
  hash: "a".repeat(64),
  lt: "99887766",
  mc_block_seqno: 7654321,
  emulated: false,
  description: { aborted: false, compute_ph: { success: true }, action: { success: true } },
  out_msgs: [{ hash: msgHash, source: Address.parse(buyer).toRawString(), destination: Address.parse(marketplace).toRawString() }],
});

Deno.test("builds exact transactionsByMessage outbound lookup", () => {
  const url = buildTransactionsByMessageUrl(msgHash);
  if (!url.pathname.endsWith("/transactionsByMessage") ||
      url.searchParams.get("msg_hash") !== msgHash ||
      url.searchParams.get("direction") !== "out" ||
      url.searchParams.get("limit") !== "10") throw new Error("Invalid message lookup URL");
});

Deno.test("resolves only the unique finalized buyer wallet transaction emitting the exact message", () => {
  const result = resolveBuyerWalletRootTransaction([validTx()], {
    messageHash: msgHash, buyerAddress: buyer, marketplaceAddress: marketplace,
  });
  if (result.status !== "matched" || result.buyerWalletRootTransactionHash !== "a".repeat(64)) {
    throw new Error("Exact buyer wallet transaction was not resolved");
  }
});

Deno.test("fails closed for wrong wallet, wrong message, failed transaction and ambiguous results", () => {
  const wrongWallet = { ...validTx(), account: Address.parse(marketplace).toRawString() };
  const wrongMessage = { ...validTx(), out_msgs: [{ ...validTx().out_msgs[0], hash: "c".repeat(64) }] };
  const failed = { ...validTx(), description: { aborted: true, compute_ph: { success: false }, action: { success: false } } };
  const options = { messageHash: msgHash, buyerAddress: buyer, marketplaceAddress: marketplace };
  for (const rows of [[wrongWallet], [wrongMessage], [failed], []]) {
    if (resolveBuyerWalletRootTransaction(rows, options).status !== "unmatched") {
      throw new Error("Unmatched transaction was accepted");
    }
  }
  if (resolveBuyerWalletRootTransaction([validTx(), { ...validTx(), hash: "d".repeat(64) }], options).status !== "ambiguous") {
    throw new Error("Ambiguous transaction results were not rejected");
  }
});
