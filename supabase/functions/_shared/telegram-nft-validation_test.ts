import { assertEquals } from "jsr:@std/assert";
import { Address } from "@ton/core";
import {
  buildAllowedCollections,
  hasTeleitemInterface,
  isVerifiedMetadata,
  isWalletOwner,
  type AddressBookEntry,
  type AddressMetadata,
  type AllowlistRow,
} from "./telegram-nft-validation.ts";

const itemAddress = Address.parse("0:6BE366AE463F1729F81C6BD5C30D457E5C01873A9C50F2C6F22B41E7D0FEA84D").toRawString();

const collectionAddress = Address.parse("0:0E41DC1DC3C9067ED24248580E12B3359818D83DEE0304FABCF80845EAFAFDB2").toRawString();

const validItemMetadata: AddressMetadata = {
  is_indexed: true,
  token_info: [{
    type: "nft_items",
    valid: true,
    is_scam: false,
    is_nsfw: false,
    name: "+888 0768 4929",
  }],
};

Deno.test("通过有效的 Telegram +888 NFT 元数据验证", () => {
  assertEquals(isVerifiedMetadata(validItemMetadata, "nft_items"), true);
});

Deno.test("拒绝未索引的 NFT 元数据", () => {
  assertEquals(
    isVerifiedMetadata(
      { ...validItemMetadata, is_indexed: false },
      "nft_items",
    ),
    false,
  );
});

Deno.test("拒绝错误的 NFT 类型", () => {
  assertEquals(
    isVerifiedMetadata(
      {
        ...validItemMetadata,
        token_info: [{ ...validItemMetadata.token_info![0], type: "nft_collections" }],
      },
      "nft_items",
    ),
    false,
  );
});

Deno.test("拒绝无效、可疑或 NSFW 元数据", () => {
  for (const patch of [
    { valid: false },
    { is_scam: true },
    { is_nsfw: true },
  ]) {
    assertEquals(
      isVerifiedMetadata(
        {
          ...validItemMetadata,
          token_info: [{ ...validItemMetadata.token_info![0], ...patch }],
        },
        "nft_items",
      ),
      false,
    );
  }
});

Deno.test("必须具有 teleitem 接口才能识别为 +888", () => {
  const addressBook: Record<string, AddressBookEntry> = {
    [itemAddress]: { interfaces: ["nft_item", "teleitem"] },
  };

  assertEquals(hasTeleitemInterface(addressBook, itemAddress), true);
  assertEquals(hasTeleitemInterface({}, itemAddress), false);
  assertEquals(
    hasTeleitemInterface(
      { [itemAddress]: { interfaces: ["nft_item"] } },
      itemAddress,
    ),
    false,
  );
});

Deno.test("钱包所有者地址必须匹配", () => {
  const friendlyAddress = Address.parse(itemAddress).toString();

  assertEquals(isWalletOwner(itemAddress, friendlyAddress), true);
  assertEquals(isWalletOwner(itemAddress, collectionAddress), false);
  assertEquals(isWalletOwner("invalid-address", itemAddress), false);
});

Deno.test("白名单只允许启用的 TON 主网集合", () => {
  const rows: AllowlistRow[] = [
    {
      asset_type: "phone_number",
      collection_address: collectionAddress,
      network: "-239",
      enabled: true,
    },
    {
      asset_type: "phone_number",
      collection_address: itemAddress,
      network: "-239",
      enabled: false,
    },
    {
      asset_type: "gift",
      collection_address: itemAddress,
      network: "-3",
      enabled: true,
    },
  ];

  const allowed = buildAllowedCollections(rows);

  assertEquals(allowed.size, 1);
  assertEquals(allowed.get(collectionAddress), "phone_number");
  assertEquals(allowed.has(itemAddress), false);
});

Deno.test("拒绝错误的集合元数据类型", () => {
  assertEquals(
    isVerifiedMetadata(
      {
        is_indexed: true,
        token_info: [{
          type: "nft_items",
          valid: true,
          is_scam: false,
          is_nsfw: false,
        }],
      },
      "nft_collections",
    ),
    false,
  );
});

