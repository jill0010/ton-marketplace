import { assertEquals } from "jsr:@std/assert";
import { Address } from "@ton/core";
import {
  auditLegacyWalletRecords,
  type LegacyWalletRecord,
} from "./wallet-identity-migration.ts";

const rawAddress =
  "0:6BE366AE463F1729F81C6BD5C30D457E5C01873A9C50F2C6F22B41E7D0FEA84D";
const friendlyAddress = Address.parse(rawAddress).toString();

Deno.test("friendly and raw address rows resolve to one canonical candidate", () => {
  const records: LegacyWalletRecord[] = [
    { userId: "user-b", walletAddress: friendlyAddress, network: "-239" },
    { userId: "user-b", walletAddress: rawAddress, network: "-239" },
  ];

  const result = auditLegacyWalletRecords(records);
  assertEquals(result.rejected, []);
  assertEquals(result.candidates, [{
    network: "-239",
    rawAddress: rawAddress.toLowerCase(),
    userIds: ["user-b"],
    sourceRows: 2,
    status: "ready",
  }]);
});

Deno.test("same canonical wallet attached to different users is a conflict", () => {
  const result = auditLegacyWalletRecords([
    { userId: "user-b", walletAddress: rawAddress, network: "-239" },
    { userId: "user-a", walletAddress: friendlyAddress, network: "-239" },
  ]);

  assertEquals(result.candidates[0].status, "conflict");
  assertEquals(result.candidates[0].userIds, ["user-a", "user-b"]);
  assertEquals(result.candidates[0].sourceRows, 2);
});

Deno.test("rejects unsupported network, invalid address, and missing user id", () => {
  const result = auditLegacyWalletRecords([
    { userId: "user-a", walletAddress: rawAddress, network: "-3" },
    { userId: "user-b", walletAddress: "not-a-ton-address", network: "-239" },
    { userId: " ", walletAddress: rawAddress, network: "-239" },
  ]);

  assertEquals(result.candidates, []);
  assertEquals(
    result.rejected.map((row) => row.reason).sort(),
    ["invalid_address", "missing_user_id", "unsupported_network"],
  );
});

Deno.test("audit output ordering is deterministic", () => {
  const result = auditLegacyWalletRecords([
    { userId: "z", walletAddress: rawAddress, network: "-239" },
    { userId: "a", walletAddress: friendlyAddress, network: "-239" },
  ]);

  assertEquals(result.candidates[0].userIds, ["a", "z"]);
});
