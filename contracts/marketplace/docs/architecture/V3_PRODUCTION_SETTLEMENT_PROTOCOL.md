# Marketplace V3 production settlement protocol

Status: design contract for implementation and independent review. This document is not deployment approval.

## Scope

Replace the experimental `TestReserveVault` owner-attestation flow with a production, per-order reserve vault. The marketplace remains the order authority; the NFT escrow remains the custody and delivery authority. A reserve vault is created for one order and one buyer only. No pooled balance may satisfy another order's principal liability.

## Non-negotiable trust boundary

A TON contract cannot query historical account state or independently prove a recipient transaction merely because an RPC returned JSON. A caller-supplied hash, owner assertion, two matching RPC responses, a bounce-shaped body, or a successful send action is not proof that the buyer was credited.

Production settlement therefore requires a separately audited TON light-client proof verifier or a threshold attestation contract whose signers independently verify masterchain-anchored transaction inclusion and finality. The V3 vault accepts only a domain-separated, quorum-signed settlement statement. Until that verifier and its validator governance are implemented and independently reviewed, the vault must fail closed: no receipt finalization, no retry, no liability release, and no Mainnet deployment.

## Settlement statement

The signed statement must bind all of the following fields in a canonical cell/hash:

- protocol domain and schema version;
- network global ID (Mainnet or Testnet), preventing cross-network replay;
- marketplace, vault, order ID, buyer and refund principal;
- refund operation ID and query ID;
- original vault outbound message hash and vault dispatch transaction identity;
- recipient transaction identity and exact inbound message hash for a successful buyer credit, OR the exact bounce transaction identity and value returned to the vault;
- masterchain block/seqno anchoring the relevant shard block(s);
- proof expiry / maximum age and verifier-set epoch.

A successful credit statement must prove exactly one matching inbound message from the vault to the buyer, exact principal amount, successful non-aborted transaction execution, and finality. A returned-funds statement must prove the matching outbound message bounced and the returned value was credited to the same vault account. The two outcomes are mutually exclusive for a given operation.

## Quorum verifier

- Maintain an on-chain validator set with explicit epoch, threshold, activation time and delayed rotation.
- Verify Ed25519 signatures over the canonical domain-separated statement hash in the vault/verifier contract.
- Count each configured validator at most once; reject duplicate, unknown, revoked, wrong-epoch, expired and cross-network signatures.
- Require threshold signatures; no owner-only override and no arbitrary evidence hash.
- Validator keys must be operationally and organizationally independent. The off-chain verifier must validate block/transaction inclusion and masterchain finality, not merely query provider transaction lists.
- Validator compromise, key rotation and emergency pause must be documented and tested. Rotation must not retroactively authorize old statements.

## Per-order liability state machine

Each vault tracks, in integer nanoTON:

- `principal`: original refundable principal;
- `paid`: amount proven credited to buyer;
- `available`: principal returned to / still held by this vault and available for settlement;
- `inFlight`: principal dispatched but not yet proven credited or returned;
- `topUpPrincipal`: exact external funding assigned to an evidenced shortfall;
- `operationalBudget`: separate fees/headroom, never counted as buyer principal;
- monotonically increasing `operationId` and active `queryId`;
- terminal settlement state and consumed proof hashes.

Required invariant: `paid + inFlight + available + fees == principal + topUpPrincipal`; protocol fees are explicitly recorded as consumed principal shortfall, and operational funds never increase principal. A top-up is accepted only for the exact uncovered principal shortfall of this order and is bound to a unique funding message. A retry cannot be initiated while the previous operation is unresolved.

### Transitions

1. **Funded** — accept the reserve only from the configured funding coordinator, for the exact order/buyer/payment identity. A funding acknowledgement is retriable and idempotent.
2. **Dispatch** — dispatch exactly the outstanding principal, increment operation/query IDs, move principal from `available` to `inFlight`, and retain a complete outbound-message identity.
3. **Buyer credited** — accept a quorum proof for the exact buyer receipt; move the operation amount from `inFlight` to `paid`. Duplicate/replayed proofs are rejected. No further refund retry is possible for that operation.
4. **Funds returned** — accept a quorum proof that the exact bounce returned value to this vault; move only the proven returned value from `inFlight` to `available`. Any fee-reduced shortfall remains explicit.
5. **Top-up** — accept exactly the outstanding principal shortfall, separately account operational fees, and reject over-crediting or duplicate funding messages.
6. **Retry** — only after the prior operation is cryptographically proven returned; dispatch exactly the outstanding principal under a new operation/query ID. Enforce a bounded retry policy and explicit terminal/manual-review state. No retry based solely on a timeout or unverified bounce.
7. **Terminal** — close only when the buyer's full principal credit is proven or an explicitly reviewed, protocol-defined zero/partial outcome is recorded. A partial/zero outcome must not be silently represented as a successful refund.

## Required adversarial tests

- wrong network, vault, marketplace, buyer, order, amount, operation ID or query ID;
- dispatch/receipt message-hash mismatch;
- unfinalized or stale masterchain anchor;
- insufficient, duplicate, unknown, revoked or wrong-epoch validator signatures;
- cross-network and cross-order proof replay;
- duplicate receipt, duplicate bounce, stale bounce after retry and conflicting credit+bounce proofs;
- forged bounce body without proof that value returned to the vault;
- underfunded and overfunded principal top-ups; duplicate funding messages;
- operational budget cannot satisfy or inflate principal;
- concurrent retry attempts and repeated delivery callbacks;
- coordinator, marketplace or escrow bounce/retry paths;
- paused vault and validator-set rotation during an in-flight operation.

## Release blockers

The experimental contracts and current RPC evidence scripts do not satisfy this protocol. Production implementation must not be created by renaming experimental files. Mainnet remains blocked until the verifier, validator governance, production contracts, reproducible code hashes, independent security review, and a funded Testnet purchase/delivery/refund/retry trace have all passed.

No wallet signing, deployment or transaction is authorized by this document.
