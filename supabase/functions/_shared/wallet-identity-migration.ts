import { normalizeTonAddress } from "./ton-address.ts";

/**
 * Read-only preparation for the legacy wallet identity backfill.
 *
 * This module intentionally does not write to Supabase. A canonical address
 * shared by multiple legacy auth users is reported as a conflict and must be
 * resolved manually; it is never silently assigned to one user.
 */
export type LegacyWalletRecord = {
  userId: string;
  walletAddress: string;
  network: string;
};

export type WalletIdentityCandidate = {
  network: "-239";
  rawAddress: string;
  userIds: string[];
  sourceRows: number;
  status: "ready" | "conflict";
};

export type WalletIdentityRejection = {
  userId: string;
  walletAddress: string;
  reason: "missing_user_id" | "unsupported_network" | "invalid_address";
};

export type WalletIdentityAudit = {
  candidates: WalletIdentityCandidate[];
  rejected: WalletIdentityRejection[];
};

export function auditLegacyWalletRecords(
  records: readonly LegacyWalletRecord[],
): WalletIdentityAudit {
  const groups = new Map<string, {
    rawAddress: string;
    userIds: Set<string>;
    sourceRows: number;
  }>();
  const rejected: WalletIdentityRejection[] = [];

  for (const record of records) {
    const userId = typeof record.userId === "string"
      ? record.userId.trim()
      : "";
    const walletAddress = typeof record.walletAddress === "string"
      ? record.walletAddress.trim()
      : "";

    if (!userId) {
      rejected.push({
        userId,
        walletAddress,
        reason: "missing_user_id",
      });
      continue;
    }

    if (record.network !== "-239") {
      rejected.push({
        userId,
        walletAddress,
        reason: "unsupported_network",
      });
      continue;
    }

    let rawAddress: string;
    try {
      rawAddress = normalizeTonAddress(walletAddress);
    } catch {
      rejected.push({
        userId,
        walletAddress,
        reason: "invalid_address",
      });
      continue;
    }

    const key = `-239:${rawAddress}`;
    const existing = groups.get(key);
    if (existing) {
      existing.userIds.add(userId);
      existing.sourceRows += 1;
    } else {
      groups.set(key, {
        rawAddress,
        userIds: new Set([userId]),
        sourceRows: 1,
      });
    }
  }

  const candidates = [...groups.values()]
    .map((group): WalletIdentityCandidate => {
      const userIds = [...group.userIds].sort();
      return {
        network: "-239",
        rawAddress: group.rawAddress,
        userIds,
        sourceRows: group.sourceRows,
        status: userIds.length === 1 ? "ready" : "conflict",
      };
    })
    .sort((a, b) => a.rawAddress.localeCompare(b.rawAddress));

  rejected.sort((a, b) =>
    a.reason.localeCompare(b.reason) ||
    a.userId.localeCompare(b.userId) ||
    a.walletAddress.localeCompare(b.walletAddress)
  );

  return { candidates, rejected };
}
