// Read-only preflight for the two explicitly designated V3 testnet wallets.
// Never reads secrets, signs transactions or infers a successful deployment.
import { pathToFileURL } from "node:url";
import { normalizeV3TestnetAddress } from "./verify-v3-testnet.mjs";

export const V3_TESTNET_DEPLOYER = "0QDQEewIr69mGcq6uDIlAtibxW37gm7rJfKWru7o4_hSPbzu";
export const V3_TESTNET_TREASURY = "0QASRB4XGtN81Pwaef6fWnSJyRwwJEvbbPn-ksz0KQI-bFa0";
const REQUIRED_DEPLOY_NANO = 1300000000n; // 0.5 + 0.5 + 0.05 + 0.05 + 0.1 + 0.05 = 1.25 TON; buffer 0.05.

export async function preflightV3TestnetWallets(fetcher = fetch) {
  const deployer = normalizeV3TestnetAddress(V3_TESTNET_DEPLOYER);
  const treasury = normalizeV3TestnetAddress(V3_TESTNET_TREASURY);
  if (deployer === treasury) throw new Error("Deployer and treasury must differ");
  const result = {};
  for (const [role, address] of [["deployer", deployer], ["treasury", treasury]]) {
    const url = new URL("https://testnet.toncenter.com/api/v2/getAddressInformation");
    url.searchParams.set("address", address);
    const response = await fetcher(url.toString(), { method: "GET", redirect: "error" });
    if (!response.ok) throw new Error(`Testnet RPC HTTP error for ${role}: ${response.status}`);
    const data = await response.json();
    if (data.ok !== true || !data.result || typeof data.result !== "object") throw new Error(`Invalid testnet RPC response for ${role}`);
    const { state, balance } = data.result;
    if (typeof balance !== "string" || !/^[0-9]+$/.test(balance)) throw new Error(`Invalid ${role} balance`);
    result[role] = { address, state, balanceNano: balance };
  }
  const deployerFunded = result.deployer.state === "active" && BigInt(result.deployer.balanceNano) >= REQUIRED_DEPLOY_NANO;
  return {
    network: "testnet",
    wallets: result,
    minimumDeployerBalanceNano: REQUIRED_DEPLOY_NANO.toString(),
    deployerFunded,
    preflightPassed: deployerFunded,
    noTransactionSent: true,
    deploymentVerified: false,
    mainnetApproved: false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = await preflightV3TestnetWallets();
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    if (!report.preflightPassed) process.exitCode = 1;
  } catch (error) {
    console.error(`V3 testnet wallet preflight blocked: ${error.message}`);
    process.exitCode = 1;
  }
}
