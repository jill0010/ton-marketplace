import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import { build } from "vite";

const virtualEntry = "virtual:v3-preflight-test";
const virtualResolved = "\0" + virtualEntry;
let bundled = "";

await build({
  configFile: false,
  logLevel: "silent",
  plugins: [{
    name: "v3-preflight-test-entry",
    resolveId(id) { return id === virtualEntry ? virtualResolved : null; },
    load(id) {
      return id === virtualResolved
        ? 'export { preflightMarketplaceV3TestnetPurchase } from ' + JSON.stringify(resolve("src/lib/marketplaceV3Preflight.ts")) + ';'
        : null;
    },
  }],
  build: {
    lib: { entry: virtualEntry, formats: ["es"] },
    write: false,
    minify: false,
    rollupOptions: {
      input: virtualEntry,
      output: { format: "es", entryFileNames: "v3-test.js" },
    },
  },
}).then((result) => {
  const outputs = Array.isArray(result) ? result.flatMap((r) => r.output ?? []) : result.output;
  const chunk = outputs.find((item) => item.type === "chunk");
  if (!chunk) throw new Error("V3 test bundle was not generated");
  bundled = chunk.code;
});
const { preflightMarketplaceV3TestnetPurchase } = await import(
  "data:text/javascript;base64," + Buffer.from(bundled).toString("base64")
);
assert.equal(typeof preflightMarketplaceV3TestnetPurchase, "function", "V3 test entry must export the real preflight function");

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
rejected("reject buyer as escrow", (v) => { v.snapshot.escrowAddress = address(6); v.snapshot.nftOwnerAddress = address(6); });
rejected("reject marketplace as escrow", (v) => { v.snapshot.escrowAddress = address(1); v.snapshot.nftOwnerAddress = address(1); });
rejected("reject NFT item as escrow", (v) => { v.snapshot.escrowAddress = address(3); v.snapshot.nftOwnerAddress = address(3); });
rejected("reject marketplace as NFT item", (v) => { v.snapshot.nftItemAddress = address(1); v.expectedNftItemAddress = address(1); });
rejected("reject marketplace as seller", (v) => { v.snapshot.sellerAddress = address(1); });
rejected("reject marketplace as buyer", (v) => { v.snapshot.buyerAddress = address(1); v.connectedBuyerAddress = address(1); });
rejected("reject NFT item as seller", (v) => { v.snapshot.sellerAddress = address(3); });
rejected("reject NFT item as buyer", (v) => { v.snapshot.buyerAddress = address(3); v.connectedBuyerAddress = address(3); });
rejected("reject escrow ID above uint64", (v) => { v.snapshot.escrowId = 1n << 64n; });
rejected("reject zero price", (v) => { v.snapshot.priceNano = 0n; v.expectedPriceNano = 0n; });

rejected("reject zero payment query ID", (v) => { v.queryId = 0n; });
rejected("reject overflowing payment query ID", (v) => { v.queryId = 1n << 64n; });
rejected("reject TON coin amount exceeding VarUInteger 16", (v) => {
  v.snapshot.priceNano = (1n << 120n) - 1n;
  v.expectedPriceNano = v.snapshot.priceNano;
});

rejected("reject negative snapshot timestamp", (v) => { v.snapshot.fetchedAtSeconds = -1; });
rejected("reject unsafe snapshot timestamp", (v) => { v.snapshot.fetchedAtSeconds = Number.MAX_SAFE_INTEGER + 1; });
rejected("reject invalid current timestamp", (v) => { v.nowSeconds = Number.NaN; });
rejected("reject snapshot too far in the future", (v) => { v.snapshot.fetchedAtSeconds = now + 100; });
rejected("reject malformed connected buyer address", (v) => { v.connectedBuyerAddress = "not-a-ton-address"; });
rejected("reject malformed escrow owner address", (v) => { v.snapshot.nftOwnerAddress = "not-a-ton-address"; });
rejected("reject mismatched NFT owner even with active listing", (v) => { v.snapshot.nftOwnerAddress = address(9); });
rejected("reject buyer/marketplace identity collision", (v) => { v.snapshot.buyerAddress = address(1); v.connectedBuyerAddress = address(1); });
rejected("reject seller/NFT identity collision", (v) => { v.snapshot.sellerAddress = address(3); });
rejected("reject missing NFT escrow record", (v) => { v.snapshot.escrowId = 0n; });

const masterchainAddress = (n) => "-1:" + n.toString(16).padStart(64, "0");
rejected("reject masterchain marketplace even when expected matches", (v) => {
  v.snapshot.marketplaceAddress = masterchainAddress(1);
  v.expectedMarketplaceAddress = masterchainAddress(1);
});
rejected("reject masterchain NFT even when expected matches", (v) => {
  v.snapshot.nftItemAddress = masterchainAddress(3);
  v.expectedNftItemAddress = masterchainAddress(3);
});
rejected("reject masterchain buyer even when wallet matches", (v) => {
  v.snapshot.buyerAddress = masterchainAddress(6);
  v.connectedBuyerAddress = masterchainAddress(6);
});
rejected("reject masterchain seller", (v) => { v.snapshot.sellerAddress = masterchainAddress(5); });
rejected("reject masterchain escrow and matching owner", (v) => {
  v.snapshot.escrowAddress = masterchainAddress(4);
  v.snapshot.nftOwnerAddress = masterchainAddress(4);
});

rejected("reject string product ID from untrusted RPC", (v) => { v.snapshot.productId = "2"; });
rejected("reject string price from untrusted RPC", (v) => { v.snapshot.priceNano = "10000000"; });
rejected("reject string escrow ID from untrusted RPC", (v) => { v.snapshot.escrowId = "1"; });
rejected("reject string existing order ID", (v) => { v.snapshot.existingOrderId = "0"; });
rejected("reject string product status", (v) => { v.snapshot.productStatus = "2"; });
rejected("reject truthy string coordinator flag", (v) => { v.snapshot.coordinatorConfigured = "false"; });
rejected("reject truthy string treasury flag", (v) => { v.snapshot.treasuryConfigured = "false"; });
rejected("reject truthy string escrow flag", (v) => { v.snapshot.escrowConfigured = "false"; });
rejected("reject string expected product ID", (v) => { v.expectedProductId = "2"; });
rejected("reject string expected price", (v) => { v.expectedPriceNano = "10000000"; });
rejected("reject string query ID", (v) => { v.queryId = "123456"; });
