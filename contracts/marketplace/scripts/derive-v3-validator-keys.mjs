import { createPrivateKey, createPublicKey } from "node:crypto";

const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export function deriveV3ValidatorKey(seedHex) {
  if (typeof seedHex !== "string" || !/^[0-9a-fA-F]{64}$/.test(seedHex)) {
    throw new Error("Validator seed must be exactly 32 bytes encoded as 64 hex characters");
  }
  const seed = Buffer.from(seedHex, "hex");
  if (seed.every((byte) => byte === 0)) throw new Error("Zero validator seed is forbidden");
  const privateKey = createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]),
    format: "der",
    type: "pkcs8",
  });
  const publicDer = createPublicKey(privateKey).export({ format: "der", type: "spki" });
  const publicKey = Buffer.from(publicDer).subarray(-32);
  return {
    publicKeyHex: publicKey.toString("hex"),
    publicKeyDecimal: BigInt("0x" + publicKey.toString("hex")).toString(),
    privateKey,
  };
}

export function deriveV3ValidatorSet(env) {
  const keys = [0, 1, 2].map((index) => deriveV3ValidatorKey(env["V3_VALIDATOR_" + index + "_SEED"]));
  if (new Set(keys.map((key) => key.publicKeyHex)).size !== 3) {
    throw new Error("The three V3 validator seeds must derive three distinct public keys");
  }
  return keys;
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  try {
    const keys = deriveV3ValidatorSet(process.env);
    for (let index = 0; index < keys.length; index++) {
      console.log("V3_VALIDATOR_" + index + "_PUBLIC_KEY=" + keys[index].publicKeyDecimal);
    }
  } catch (error) {
    console.error("V3 validator key derivation blocked: " + error.message);
    process.exitCode = 1;
  }
}
