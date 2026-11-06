# Order 1 — independently verified Testnet compensation

- Network: TON Testnet only.
- Original Marketplace V2 buy transaction: `TNcBSRs5vivBstJFXfSj4I/BCrScoKLIK5cQf1/MJew=`.
- Original buyer (raw): `0:D011EC08AFAF6619CABAB8322502D89BC56DFB826EEB25F296AEEEE8E3F8523D`.
- External compensation sender (raw): `0:12441E171AD37CD4FC1A79FE9F5A7489C91C30244BDB6CF9FE92CCF429023E6C`.
- Recipient credit transaction: `/SL0iIYJEpyODajNbo7faWlSZeYvpLf8P0S50NOOo80=`.
- Amount credited: `200000000` nanotons.
- Recipient transaction finalized, not aborted, and incoming message not bounced, verified via TON Center Testnet v3 transactions API.
- Accounting classification: **external compensation paid**; **not an automatic refund of Marketplace V2 processing reserve**.
- **Do not issue a second compensation transfer for order 1.**
- V2 contract reserve accounting and any remaining contract balance require separate reconciliation. Do not mark the original V2 reserve as refunded.
