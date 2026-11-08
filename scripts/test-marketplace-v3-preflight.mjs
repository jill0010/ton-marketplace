import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const { outputFiles } = await build({
  entryPoints: ["src/lib/marketplaceV3Preflight.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  logLevel: "silent",
});
const { preflightMarketplaceV3TestnetPurchase } = await import(
  "data:text/javascript;base64," + Buffer.from(outputFiles[0].contents).toString("base64")
);

const address = (n) => "0:" + n.toString(16).padStart(64, "0");
const now = 1_800_000_000;
const snapshot = () => ({
  chain: "-3",
  marketplaceAddress: address(1),
  productId: 2n,
  nftItemAddress: address(3),
  escrowAddress: address(4),
  sellerAddress: address(5),
  buyerAddress: address(6),
  priceNano: 10_000_000n,
  productStatus: 2,
  existingOrderId: null,
  coordinatorConfigured: true,
  treasuryConfigured: true,
  escrowConfigured: true,
  nftOwnerAddress: address(4),
  escrowId: 1n,
  fetchedAtSeconds: now,
});
const input = () => ({
  snapshot: snapshot(),
  connectedWalletChain: "-3",
  connectedBuyerAddress: address(6),
  expectedMarketplaceAddress: address(1),
  expectedProductId: 2n,
  expectedNftItemAddress: address(3),
  expectedPriceNano: 10_000_000n,
  nowSeconds: now,
  queryId: 123456n,
});
function rejected(name, mutate) {
  test(name, () => {
    const value = input();
    mutate(value);
    assert.throws(() => preflightMarketplaceV3TestnetPurchase(value));
  });
}

test("valid Testnet preflight builds exact 0.21 TON quote without sending", () => {
  const quote = preflightMarketplaceV3TestnetPurchase(input());
  assert.equal(quote.network, "-3");
  assert.equal(quote.productId, 2n);
  assert.equal(quote.priceNano, 10_000_000n);
  assert.equal(quote.reserveNano, 200_000_000n);
  assert.equal(quote.totalNano, 210_000_000n);
  assert.equal(quote.queryId, 123456n);
  assert.equal(quote.deadline, now + 300);
  assert.ok(quote.payload.length > 0);
});
rejected("reject Mainnet wallet", (v) => { v.connectedWalletChain = "-239"; });
rejected("reject Mainnet snapshot", (v) => { v.snapshot.chain = "-239"; });
rejected("reject stale chain state", (v) => { v.snapshot.fetchedAtSeconds = now - 16; });
rejected("reject future chain state", (v) => { v.snapshot.fetchedAtSeconds = now + 6; });
rejected("reject price manipulation", (v) => { v.expectedPriceNano = 1n; });
rejected("reject mismatched listing", (v) => { v.expectedProductId = 3n; });
rejected("reject mismatched NFT", (v) => { v.expectedNftItemAddress = address(7); });
rejected("reject mismatched marketplace", (v) => { v.expectedMarketplaceAddress = address(7); });
rejected("reject mismatched buyer", (v) => { v.connectedBuyerAddress = address(7); });
rejected("reject delisted NFT", (v) => { v.snapshot.productStatus = 3; });
rejected("reject existing order", (v) => { v.snapshot.existingOrderId = 1n; });
rejected("reject missing coordinator", (v) => { v.snapshot.coordinatorConfigured = false; });
rejected("reject missing treasury", (v) => { v.snapshot.treasuryConfigured = false; });
rejected("reject missing escrow configuration", (v) => { v.snapshot.escrowConfigured = false; });
rejected("reject unallocated escrow", (v) => { v.snapshot.escrowId = 0n; });
rejected("reject NFT not held by escrow", (v) => { v.snapshot.nftOwnerAddress = address(8); });
rejected("reject self purchase", (v) => { v.snapshot.sellerAddress = address(6); });
rejected("reject seller as escrow", (v) => { v.snapshot.sellerAddress = address(4); });
rejected("reject zero price", (v) => { v.snapshot.priceNano = 0n; v.expectedPriceNano = 0n; });
