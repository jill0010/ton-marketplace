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

Passing emulator tests are not a substitute for a testnet rehearsal or an independent security review. Current V2 code has not been deployed to testnet or mainnet in this release process. The Publish page listing flow is implemented but gated by MARKETPLACE_V2_LISTING_ENABLED and the on-chain Escrow collection policy. The publish-nft-product endpoint only mirrors a fully verified on-chain product, Escrow record, and NFT ownership state. The buyer purchase button remains disabled; frontend purchase, order synchronization, and buyer delivery confirmation are not yet enabled. Do not accept real buyer funds or expose real-asset listings yet.

## Deployment safety

- `MarketplaceV2Storage` and `NFTEscrowV2Storage` are fresh-deployment schemas. Do not point this code at an older V1 contract address or assume serialized storage compatibility.
- The deployer becomes Marketplace/Escrow owner. The 3% fee treasury is a separate public address and must not equal the deployer. For emulator/testnet, the script can use the separate `treasury` wallet in `wallets.toml`; for mainnet TON Connect, set `PLATFORM_TREASURY_ADDRESS` to the chosen public address so no treasury private key is needed.
- `deploy-v2-mainnet` uses a configured local deployer wallet. `deploy-v2-mainnet-tonconnect` uses Acton's interactive TON Connect signer. With TON Connect, run the script locally and approve the deployment in your wallet; the assistant cannot sign or approve wallet transactions. Never send a mnemonic or private key in chat, commit it to GitHub, or place it in application logs.
- A mainnet deployment requires a funded, authorized deployer signer; a verified production treasury address; a successful testnet rehearsal against current live Fragment collections; and independent review of the compiled code, ABI, storage, and recovery paths.

## Production listing rollout gate

- The marketplace-v2-state endpoint exposes the rollout flag. The frontend will not initiate a new listing unless the Supabase secret MARKETPLACE_V2_LISTING_ENABLED=true is explicitly set. The state endpoint also rechecks this flag immediately before NFT ownership transfer.
- Keep this flag unset/false until a successful testnet rehearsal covers the real Telegram collection Item code hashes, escrow registration barrier, NFT ownership transfer, database mirror, and recovery path.
- publish-nft-product is deliberately a verification-and-sync endpoint, not a new-listing gate. It must remain able to mirror an already deposited NFT even if the UI rollout flag is later disabled; blocking recovery after custody transfer could strand a seller's NFT.
- The actual on-chain permission gate is the Escrow collection status and approved Item Code mapping. Do not enable those collection policies until the exact mainnet Item code has been independently verified. The public Telegram username and +888 rows in telegram_nft_collection_allowlist currently enable wallet asset discovery only. Gift collections remain disabled until each collection is independently verified.

### GitHub Actions mainnet deployment

The repository includes a manually dispatched workflow at `.github/workflows/deploy-marketplace-v2-mainnet.yml`. It does not deploy on push. The operator must explicitly check the irreversible-mainnet-deployment confirmation input.

Configure these GitHub Actions repository secrets before dispatching:

- `DEPLOYER_MNEMONIC` — the dedicated, funded V5R1 deployment wallet mnemonic. Never paste it into chat or commit it.
- `PLATFORM_TREASURY_ADDRESS` — the public address that receives the Marketplace V2 3% fee. It must be controlled by the project owner and must differ from the deployer wallet.
- `TONCENTER_MAINNET_API_KEY` — a TON Center mainnet API key.

The workflow writes a temporary, permission-restricted `wallets.toml` that references the mnemonic only through the environment. It builds the production contracts, runs the mainnet deployment script, and requires the script's final escrow/treasury verification marker before reporting success. It adds the resulting public contract addresses to the GitHub Actions run summary. The workflow cannot run successfully until all three secrets are configured; no secret values belong in the repository.

## Admin custody wallet settings

The admin page `/admin/wallet-settings` stores only public wallet addresses for the marketplace custody wallet and platform treasury, with an admin-only audit trail. Saving a custody wallet requires a TON Connect session on mainnet whose connected address exactly matches the new custody address. Testnet-friendly addresses are rejected.

The page never accepts or stores private keys or recovery phrases. It can request a native GRAM funding transfer from a separately connected mainnet wallet to the configured custody wallet; the connected wallet must approve the transaction in its own UI and pays the network fee. A database address change does not rotate a deployed smart contract, change an immutable on-chain treasury, or migrate assets. Those changes require the appropriate owner-authorized on-chain operation or a separately reviewed contract migration.

