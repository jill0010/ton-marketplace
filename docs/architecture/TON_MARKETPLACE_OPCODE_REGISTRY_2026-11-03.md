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
| `0x7f000005` | `SetTestEscrowAddressV2` | Test-only RejectingMarketplaceCallback fixture |

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

The following assignments replace the conflicting provisional assignments in the purchase design. They are reserved only: no contract currently accepts or emits these messages.

| Opcode | Message | Direction | Status |
|---|---|---|---|
| `0x71b00100` | `BuyProductV2` | Buyer → MarketplaceV2 | Reserved |
| `0x71b00101` | `SellerPayoutV2` | MarketplaceV2 → Seller | Reserved |
| `0x71b00102` | `PlatformPayoutV2` | MarketplaceV2 → Treasury | Reserved |
| `0x71b00103` | `RetryPayoutV2` | Operator → MarketplaceV2 | Reserved |
| `0x71b00104` | `BuyerRefundV2` | MarketplaceV2 → Buyer | Reserved |
| `0x71b00105` | `PayoutSettledV2` | Beneficiary → MarketplaceV2 | Reserved |

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
