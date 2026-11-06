import { Address, beginCell } from "npm:@ton/core@0.63.1";
import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { decodeMarketplaceV2OrderCell } from "./marketplace-v2-order-cell.ts";

const buyer = Address.parse("0:".concat("11".repeat(32)));
const seller = Address.parse("0:".concat("22".repeat(32)));
const treasury = Address.parse("0:".concat("33".repeat(32)));
const item = Address.parse("0:".concat("44".repeat(32)));
const collection = Address.parse("0:".concat("55".repeat(32)));

function fixture(): string {
  const parties = beginCell()
    .storeAddress(buyer).storeAddress(seller).storeAddress(treasury).endCell();
  const asset = beginCell()
    .storeAddress(item).storeAddress(collection)
    .storeUint(123456, 256).storeUint(77, 64).endCell();
  const settlement = beginCell()
    .storeCoins(1_000_000_000n).storeUint(250, 16).storeUint(1, 8)
    .storeCoins(100_000_000n).storeCoins(900_000_000n).storeCoins(200_000_000n).endCell();
  const operations = beginCell()
    .storeUint(10, 64).storeUint(11, 64).storeUint(12, 64).storeUint(13, 64)
    .storeUint(14, 64).storeUint(15, 64).storeUint(16, 64).storeUint(17, 64).endCell();
  const extra = beginCell()
    .storeRef(parties).storeRef(asset).storeRef(settlement).storeRef(operations).endCell();
  const root = beginCell()
    .storeUint(9, 64).storeUint(77, 64)
    .storeUint(6, 8).storeUint(3, 8).storeUint(0, 8).storeUint(0, 8).storeUint(2, 8)
    .storeUint(1_800_000_000, 32).storeRef(extra).endCell();
  return root.toBoc().toString("base64");
}

Deno.test("decodes exact MarketplaceV2Order root and nested immutable snapshots", () => {
  const order = decodeMarketplaceV2OrderCell(fixture());
  assertEquals(order.id, "9");
  assertEquals(order.productId, "77");
  assertEquals(order.status, 6);
  assertEquals(order.deliveryStatus, 3);
  assertEquals(order.buyer, buyer.toRawString().toLowerCase());
  assertEquals(order.seller, seller.toRawString().toLowerCase());
  assertEquals(order.treasury, treasury.toRawString().toLowerCase());
  assertEquals(order.nftItem, item.toRawString().toLowerCase());
  assertEquals(order.collection, collection.toRawString().toLowerCase());
  assertEquals(order.itemIndex, "123456");
  assertEquals(order.escrowId, "77");
  assertEquals(order.grossNano, "1000000000");
  assertEquals(order.platformFeeNano, "100000000");
  assertEquals(order.sellerProceedsNano, "900000000");
  assertEquals(order.processingReserveNano, "200000000");
  assertEquals(order.buyerRefundQueryId, "17");
});

Deno.test("rejects an order cell with a non-reconciling settlement snapshot", () => {
  const parties = beginCell()
    .storeAddress(buyer).storeAddress(seller).storeAddress(treasury).endCell();
  const asset = beginCell()
    .storeAddress(item).storeAddress(collection).storeUint(1, 256).storeUint(1, 64).endCell();
  const settlement = beginCell()
    .storeCoins(1_000_000_000n).storeUint(250, 16).storeUint(1, 8)
    .storeCoins(200_000_000n).storeCoins(700_000_000n).storeCoins(200_000_000n).endCell();
  const operations = beginCell().storeUint(1, 64).storeUint(2, 64).storeUint(3, 64)
    .storeUint(4, 64).storeUint(5, 64).storeUint(6, 64).storeUint(7, 64).storeUint(8, 64).endCell();
  const extra = beginCell().storeRef(parties).storeRef(asset).storeRef(settlement).storeRef(operations).endCell();
  const root = beginCell().storeUint(1, 64).storeUint(1, 64)
    .storeUint(1, 8).storeUint(0, 8).storeUint(0, 8).storeUint(0, 8).storeUint(0, 8)
    .storeUint(1, 32).storeRef(extra).endCell();
  assertThrows(() => decodeMarketplaceV2OrderCell(root.toBoc().toString("base64")));
});
