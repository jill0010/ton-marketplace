const API = "https://testnet.toncenter.com/api/v2/getAddressInformation";
const REQUIRED = {
  deployer: 2_000_000_000n,
  treasury: 1_800_000_000n,
};

export async function checkV3TestnetFunding(addresses, fetcher = fetch, apiKey = "") {
  const balances = {};
  for (const role of ["deployer", "treasury"]) {
    const address = addresses[role];
    if (typeof address !== "string" || !address.trim()) throw new Error("Missing Testnet " + role + " address");
    const url = new URL(API);
    url.searchParams.set("address", address);
    const response = await fetcher(url, {
      headers: apiKey ? { "X-API-Key": apiKey } : {},
      redirect: "error",
    });
    if (!response.ok) throw new Error("Testnet balance RPC failed for " + role + ": HTTP " + response.status);
    const data = await response.json();
    if (data.ok !== true || !data.result || !/^\d+$/.test(String(data.result.balance))) {
      throw new Error("Invalid Testnet balance response for " + role);
    }
    const balance = BigInt(data.result.balance);
    balances[role] = {
      address,
      balanceNano: balance.toString(),
      requiredNano: REQUIRED[role].toString(),
      sufficient: balance >= REQUIRED[role],
    };
  }
  return {
    network: "testnet",
    balances,
    sufficient: Object.values(balances).every((entry) => entry.sufficient),
    noTransactionSent: true,
  };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  try {
    const report = await checkV3TestnetFunding({
      deployer: process.env.V3_TESTNET_DEPLOYER_ADDRESS,
      treasury: process.env.PLATFORM_TREASURY_ADDRESS,
    }, fetch, process.env.TONCENTER_API_KEY ?? "");
    console.log(JSON.stringify(report, null, 2));
    if (!report.sufficient) {
      console.error("V3 Testnet deployment blocked before any transaction: fund the listed wallet roles.");
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("V3 Testnet funding preflight failed closed: " + error.message);
    process.exitCode = 1;
  }
}
