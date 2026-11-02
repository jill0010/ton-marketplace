# Dependency Security Audit — 2026-11-02

## Scope and result

The lockfile was audited with `npm audit --json` on Node.js 22.23.4 / npm 10.9.9.

Observed dependency tree:
- 6 advisories total: 3 low, 3 high; no critical advisories.
- The 3 high findings are the development toolchain path `@ton/blueprint@0.47.1 -> @ton/ton@16.3.0 -> zod@3.25.76`.
- The 3 low findings are the production TON Connect dependency path `@tonconnect/ui-react@5.0.1 -> @tonconnect/ui@5.0.1 -> deepmerge@4.3.1`.

## High severity: development-only Zod path

The current Zod version is below 4.6.6 and is affected by GHSA-mrhx-c7xc-m3w5, an uncontrolled memory-consumption issue when validating oversized arrays without a length bound.

The affected path is pulled in by the development dependency `@ton/blueprint`; it is not part of the production Vite bundle or production dependency set. The npm audit output indicates the automated fix requires a semver-major change to the Blueprint toolchain. Do not apply `npm audit fix --force` blindly: first verify the supported Blueprint/TON package compatibility, generated wrappers, build scripts, and contract tests.

Advisory: https://github.com/advisories/GHSA-mrhx-c7xc-m3w5

## Low severity: production TON Connect deepmerge path

`deepmerge@4.3.1` is affected by GHSA-gcqx-w48m-w2h4 (prototype poisoning). The advisory currently lists no patched versions. The issue enters the production dependency graph through TON Connect UI. No safe upstream upgrade is presently available from the locked dependency tree.

Advisory: https://github.com/advisories/GHSA-gcqx-w48m-w2h4

Mitigations:
- Do not pass untrusted wallet/provider data into application-owned deepmerge calls.
- Treat wallet connection metadata as untrusted input and validate expected fields.
- Keep TON Connect packages updated when a compatible upstream release addresses the advisory.
- Re-run the lockfile audit after each dependency update.

## CI policy

The Frontend Build workflow now:
1. Builds the TypeScript/Vite production bundle.
2. Prints a complete locked-tree advisory summary for review.
3. Enforces `npm audit --omit=dev --audit-level=high`, so high/critical production dependencies fail CI while the known low-severity, currently unpatched TON Connect advisory remains visible.

This report does not claim that all dependency advisories are resolved. The development-only high finding and unpatched production low finding remain tracked.
