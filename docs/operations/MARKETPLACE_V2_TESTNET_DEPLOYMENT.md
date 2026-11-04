# Marketplace V2 testnet deployment

## Scope

`contracts/marketplace/scripts/deploy-v2.tolk` is the isolated V2 deployment path. It deploys a fresh `MarketplaceV2` and `NFTEscrowV2` pair, binds the Marketplace to the Escrow exactly once, configures the treasury exactly once, and reads the resulting configuration back for verification. It does not reuse the V1 deployment script or V1 storage.

## Command

From `contracts/marketplace`, use the Acton script alias `deploy-v2-testnet` from `Acton.toml`. The Acton wallet profile named `deployer` must be configured locally for the testnet. The script uses that wallet as the V2 owner and initial platform treasury.

## Safety defaults

- No Fragment collection is approved by the deployment script. Listing requests remain unavailable until an operator has verified and configured the exact official collection address and supported Item Code on testnet.
- The V2 treasury is immutable after its one-time configuration. Confirm the deployer wallet is the intended testnet treasury before running the script.
- The script prints Marketplace and Escrow addresses and verifies the binding and owner/treasury getters.
- V2 addresses and storage are fresh. Never point this script at existing V1 addresses or reuse a V1 data cell.
- Do not put mnemonic phrases, private keys, or wallet JSON files in GitHub, CI variables, Supabase secrets, or chat.

## Mainnet gate

The testnet script is not a mainnet deployment approval. Mainnet requires a complete successful testnet rehearsal using real official Fragment NFT Items, independent code/hash review, confirmation of treasury and collection configuration, verified compensation and payout retry tests, and a secure signer controlled by the owner. The unused portion of the current 0.2 TON execution reserve also needs a finalized economic policy before mainnet activation.
