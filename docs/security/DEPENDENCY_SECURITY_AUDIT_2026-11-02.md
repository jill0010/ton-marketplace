# Dependency Security Audit — 2026-11-02

## Scope and result

The root npm lockfile was audited with Node.js 22.23.4 / npm 10.9.9.

Initial findings:
- 6 advisories total: 3 low and 3 high.
- The high findings came from the unused development-only `@ton/blueprint@0.47.1 -> @ton/ton@16.3.0 -> zod@3.25.76` dependency chain.
- The low findings came from the production TON Connect dependency path `@tonconnect/ui-react@5.0.1 -> @tonconnect/ui@5.0.1 -> deepmerge@4.3.1`.

## Completed remediation: remove unused Blueprint toolchain

A repository-wide source check found no imports or scripts using `@ton/blueprint`. The contract project uses Acton, not TON Blueprint. The unused dev dependency was removed from `package.json` and `package-lock.json`.

This also removed the unused transitive `@ton/ton` and `zod` packages from the root application lockfile, eliminating the three high-severity development dependency findings without introducing a major toolchain upgrade.

The generated lockfile was tested by reinstalling dependencies, building the frontend, and running the dependency audit.

## Remaining low severity: TON Connect deepmerge path

`deepmerge@4.3.1` remains in the production dependency tree through TON Connect UI and is affected by GHSA-gcqx-w48m-w2h4 (prototype poisoning). The advisory currently lists no patched versions.

Advisory: https://github.com/advisories/GHSA-gcqx-w48m-w2h4

Mitigations:
- Do not pass untrusted wallet/provider data into application-owned deepmerge calls.
- Treat wallet connection metadata as untrusted input and validate expected fields.
- Keep TON Connect packages updated when a compatible upstream release addresses the advisory.
- Re-run the lockfile audit after each dependency update.

## CI policy

The Frontend Build workflow:
1. Installs exactly from the committed lockfile.
2. Builds the TypeScript/Vite production bundle.
3. Prints a complete locked-tree advisory summary for review.
4. Enforces `npm audit --omit=dev --audit-level=high`, so high/critical production dependency advisories fail CI.

The known unpatched low-severity TON Connect advisory remains visible in audit output. It is not silently suppressed.
