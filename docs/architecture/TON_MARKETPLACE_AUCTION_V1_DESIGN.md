# TON Marketplace Auction V1 — Design and Implementation Gate

Date: 2026-11-04
Status: Design baseline; not enabled for users or mainnet.

## Product behavior modeled on Fragment

Reference: https://fragment.com/about

- Seller selects an NFT already verified in their connected TON mainnet wallet.
- NFT must be deposited into the marketplace's verified NFT escrow before the auction becomes public.
- Seller sets a minimum opening bid and an auction duration/end rule.
- Optional buy-now price must exceed the minimum bid and atomically end the auction when paid.
- Auction is open ascending-bid. Current highest bid and remaining time are public; bidder identity is represented by wallet address.
- Each bid is a real on-chain payment, not an off-chain promise or database-only number.
- A bid must exceed the current high bid and satisfy a deterministic minimum increment rule stored at creation.
- When outbid, the previous bid becomes an individually correlated, retryable refund liability.
- After the deadline, anyone may trigger finalization. Only the highest confirmed on-chain bid can win.
- If there are no bids, the NFT returns to the seller through the escrow return protocol.
- Seller cancellation is allowed only before the first accepted bid.
- Finalization delivers the NFT to the winner first, then settles seller proceeds and platform fee. Failed delivery must return the NFT to the seller before refunding the winner.
- Existing Marketplace V2 fee policy (3%) remains unchanged unless separately approved. Do not silently copy Fragment's 5% fee.

## Seller creation flow

1. Connect TON mainnet wallet and complete server-side wallet proof.
2. Load only NFTs owned by that verified wallet.
3. Select one NFT and show its collection, item address, title and verified image.
4. Choose Auction rather than Fixed price.
5. Enter minimum bid in the marketplace's configured native payment denomination.
6. Optionally enter buy-now price.
7. Choose an allowed duration; persist fixed ends_at and starts_on_first_bid settings.
8. Review custody, cancellation, outbid-refund and settlement rules.
9. Confirm listing transaction in TON Connect.
10. Publish to the public database mirror only after Marketplace V2 and Escrow V2 confirm the listing.

## Bidder flow

1. Inspect current high bid, next minimum valid bid, end time and public bid history.
2. Connect and verify TON mainnet wallet.
3. Submit bid with exact amount and unique query ID to the on-chain contract.
4. Show Pending until the transaction is verified from chain state; only then show Leading bid.
5. If outbid, show Outbid — refund pending until the exact refund liability is confirmed.
6. When time expires, show Awaiting finalization until on-chain finalizer and escrow delivery callback complete.
7. Winner status is not Won until NFT delivery callback is verified.

## Required contract state and protocol

- Auction configuration: auction ID, product ID, seller, minimum bid, optional buy-now, duration, start timestamp, end timestamp, minimum increment policy, state.
- Highest bid: amount, bidder address, unique bid query ID, transaction correlation.
- Append-only bid history or authenticated event stream sufficient to reconstruct accepted bids.
- Per-bidder refund liabilities: amount, beneficiary, operation ID, query ID, status and retry count.
- Replay protection for every bid, refund, finalize and delivery callback.
- State transitions: Created -> Active -> Ended -> DeliveryPending -> Finalized; plus Cancelled, NoBidsReturnPending, RefundPending and ManualReview.
- Bid acceptance, prior-leading-bid refund liability creation and highest-bid update must be atomic.
- No bid after on-chain end time; browser clocks are never authoritative.
- Finalization is permissionless and idempotent.
- Buy-now atomically closes the auction and prevents later bids.
- Contract accounting separates winning proceeds, outbid refunds, seller proceeds, platform fee and execution reserves.
- Auction-enabled Marketplace V2 requires a fresh separately verified deployment or formally reviewed migration; never reinterpret deployed storage.

## Database mirror (not source of truth)

Add server-only mirror tables for auctions, bids and refund/settlement events. Public clients receive read-only views populated only after chain verification. Every mirrored row stores chain/network, contract address, transaction hash, query ID and source transaction time. Database status never authorizes a bid, declares a winner, releases an NFT or moves funds.

## Mandatory tests before exposing the feature

- Seller wallet mismatch, NFT not owned, unapproved collection and duplicate escrow listing.
- Minimum bid validation, minimum increment boundary, buy-now boundary and replayed query IDs.
- Concurrent bids; only the contract's accepted transaction order determines the leader.
- Outbid refund created exactly once; refund bounce/retry cannot duplicate funds.
- Bid after end time rejected even if UI clock is wrong.
- Finalize called twice, no-bid finalization and delayed delivery callback.
- Seller cancellation before first bid succeeds; after first bid fails.
- Buy-now racing a normal bid produces exactly one winner.
- NFT delivery success/failure, NFT return to seller and winner refund only after proven return.
- Seller/platform payout bounces and retries independently.
- Storage round-trip, cell-size, integer overflow and maximum amount tests.
- Full emulator suite, independent security review, testnet rehearsal with verified official Telegram NFT Item code, and recovery rehearsal.

## Current release gates

- Existing Marketplace V2 supports fixed-price purchase and NFT escrow delivery, not auction bidding.
- Existing products.listing_kind and auction_ends_at fields are catalogue metadata only; they do not implement bidding.
- Do not publish auction rows as active until on-chain auction state and escrow finalization are implemented and verified.
- Do not enable real-money bidding or deploy auction contracts to mainnet as part of a frontend-only change.