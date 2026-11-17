# S08-03 — Historical code-hash evidence inventory and gap confirmation (2026-11-17)

Status: **historical evidence reused; only the final-order Vault instance / exact release candidate provenance remains to be confirmed**. No new deployment, purchase, signing or mainnet approval.

## Reused historical proof (do not rerun)
Source: [S07 independent audit handoff](../security/S07_V3_INDEPENDENT_AUDIT_HANDOFF.md).

| Production role | Historical evidence | Interpretation |
| --- | --- | --- |
| MarketplaceReserveV3 | Actions [42503318692](https://github.com/jill0010/ton-marketplace/actions/runs/42503318692), pinned decimal hash `78359546161773769121804334657237004017492887152734900376191088699783038521579` | Testnet hash matched |
| ReserveCoordinatorV3 | Same Actions 42503318692; pinned decimal hash `66691359611383353754318373230718900986162645101604635612762337495115879334100` | Testnet hash matched |
| NFTEscrowV2 (production code) | [43700721551](https://github.com/jill0010/ton-marketplace/actions/runs/43700721551), isolated production instance `kQBdX2PpCASy50dZOmspilaHrnPa6mgJ-DhuzBpNR4LJpQOP` | Production-code role verified on an isolated instance; do not substitute the historical fixture |
| SettlementAttestationVerifierV3 | [42865241709](https://github.com/jill0010/ton-marketplace/actions/runs/42865241709), `kQB_3iLBqs2iW0qC2QbPeOisGfxPf46yGLZUOw3GgGxXZYO4` | Production-code role verified on Testnet |
| ReserveVaultV3 | [42865241709](https://github.com/jill0010/ton-marketplace/actions/runs/42865241709), `kQB9H6xuScwj6Jn5jI_iSA8Zr5y-8gvweh6nQTTNvODz8f4u` | Real deployed Vault role verified; not necessarily the settled S07-09 order's Vault |

Additional proof: [S08-01 Actions 43912675179](https://github.com/jill0010/ton-marketplace/actions/runs/43912675179) confirmed current four-contract binding configuration, but explicitly reports `codeHashesVerified:false`; this field is scoped to that verifier and **does not invalidate historical role proofs**.

[S07-09 closure record](S07-09-TESTNET-CLOSURE-2026-11-16.md) identifies the settled order-specific Vault as `kQCFPrbZgKoPgZlBCmWDxWgyfHJdS18-rvkE-PkrzlCcGRu_` and final state status 3. This record does not independently attest this particular instance's on-chain code hash.

## Narrow outstanding items — no redundant testing
1. Locate a prior immutable log showing the settled S07-09 order Vault `kQCFPrbZgKoPgZlBCmWDxWgyfHJdS18-rvkE-PkrzlCcGRu_` code hash matched the pinned production Vault hash `96403339264512730204843696723697573046015770335637526243123230074643027115550`. If absent, perform **only one read-only RPC code-hash comparison** for this address; no deployment, purchase or settlement.
2. Bind the historical proofs to the exact **final** release commit/toolchain; previous evidence spans distinct instances and revisions. If the final bytecode changed, historical matches do not automatically certify it.
3. Preserve evidence references and hand off to S08-04 independent security review. Independent audit remains unperformed and mainnet gate closed.

**S08-03 acceptance rule:** mark complete only when the order-specific Vault comparison and final-candidate provenance are evidenced, or clearly record them as S08-04 release blockers rather than repeating earlier contract tests. No claim of independent audit or mainnet readiness.
