import { normalizeTonAddress } from "./ton-address.ts";

export type AssetType = "username" | "phone_number" | "gift";

export type AllowlistRow = {
  asset_type: AssetType;
  collection_address: string;
  network: string;
  enabled: boolean;
};

export type TokenInfo = {
  type?: string;
  description?: string;
  image?: string;
  is_nsfw?: boolean;
  is_scam?: boolean;
  name?: string;
  valid?: boolean;
};

export type AddressMetadata = {
  is_indexed?: boolean;
  token_info?: TokenInfo[];
};

export type AddressBookEntry = {
  interfaces?: string[];
};

export function getAddressMetadata(
  metadata: Record<string, AddressMetadata>,
  address: string,
): AddressMetadata | undefined {
  for (const [key, value] of Object.entries(metadata)) {
    try {
      if (normalizeTonAddress(key) === address) return value;
    } catch {
      continue;
    }
  }

  return undefined;
}

export function getAddressEntry(
  addressBook: Record<string, AddressBookEntry>,
  address: string,
): AddressBookEntry | undefined {
  for (const [key, value] of Object.entries(addressBook)) {
    try {
      if (normalizeTonAddress(key) === address) return value;
    } catch {
      continue;
    }
  }

  return undefined;
}

export function isVerifiedMetadata(
  metadata: AddressMetadata | undefined,
  expectedType: "nft_items" | "nft_collections",
): boolean {
  if (!metadata || metadata.is_indexed !== true) return false;

  const info = metadata.token_info?.[0];

  return Boolean(
    info &&
      info.type === expectedType &&
      info.valid === true &&
      info.is_scam === false &&
      info.is_nsfw === false,
  );
}

export function hasTeleitemInterface(
  addressBook: Record<string, AddressBookEntry>,
  address: string,
): boolean {
  return getAddressEntry(addressBook, address)?.interfaces?.includes(
    "teleitem",
  ) === true;
}

export function isWalletOwner(
  ownerAddress: string,
  walletAddress: string,
): boolean {
  try {
    return normalizeTonAddress(ownerAddress) ===
      normalizeTonAddress(walletAddress);
  } catch {
    return false;
  }
}

export function buildAllowedCollections(
  rows: readonly AllowlistRow[],
): Map<string, AssetType> {
  const allowed = new Map<string, AssetType>();

  for (const row of rows) {
    if (row.network !== "-239" || row.enabled !== true) continue;

    try {
      allowed.set(
        normalizeTonAddress(row.collection_address),
        row.asset_type,
      );
    } catch {
      continue;
    }
  }

  return allowed;
}
