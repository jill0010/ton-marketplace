import { useState } from "react";
import { inspectV3TestnetNftCustody } from "../lib/marketplaceV3TestnetReadonly";
import { inspectMarketplaceV3TestnetProduct, type V3TestnetDiagnostic } from "../lib/marketplaceV3TestnetDiagnostics";

export function MarketplaceV3DiagnosticsPage() {
  const [productId, setProductId] = useState("2");
  const [busy, setBusy] = useState(false);
  const [nftAddress, setNftAddress] = useState("");
  const [escrowAddress, setEscrowAddress] = useState("");
  const [custodyBusy, setCustodyBusy] = useState(false);
  const [custodyResult, setCustodyResult] = useState<Awaited<ReturnType<typeof inspectV3TestnetNftCustody>> | null>(null);
  const [custodyError, setCustodyError] = useState("");
  async function inspectCustody() {
    setCustodyBusy(true);
    setCustodyError("");
    setCustodyResult(null);
    try {
      setCustodyResult(await inspectV3TestnetNftCustody(nftAddress.trim(), escrowAddress.trim()));
    } catch (cause) {
      setCustodyError(cause instanceof Error ? cause.message : "NFT custody read failed");
    } finally {
      setCustodyBusy(false);
    }
  }
  const [result, setResult] = useState<V3TestnetDiagnostic | null>(null);
  const [error, setError] = useState("");
  async function inspect() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      if (!/^[1-9][0-9]{0,19}$/.test(productId) || BigInt(productId) > 0xffff_ffff_ffff_ffffn) {
        throw new Error("Enter a valid positive uint64 product ID.");
      }
      setResult(await inspectMarketplaceV3TestnetProduct(BigInt(productId)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Testnet inspection failed");
    } finally {
      setBusy(false);
    }
  }
  return <main className="mx-auto max-w-3xl px-4 py-10 text-zinc-100">
    <h1 className="text-2xl font-semibold">Marketplace V3 — Testnet diagnostics</h1>
    <p className="mt-3 text-sm text-amber-300">Read-only checks only. This page cannot authorize purchases or move funds. Getter responses are not an atomic chain snapshot or proof of NFT custody.</p>
    <form className="mt-6 flex flex-wrap gap-3" onSubmit={(event) => { event.preventDefault(); void inspect(); }}>
      <label className="flex flex-col gap-1 text-sm">On-chain product ID
        <input className="rounded border border-zinc-600 bg-zinc-900 p-2" value={productId} onChange={(event) => setProductId(event.target.value)} />
      </label>
      <button type="submit" disabled={busy} className="self-end rounded bg-blue-600 px-4 py-2 disabled:opacity-50">{busy ? "Reading Testnet…" : "Inspect Testnet"}</button>
    </form>
    <section className="mt-8 rounded border border-zinc-700 p-4">
      <h2 className="font-semibold">NFT custody observation (Testnet only)</h2>
      <p className="mt-2 text-sm text-amber-300">Enter the actual NFT Item and independently verified Escrow contract addresses. A matching owner is not proof of an active listing or purchase eligibility.</p>
      <form className="mt-4 flex flex-wrap gap-3" onSubmit={(event) => { event.preventDefault(); void inspectCustody(); }}>
        <label className="flex flex-col gap-1 text-sm">NFT Item address
          <input className="rounded border border-zinc-600 bg-zinc-900 p-2" value={nftAddress} onChange={(event) => setNftAddress(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">Expected Escrow address
          <input className="rounded border border-zinc-600 bg-zinc-900 p-2" value={escrowAddress} onChange={(event) => setEscrowAddress(event.target.value)} />
        </label>
        <button type="submit" disabled={custodyBusy || !nftAddress.trim() || !escrowAddress.trim()} className="self-end rounded bg-blue-600 px-4 py-2 disabled:opacity-50">{custodyBusy ? "Reading NFT…" : "Check NFT owner"}</button>
      </form>
      {custodyError && <p role="alert" className="mt-3 text-sm text-red-300">{custodyError}</p>}
      {custodyResult && <dl className="mt-3 space-y-2 break-all text-sm">
        <div><dt className="text-zinc-400">NFT owner</dt><dd>{custodyResult.ownerAddress}</dd></div>
        <div><dt className="text-zinc-400">Expected escrow</dt><dd>{custodyResult.escrowAddress}</dd></div>
        <div><dt className="text-zinc-400">Owner matches expected escrow</dt><dd>{String(custodyResult.custodyMatches)}</dd></div>
        <div><dt className="text-zinc-400">Observed at</dt><dd>{custodyResult.observedAt}</dd></div>
        <div><dt className="text-zinc-400">Purchase authorization</dt><dd>NOT GRANTED</dd></div>
      </dl>}
    </section>
    {error && <p role="alert" className="mt-5 text-sm text-red-300">RPC verification failed: {error}</p>}
    {result && <section className="mt-6 rounded border border-zinc-700 bg-zinc-900 p-4">
      <p className="font-medium text-amber-300">Purchase authorization: NOT GRANTED</p>
      <dl className="mt-3 grid grid-cols-1 gap-2 break-all text-sm sm:grid-cols-2">
        {([
          ["Contract", result.marketplaceAddress],
          ["Product ID", result.productId.toString()],
          ["Schema version", result.schemaVersion.toString()],
          ["Next order ID (on-chain)", result.nextOrderId.toString()],
          ["Next product ID (on-chain)", result.nextProductId.toString()],
          ["Next query ID (on-chain)", result.nextQueryId.toString()],
          ["Immutable product query ID", result.productQueryId?.toString() ?? "null"],
          ["Product status", result.status?.toString() ?? "null"],
          ["State classification", result.status === 2n ? "Listed" : result.status === 3n ? "Purchase recorded (settlement unverified)" : result.status === 5n || result.status === 6n ? "Refund / cancellation state" : result.status === 1n ? "Pending listing" : "Unavailable"],
          ["Escrow ID", result.escrowId?.toString() ?? "null"],
          ["Existing order", result.existingOrderId?.toString() ?? "null"],
          ["Reserve status (on-chain)", result.reserveStatus?.toString() ?? "not bound"],
          ["Reserve interpretation", result.reserveStatus === 0n ? "No reserve binding found" : result.reserveStatus === 1n ? "Awaiting reserve allocation" : result.reserveStatus === 2n ? "Vault allocated; settlement not proven" : result.reserveStatus === 3n ? "Reserve allocation failed; refund path initiated" : "No linked order"],
          ["Escrow configured", String(result.escrowConfigured)],
          ["Treasury configured", String(result.treasuryConfigured)],
          ["Coordinator configured", String(result.coordinatorConfigured)],
          ["Observed at", result.observedAt],
        ] as const).map(([name, value]) => <div key={name}><dt className="text-zinc-400">{name}</dt><dd>{value}</dd></div>)}
      </dl>
    </section>}
  </main>;
}
