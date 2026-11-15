// Read-only TON Testnet account lookup; does not sign or send transactions.
const address = process.env.S05_RECOVERY_NFT_ADDRESS;
if (!address || !/^[k0]Q[A-Za-z0-9_-]{46}$/.test(address)) {
  throw new Error("Missing or invalid recovered NFT address");
}
const url = new URL("https://testnet.toncenter.com/api/v2/getAddressInformation");
url.searchParams.set("address", address);
const key = process.env.TONCENTER_API_KEY;
const response = await fetch(url, { headers: key ? { "X-API-Key": key } : {}, redirect: "error" });
if (!response.ok) throw new Error("Testnet RPC HTTP " + response.status);
const body = await response.json();
if (body.ok !== true || !body.result || typeof body.result.state !== "string") {
  throw new Error("Malformed Testnet RPC account response");
}
const report = {
  network: "testnet",
  sourceRunId: 43703734360,
  nftAddress: address,
  accountState: body.result.state,
  lastTransactionId: body.result.last_transaction_id ?? null,
  accountExists: body.result.state === "active",
  noTransactionSent: true,
  interpretation: body.result.state === "active"
    ? "NFT account is active; inspect NFT data and custody before any retry."
    : "NFT account not active at query time; inspect source wallet transaction history before any retry.",
};
console.log(JSON.stringify(report, null, 2));
