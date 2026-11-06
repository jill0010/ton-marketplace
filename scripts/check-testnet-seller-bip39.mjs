import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { validateMnemonic, mnemonicToSeedSync } = require("bip39");
const { derivePath } = require("ed25519-hd-key");
const { keyPairFromSeed } = require("@ton/crypto");
const { Address } = require("@ton/core");
const { WalletContractV5R1, WalletContractV4, WalletContractV3R2 } = require("@ton/ton");

// This program derives public addresses only. It has no network client or sender.
const EXPECTED = "0QASRB4XGtN81Pwaef6fWnSJyRwwJEvbbPn-ksz0KQI-bFa0";
const phrase = (process.env.SELLER_MNEMONIC ?? "").normalize("NFKD").trim().toLowerCase().split(/\s+/).join(" ");
delete process.env.SELLER_MNEMONIC;
try {
  if (phrase.split(" ").length !== 12 || !validateMnemonic(phrase)) {
    throw new Error("Invalid 12-word BIP39 phrase; check the GitHub Secret privately.");
  }
  const seed = mnemonicToSeedSync(phrase);
  const child = derivePath("m/44'/607'/0'", seed.toString("hex"));
  const pair = keyPairFromSeed(child.key);
  const expected = Address.parse(EXPECTED);
  const candidates = [
    ["v5r1-testnet", WalletContractV5R1.create({ publicKey: pair.publicKey, walletId: { networkGlobalId: -3 } })],
    ["v5r1-mainnet-id", WalletContractV5R1.create({ publicKey: pair.publicKey, walletId: { networkGlobalId: -239 } })],
    ["v4r2", WalletContractV4.create({ workchain: 0, publicKey: pair.publicKey })],
    ["v3r2", WalletContractV3R2.create({ workchain: 0, publicKey: pair.publicKey })],
  ];
  const matches = candidates.filter(([, wallet]) => wallet.address.equals(expected));
  for (const [kind, wallet] of candidates) {
    console.log(kind + ": " + wallet.address.toString({ testOnly: true, bounceable: false }));
  }
  pair.secretKey.fill(0);
  child.key.fill(0);
  child.chainCode.fill(0);
  seed.fill(0);
  if (matches.length !== 1) throw new Error("No unique address match. Signing remains blocked.");
  console.log("MATCH: " + matches[0][0]);
  console.log("Expected seller address verified. No message was signed or broadcast.");
} catch (error) {
  // Only fixed messages above are logged; dependency errors may contain inputs.
  const allowed = [
    "Invalid 12-word BIP39 phrase; check the GitHub Secret privately.",
    "No unique address match. Signing remains blocked.",
  ];
  console.error(allowed.includes(error?.message) ? error.message : "BIP39 address verification failed. Secret details are suppressed.");
  process.exitCode = 1;
}
