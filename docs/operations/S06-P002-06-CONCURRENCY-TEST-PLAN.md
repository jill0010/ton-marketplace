# S06-P002-06 — Atomic payment confirmation concurrency acceptance

Status: **NOT YET EXECUTED**. This is a staging-only test protocol. Never run it against production customer orders, and never treat synthetic transaction hashes as on-chain payment evidence.

## Prerequisites

- A disposable Supabase staging project with the same migrations and the `confirm_manual_product_payment_verified` RPC.
- Two independent PostgreSQL connections (sessions A and B) with the trusted server role.
- Two distinct staging orders in `awaiting_payment`, with valid buyers and products, and an isolated fixture cleanup procedure.
- The staging database must have a UNIQUE constraint/index on `manual_product_orders(payment_tx_hash)`.
- No real TON transfers are required.

## Case 1 — simultaneous confirmation of the same order

1. Session A: `BEGIN;` then invoke the RPC for staging order A with synthetic 64-character lowercase hex hash H1. Keep the transaction open.
2. Session B: `BEGIN;` then invoke the RPC for the same order and hash H1. It must block on `SELECT ... FOR UPDATE` until A completes.
3. Commit A; B must then return `ALREADY_CONFIRMED`. Commit B.
4. Assert exactly one `payment_verified` audit log for order A, and exactly one order with hash H1.

## Case 2 — two different orders claiming one transaction

1. Create staging orders A and B in `awaiting_payment`.
2. In independent sessions, simultaneously invoke the RPC for A and B with the same synthetic hash H2.
3. Exactly one may return `CONFIRMED`; the other must return `PAYMENT_ALREADY_CLAIMED` or fail with PostgreSQL unique violation `23505` (the Edge Function maps 23505 to a conflict).
4. Assert exactly one paid order has H2, exactly one matching payment audit log exists, and the losing order remains `awaiting_payment` without a payment audit log.

## Case 3 — invalid evidence and conflicting state

- Invalid or uppercase/non-64-character hash: RPC raises, no order or audit changes.
- NULL paid timestamp: RPC raises, no order or audit changes.
- Confirmed order with a different hash: `PAYMENT_STATE_CONFLICT`; no new audit log.
- Unknown order or mismatched buyer: `ORDER_NOT_FOUND`; no audit log.

## Case 4 — atomic rollback

1. In staging, deliberately force an audit insert failure in a transaction-controlled test fixture.
2. Invoke the RPC; it must fail.
3. Assert the order is still `awaiting_payment`, with no transaction hash or paid timestamp, proving that the order update and audit insertion roll back together.

## Pass criteria

All four cases pass in the disposable staging database; capture query results and transaction IDs as CI artifacts without storing credentials. Source assertions and catalog inspection alone are **not** concurrency acceptance.

## Production deployment gate

The currently deployed Edge Function must be checked independently for full-history coverage `!scanIntegrityValid || !scanReachedOrderStart` and strict UUID validation. Do not remove the mainnet launch blocker until deployed code, staging concurrency evidence, and safety review all pass.
