import { auditLegacyWalletRecords } from "../supabase/functions/_shared/wallet-identity-migration.ts";

type SnapshotRow = {
  user_id?: unknown;
  wallet_address?: unknown;
  network?: unknown;
};

function fail(message: string): never {
  console.error(message);
  Deno.exit(1);
}

const inputPath = Deno.args[0];
if (!inputPath || Deno.args.length !== 1) {
  fail(
    "Usage: deno run --allow-read scripts/audit-legacy-wallet-identities.ts <snapshot.json>",
  );
}

let parsed: unknown;
try {
  parsed = JSON.parse(await Deno.readTextFile(inputPath));
} catch {
  fail("Unable to read or parse the input JSON snapshot");
}

if (!Array.isArray(parsed)) {
  fail("Snapshot must be a JSON array of legacy wallet rows");
}

const rows = parsed as SnapshotRow[];
const audit = auditLegacyWalletRecords(
  rows.map((row) => ({
    userId: row?.user_id,
    walletAddress: row?.wallet_address,
    network: row?.network,
  })),
);

const ready = audit.candidates.filter((item) => item.status === "ready").length;
const conflicts = audit.candidates.filter((item) => item.status === "conflict")
  .length;

const report = {
  report_version: 1,
  mode: "read_only",
  source_file: inputPath,
  source_rows: rows.length,
  ready_candidates: ready,
  conflict_candidates: conflicts,
  rejected_rows: audit.rejected.length,
  safe_to_backfill: conflicts === 0 && audit.rejected.length === 0,
  candidates: audit.candidates,
  rejected: audit.rejected,
};

console.log(JSON.stringify(report, null, 2));
if (!report.safe_to_backfill) {
  Deno.exitCode = 2;
}
