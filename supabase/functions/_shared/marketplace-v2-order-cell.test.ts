import { Address, beginCell } from "npm:@ton/core@0.63.1";
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
  if (order.id !== "9") throw new Error("Wrong order ID");
  if (order.productId !== "77") throw new Error("Wrong product ID");
  if (order.status !== 6) throw new Error("Wrong order status");
  if (order.deliveryStatus !== 3) throw new Error("Wrong delivery status");
  if (order.buyer !== buyer.toRawString().toLowerCase()) throw new Error("Wrong buyer");
  if (order.seller !== seller.toRawString().toLowerCase()) throw new Error("Wrong seller");
  if (order.treasury !== treasury.toRawString().toLowerCase()) throw new Error("Wrong treasury");
  if (order.nftItem !== item.toRawString().toLowerCase()) throw new Error("Wrong NFT item");
  if (order.collection !== collection.toRawString().toLowerCase()) throw new Error("Wrong collection");
  if (order.itemIndex !== "123456") throw new Error("Wrong item index");
  if (order.escrowId !== "77") throw new Error("Wrong escrow ID");
  if (order.grossNano !== "1000000000") throw new Error("Wrong gross");
  if (order.platformFeeNano !== "100000000") throw new Error("Wrong platform fee");
  if (order.sellerProceedsNano !== "900000000") throw new Error("Wrong seller proceeds");
  if (order.processingReserveNano !== "200000000") throw new Error("Wrong processing reserve");
  if (order.buyerRefundQueryId !== "17") throw new Error("Wrong refund query ID");
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
  let rejected = false;
  try { decodeMarketplaceV2OrderCell(root.toBoc().toString("base64")); } catch { rejected = true; }
  if (!rejected) throw new Error("Non-reconciling settlement must be rejected");
});
