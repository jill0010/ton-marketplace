# TON Marketplace Contract Opcode Registry

Date: 2026-11-03
Status: V2 protocol registry; purchase and settlement opcodes are reserved, not implemented.

This registry is the canonical opcode allocation record for contract messages in this repository. Any new Tolk message with an explicit 32-bit opcode must be added here and checked against this table before code generation or wrapper updates.

## Existing V1 and standard TEP-62 messages

| Opcode | Message | Status |
|---|---|---|
| `0x2ce05111` | `ChangeOwner` | Existing |
| `0x71a00001` | `CreateEscrow` | Existing V1 |
| `0x71a00002` | `SetCollectionStatus` | Existing V1 |
| `0x71a00003` | `EscrowDeposited` | Existing V1 |
| `0x71a00004` | `SetEscrowAddress` | Existing V1 |
| `0x71a00005` | `PublishProduct` | Existing V1 |
| `0x71a00006` | `RequestRefund` | Existing V1 |
| `0x71a00007` | `EscrowRefunded` | Existing V1 |
| `0x71a00008` | `EscrowRefundAck` | Existing V1 |
| `0x71a00009` | `RetryRefundCallback` | Existing V1 |
| `0x71a0000A` | `SetCollectionItemCode` | Existing V1 |
| `0x71a0000B` | `SetEscrowPaused` | Existing V1 |
| `0x71a0000C` | `EscrowDepositAck` | Existing V1 |
| `0x71a0000D` | `RetryDepositCallback` | Existing V1 |
| `0x71a0000E` | `RetryCreateEscrow` | Existing V1 |
| `0x5fcc3d14` | `NftTransfer` | TEP-62 |
| `0xd53276db` | `NftExcesses` | TEP-62 |
| `0x05138d91` | `NftOwnershipAssigned` | TEP-62 |
| `0x7f000001` | `SetRejectReturn` | Test-only RejectingNFTItem fixture |
| `0x7f000002` | `SetRejectCallbackV2` | Test-only RejectingMarketplaceCallback fixture |
| `0x7f000003` | `StartTestEscrowV2` | Test-only RejectingMarketplaceCallback fixture |
| `0x7f000004` | `StartTestReleaseV2` | Test-only RejectingMarketplaceCallback fixture |
| `0x7f000005` | `SetTestEscrowAddressV2` | Test-only RejectingMarketplaceCallback fixture |

## Marketplace V2 listing messages

| Opcode | Message | Direction | Status |
|---|---|---|---|
| `0x71b0000A` | `PublishProductV2` | Seller → MarketplaceV2 | Implemented (listing only) |
| `0x71b0000B` | `SetMarketplaceV2Escrow` | Owner → MarketplaceV2 | Implemented (configuration) |
| `0x71b0000C` | `SetCollectionStatusV2` | Owner → NFTEscrowV2 | Implemented (V2 collection policy) |
| `0x71b0000D` | `SetCollectionItemCodeV2` | Owner → NFTEscrowV2 | Implemented (official Gift Item Code only) |
| `0x71b00012` | `CancelProductV2` | Seller or owner → MarketplaceV2 | Implemented (seller NFT return request) |
| `0x71b00013` | `EscrowReleaseFailedV2` | NFTEscrowV2 → MarketplaceV2 | Implemented in Escrow (durable failure callback) |
| `0x71b00014` | `EscrowReleaseFailureAckV2` | MarketplaceV2 → NFTEscrowV2 | Implemented in Escrow (exact callback ACK) |
| `0x71b00015` | `RetryReleaseFailureCallbackV2` | Operator → NFTEscrowV2 | Implemented in Escrow (owner retry) |

## Existing Marketplace V2 escrow messages

These opcodes are already implemented and must not be reassigned.

| Opcode | Message | Direction |
|---|---|---|
| `0x71b00001` | `CreateEscrowV2` | MarketplaceV2 → NFTEscrowV2 |
| `0x71b00002` | `ReleaseEscrowV2` | MarketplaceV2 → NFTEscrowV2 |
| `0x71b00003` | `EscrowReleasedV2` | NFTEscrowV2 → MarketplaceV2 |
| `0x71b00004` | `EscrowDepositedV2` | NFTEscrowV2 → MarketplaceV2 |
| `0x71b00005` | `EscrowDepositAckV2` | MarketplaceV2 → NFTEscrowV2 |
| `0x71b00006` | `RetryDepositCallbackV2` | Operator → NFTEscrowV2 |
| `0x71b00008` | `EscrowReleaseAckV2` | MarketplaceV2 → NFTEscrowV2 |
| `0x71b00009` | `RetryReleaseCallbackV2` | Operator → NFTEscrowV2 |

`0x71b00007` is currently unassigned. It is intentionally left unused; do not backfill it without a registry review.

## Reserved purchase and settlement messages

The following assignments are reserved only: no contract currently accepts or emits these messages. `PayoutSettledV2` is not part of the default arbitrary-wallet payout model; the beneficiary wallet does not automatically send an acknowledgement. `DispatchPayoutV2` is reserved for permissionless dispatch of a stored payout liability.

| Opcode | Message | Direction | Status |
|---|---|---|---|
| `0x71b00100` | `BuyProductV2` | Buyer → MarketplaceV2 | Reserved |
| `0x71b00101` | `SellerPayoutV2` | MarketplaceV2 → Seller | Reserved |
| `0x71b00102` | `PlatformPayoutV2` | MarketplaceV2 → Treasury | Reserved |
| `0x71b00103` | `RetryPayoutV2` | Operator → MarketplaceV2 | Reserved |
| `0x71b00104` | `BuyerRefundV2` | MarketplaceV2 → Buyer | Reserved |
| `0x71b00105` | `PayoutSettledV2` | Beneficiary → MarketplaceV2 | Reserved |
| `0x71b00106` | `DispatchPayoutV2` | Permissionless caller → MarketplaceV2 | Reserved |

## Allocation rules

1. Never change an opcode already present in a deployed or previously tested ABI as part of a documentation-only allocation.
2. Do not assign one opcode to two message structs, even if they are consumed by different contracts. Shared Tolk modules and wrappers make collisions particularly dangerous.
3. Keep V1 (`0x71a...`) and V2 (`0x71b...`) namespaces separate.
4. Reserved entries are not implemented entrypoints and do not authorize fund acceptance.
5. Before implementing a reserved message, scan every contract source, shared type module, generated wrapper, test fixture, and deployment artifact for duplicate numeric opcodes; update this registry in the same change.
6. Any ABI/storage change to the isolated V2 contracts requires fresh deployment addresses. Never deserialize an old storage cell under a changed layout.
7. Query IDs and business order IDs are separate identifiers. Opcode uniqueness does not replace message-level sender, state, amount, and query authentication.

## Audit note

The source scan of `contracts/marketplace/contracts/types.tolk` found the provisional purchase-design collision: `0x71b00001` is already `CreateEscrowV2`. The design table previously proposed the same opcode for `BuyProductV2`. The purchase design has been corrected to use `0x71b00100` and the settlement family above. No existing contract ABI was changed by this registry update.


## V2 seller refund messages

These messages are implemented in NFTEscrowV2. MarketplaceV2 does not yet expose seller cancellation or send these messages, so the refund path is not reachable through the current MarketplaceV2 contract.

| Opcode | Message | Direction | Status |
|---|---|---|---|
| `0x71b0000E` | `RefundEscrowV2` | MarketplaceV2 → NFTEscrowV2 | Implemented in Escrow |
| `0x71b0000F` | `EscrowRefundedV2` | NFTEscrowV2 → MarketplaceV2 | Implemented in Escrow |
| `0x71b00010` | `EscrowRefundAckV2` | MarketplaceV2 → NFTEscrowV2 | Implemented in Escrow |
| `0x71b00011` | `RetryRefundCallbackV2` | Operator → NFTEscrowV2 | Implemented in Escrow |

## V2 official collection provenance policy

- `NFTEscrowV2` now has isolated collection status and Item Code storage.
- The owner can register collection status (1 active, 2 paused, 3 revoked) and configure an Item Code only for a registered non-active collection.
- Only Gift kind (`3`) and the two official Fragment Item Code hashes already enforced by V1 are accepted.
- Before allocating an escrow record, V2 derives the expected Item address from `itemIndex:uint256 + collection`, the configured Item Code, the Fragment Gift initial data layout, and workchain 0; the derived address must exactly equal the requested NFT Item.
- `CreateEscrowV2` now includes collection, item index, and kind. This is an ABI/storage-breaking change for the not-yet-deployed V2 contracts; use fresh V2 addresses.
- Positive end-to-end official Item deployment/TEP-62 transfer and adversarial notification tests now pass in emulator CI. Contracts workflow #282 on commit `a122ed2`: success — opcode registry check (35 declarations, no collisions), build, 99 tests in 12 files, linter, and formatter. This is emulator/source verification only; it is not a live testnet rehearsal and does not approve public listings.


## V2 purchase schema checkpoint

The shared type module now includes serialization-only V2 order snapshot and independent payout-liability structs. No new opcode was allocated, no generated purchase wrapper was introduced, and MarketplaceV2 does not yet accept buyer funds. Contracts workflow #297 passed with 35 declarations, no opcode collisions, build, 100 tests in 12 files, linter, and formatter.


## V2 seller refund lifecycle checkpoint

NFTEscrowV2 now supports seller-directed NFT refund from a deposited record, RichBounce restoration to Deposited, authenticated NFT Item excesses confirmation, durable callback, owner retry, and exact Marketplace ACK cleanup. This is the Escrow half only: MarketplaceV2 seller cancellation/callback handling is not yet implemented, so no user-facing V2 cancel/refund action is available. The refund messages do not accept buyer funds.


Latest Contracts workflow #322 passed on `cbc1306c0ba70dd3577b069a1bceeb3d76a8fb1c`: 39 declarations with no opcode collisions, build, 100 tests in 12 files, linter, formatter. V2 refund opcodes are implemented in NFTEscrowV2 only; MarketplaceV2 seller cancellation/callback handling is still pending.
