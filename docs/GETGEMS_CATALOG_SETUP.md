# Getgems catalogue sync

The catalogue is read-only. It does not create bids, buy NFTs, move funds, or transfer assets.

## API access

1. Open https://getgems.io/public-api and connect the administrator wallet with TON Connect.
2. Generate a Public API key.
3. In Supabase Dashboard, open project qmvvlkierfiogituccbo → Edge Functions → Secrets.
4. Add the secret named GETGEMS_API_KEY with the generated value. Do not commit it or paste it into source code, GitHub issues, or chat.

The sync function reads the key only on the server.

## Current scope

- Usernames: the enabled Telegram username collection in telegram_nft_collection_allowlist.
- Anonymous numbers: the enabled Telegram number collection in the same allowlist.
- Gifts: Getgems' public off-chain gifts on-sale endpoint.
- Maximum: 100 newest returned records per category per sync.
- Prices remain in the currency reported by Getgems (TON or GRAM).
- Only public listing metadata is cached. No wallet secrets or customer funds are used.

## Trigger

The administrator can use the Sync Getgems button on /fragment-market. The Edge Function requires a valid Supabase session for the configured administrator user. The public page only reads fresh active rows; rows older than ten minutes are hidden.

## Notes

The public Getgems REST API key is obtained through TON Connect at https://getgems.io/public-api. Do not use Getgems' private website GraphQL endpoints. The gifts transfer API is partner-gated and is not used by this read-only catalogue sync.