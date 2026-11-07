// Read-only getter verification for the production Marketplace/Coordinator/Vault-Verifier topology.
import { pathToFileURL } from "node:url";
import { decodeAddressGetter, V3_TESTNET_OWNER, V3_TESTNET_TREASURY } from "./verify-v3-testnet-bindings.mjs";
import { normalizeV3TestnetAddress, normalizeV3CodeHash } from "./verify-v3-testnet.mjs";

export function decodeV3IntegerGetter(stack) {
  if (!Array.isArray(stack) || stack.length !== 1 || stack[0]?.[0] !== "num") {
    throw new Error("Unexpected numeric getter stack");
  }
  const value = String(stack[0][1]);
  if (/^-0x[0-9a-f]+$/i.test(value)) return -BigInt("0x" + value.slice(3));
  if (/^0x[0-9a-f]+$/i.test(value)) return BigInt(value);
  if (/^-?[0-9]+$/.test(value)) return BigInt(value);
  throw new Error("Invalid numeric getter value");
}

async function runGetter(address, method, fetcher, stack = []) {
  const requestBody = JSON.stringify({ address, method, stack });
  let response;
  for (let attempt = 0; attempt < 5; attempt++) {
    response = await fetcher("https://testnet.toncenter.com/api/v2/runGetMethod", {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.TONCENTER_API_KEY ? { "X-API-Key": process.env.TONCENTER_API_KEY } : {}),
      },
      body: requestBody,
    });
    if (response.ok) break;
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 4) {
      throw new Error("Getter RPC HTTP error for " + method + ": " + response.status);
    }
    await new Promise((resolve) => setTimeout(resolve,
      response.status === 429 ? Math.min(2000 * 2 ** attempt, 16000) : Math.min(1000 * 2 ** attempt, 8000)));
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  const data = await response.json();
  if (data.ok !== true || data.result?.exit_code !== 0) throw new Error("Getter failed: " + method);
  return data.result.stack;
}

export async function verifyV3ProductionBindings(addresses, expectedVaultCodeHash, fetcher = fetch) {
  const normalized = Object.fromEntries(Object.entries(addresses).map(([name, address]) => [
    name, normalizeV3TestnetAddress(address),
  ]));
  const checks = {};
  const addressChecks = [
    ["marketplaceOwner", "marketplace", "ownerV2", V3_TESTNET_OWNER],
    ["marketplaceEscrow", "marketplace", "escrowV2", normalized.escrow],
    ["marketplaceTreasury", "marketplace", "treasuryV2", V3_TESTNET_TREASURY],
    ["marketplaceCoordinator", "marketplace", "marketplaceReserveCoordinatorV3", normalized.coordinator],
    ["escrowMarketplace", "escrow", "marketplace", normalized.marketplace],
    ["escrowOwner", "escrow", "owner", V3_TESTNET_OWNER],
    ["coordinatorMarketplace", "coordinator", "reserveCoordinatorMarketplaceV3", normalized.marketplace],
    ["coordinatorVerifier", "coordinator", "reserveCoordinatorVerifierV3", normalized.verifier],
    ["coordinatorOwner", "coordinator", "reserveCoordinatorOwnerV3", V3_TESTNET_OWNER],
    ["verifierMarketplace", "verifier", "verifierMarketplace", normalized.marketplace],
  ];
  for (const [name, contract, method, expected] of addressChecks) {
    const stack = await runGetter(normalized[contract], method, fetcher);
    const actual = decodeAddressGetter(stack);
    checks[name] = {
      method, contract, actual,
      expected: normalizeV3TestnetAddress(expected),
      matches: actual === normalizeV3TestnetAddress(expected),
    };
  }

  const numericChecks = [
    ["verifierNetwork", "verifier", "verifierNetwork", -3n],
    ["verifierEpoch", "verifier", "verifierEpoch", 1n],
    ["verifierThreshold", "verifier", "verifierThreshold", 2n],
  ];
  for (const [name, contract, method, expected] of numericChecks) {
    const actual = decodeV3IntegerGetter(await runGetter(normalized[contract], method, fetcher));
    checks[name] = { method, contract, actual: actual.toString(), expected: expected.toString(), matches: actual === expected };
  }

  const actualVaultHash = decodeV3IntegerGetter(
    await runGetter(normalized.coordinator, "reserveCoordinatorVaultCodeHashV3", fetcher),
  );
  const expectedHash = BigInt("0x" + normalizeV3CodeHash(expectedVaultCodeHash));
  checks.coordinatorVaultCodeHash = {
    method: "reserveCoordinatorVaultCodeHashV3",
    contract: "coordinator",
    actual: normalizeV3CodeHash(actualVaultHash.toString()),
    expected: normalizeV3CodeHash(expectedHash.toString()),
    matches: actualVaultHash === expectedHash,
  };

  const validatorKeys = [];
  for (let index = 0; index < 3; index++) {
    const value = decodeV3IntegerGetter(
      await runGetter(normalized.verifier, "verifierValidatorKey", fetcher, [["num", "0x" + index.toString(16)]]),
    );
    validatorKeys.push(value);
  }
  checks.validatorSet = {
    method: "verifierValidatorKey",
    contract: "verifier",
    actual: validatorKeys.map((key) => key.toString()),
    matches: validatorKeys.every((key) => key > 0n) && new Set(validatorKeys.map(String)).size === 3,
  };

  return {
    network: "testnet",
    bindingsVerified: Object.values(checks).every((check) => check.matches),
    checks,
    noTransactionSent: true,
    codeHashesVerified: false,
    settlementVerified: false,
    mainnetApproved: false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const addresses = {
      marketplace: process.env.V3_PRODUCTION_TESTNET_MARKETPLACE_ADDRESS,
      escrow: process.env.V3_PRODUCTION_TESTNET_ESCROW_ADDRESS,
      coordinator: process.env.V3_PRODUCTION_TESTNET_COORDINATOR_ADDRESS,
      verifier: process.env.V3_PRODUCTION_TESTNET_VERIFIER_ADDRESS,
    };
    const report = await verifyV3ProductionBindings(
      addresses,
      process.env.V3_PRODUCTION_EXPECTED_VAULT_CODE_HASH,
    );
    console.log(JSON.stringify(report, null, 2));
    if (!report.bindingsVerified) process.exitCode = 1;
  } catch (error) {
    console.error("Production V3 Testnet binding verification blocked: " + error.message);
    process.exitCode = 1;
  }
}
