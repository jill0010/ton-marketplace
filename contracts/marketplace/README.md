# TON Marketplace Contracts

Tolk/Acton contracts for the TON Market digital-asset marketplace.

## Contracts

- `contracts/Marketplace.tolk` — legacy V1 listing and escrow flow. Do not use for new production listings.
- `contracts/MarketplaceV2.tolk` — V2 listing, purchase, delivery, settlement, compensation, and retry state machines.
- `contracts/NFTEscrowV2.tolk` — V2 NFT custody, official Item Code validation, TEP-62 delivery/return, and durable callbacks.
- `contracts/types.tolk` — serialized storage schemas, message ABI, and error codes.
- `wrappers/` — Acton contract/test wrappers.
- `tests/` — emulator integration and adversarial tests.
- `scripts/deploy-v2.tolk` — fresh V2 deployment and initial binding script for emulation, testnet, and mainnet.
- `wallets.toml.example` — safe local wallet configuration template using environment-backed mnemonics.

## Marketplace V2 protocol

### Listing and custody

1. The seller's wallet sends `PublishProductV2` to MarketplaceV2. The sender address is the seller identity; product and query IDs must match the contract's current sequence values.
2. MarketplaceV2 reserves the NFT Item address and creates a Pending product, then asks the configured NFTEscrowV2 to register the exact item, seller, collection, index, kind, and query ID.
3. The client must wait until `NFTEscrowV2.escrowIdForQueryV2(queryId)` returns a non-zero escrow ID. Do not submit the NFT transfer before this registration barrier: official TEP-62 Item contracts update ownership before sending `ownership_assigned`, so a premature notification can bounce without rolling ownership back.
4. Only after registration is confirmed does the seller send the standard TEP-62 transfer to NFTEscrowV2 with the exact forward-payload marker and query ID.
5. NFTEscrowV2 validates the NFT Item sender, previous owner, collection allowlist, recognized Item Code hash, derived Item address, and exact forward payload. MarketplaceV2 activates the listing only after the authenticated deposit callback and sends the exact ACK.
6. Seller or Marketplace owner can cancel an active listing. The listing is released only after NFTEscrowV2 confirms the NFT Item's return to the seller and the callback is acknowledged.

The NFT wallet-assets Edge Function now includes the verified Item index needed to reproduce the official Item StateInit/address check. The Marketplace V2 state Edge Function provides server-side reads for the next listing IDs and the Escrow registration barrier. It requires the server secrets `TONCENTER_API_KEY`, `MARKETPLACE_V2_ADDRESS`, and `NFT_ESCROW_V2_ADDRESS`.

### Purchase, delivery, settlement, and compensation

1. A buyer wallet sends `BuyProductV2` with the exact listed price, a unique high-range query ID, a short deadline, and the required execution reserve. The buyer identity is the inbound sender; self-purchase, wrong price, underpayment, overpayment, replay, and expired requests are rejected.
2. MarketplaceV2 stores an immutable order snapshot and three durable payout liabilities: seller proceeds, platform fee, and buyer refund.
3. NFTEscrowV2 transfers the actual NFT Item to the buyer. MarketplaceV2 does not settle either payout leg until the authenticated NFT release callback matches the order, product, escrow record, query, NFT Item, and buyer.
4. Settlement is split as 97% to the seller and 3% to the configured platform treasury. Integer rounding is deterministic: the fee rounds down and the seller receives the remainder, so the two amounts always sum to the exact gross price.
5. Seller and platform transfers are separate, independently retryable operations. A bounced leg is marked failed without undoing a successful leg; an owner-authorized retry creates a fresh query ID for that exact liability.
6. If NFT delivery fails, NFTEscrowV2 emits a durable failure callback. MarketplaceV2 requests the NFT's return to the seller and refunds the buyer only after the exact seller-return confirmation. A bounced buyer refund remains a durable liability and can be retried.

## Verification and release status

The Contracts workflow builds the contracts, runs emulator integration tests, checks the opcode registry, runs the Tolk linter, and enforces formatting. The V2 test suite covers official Item deployment/transfer, escrow registration, successful purchase and NFT delivery, 97/3 settlement, payout bounce/retry, failed delivery, seller return, buyer refund, and refund bounce/retry.

Passing emulator tests are not a substitute for a testnet rehearsal or an independent security review. Current V2 code has not been deployed to testnet or mainnet in this release process. The frontend publish endpoint remains fail-closed and the Publish page remains disabled until on-chain deployment addresses, client transaction sequencing, and database mirroring are configured and verified. Do not accept real buyer funds or expose real-asset listings yet.

## Deployment safety

- `MarketplaceV2Storage` and `NFTEscrowV2Storage` are fresh-deployment schemas. Do not point this code at an older V1 contract address or assume serialized storage compatibility.
- The deployer becomes Marketplace/Escrow owner. The 3% fee treasury is a separate public address and must not equal the deployer. For emulator/testnet, the script can use the separate `treasury` wallet in `wallets.toml`; for mainnet TON Connect, set `PLATFORM_TREASURY_ADDRESS` to the chosen public address so no treasury private key is needed.
- `deploy-v2-mainnet` uses a configured local deployer wallet. `deploy-v2-mainnet-tonconnect` uses Acton's interactive TON Connect signer. With TON Connect, run the script locally and approve the deployment in your wallet; the assistant cannot sign or approve wallet transactions. Never send a mnemonic or private key in chat, commit it to GitHub, or place it in application logs.
- A mainnet deployment requires a funded, authorized deployer signer; a verified production treasury address; a successful testnet rehearsal against current live Fragment collections; and independent review of the compiled code, ABI, storage, and recovery paths.

## Production listing rollout gate

- Supabase Edge Functions `marketplace-v2-state` and `publish-nft-product` expose a server-side listing kill switch. NFT listing is rejected unless the Supabase secret `MARKETPLACE_V2_LISTING_ENABLED=true` is explicitly set.
- Keep this flag unset/false until a successful testnet rehearsal covers the real Telegram collection Item code hashes, escrow registration barrier, NFT ownership transfer, database mirror, and recovery path. The UI flag is not a substitute for the server-side check.
- The public Telegram username and +888 collection rows in `telegram_nft_collection_allowlist` enable wallet asset discovery only. They do not bypass the on-chain Escrow collection/code-hash allowlist. Gift collections remain disabled until each collection is independently verified.
