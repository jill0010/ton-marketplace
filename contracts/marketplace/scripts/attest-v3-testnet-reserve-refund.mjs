import { createHmac, createPrivateKey, createPublicKey, pbkdf2Sync, sign } from "node:crypto";
import { Address, beginCell, Cell, Dictionary, toNano } from "@ton/core";
import { keyPairFromSeed, mnemonicToPrivateKey } from "@ton/crypto";
import { TonClient, WalletContractV5R1, internal } from "@ton/ton";

const API = "https://testnet.toncenter.com/api/v2";
const REFUND_OPCODE = 0x72730506;
const SUBMIT_ATTESTATION_OPCODE = 0x72730503;
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error("Missing required environment variable " + name);
  return value;
}

// Match Acton's explicit mnemonic-scheme="bip39" wallet profile:
// BIP-39 seed, then SLIP-0010 Ed25519 m/44'/607'/0' (hardened).
// This is intentionally distinct from @ton/crypto's TON-native mnemonic KDF.
export function deriveBip39TonWalletKeys(words) {
  if (!Array.isArray(words) || ![12, 24].includes(words.length)) {
    throw new Error("BIP39 Testnet buyer mnemonic must contain 12 or 24 words");
  }
  const phrase = words.join(" ").normalize("NFKD");
  const bip39Seed = pbkdf2Sync(phrase, "mnemonic", 2048, 64, "sha512");
  let material = createHmac("sha512", "ed25519 seed").update(bip39Seed).digest();
  for (const index of [44, 607, 0]) {
    const hardened = Buffer.alloc(4);
    hardened.writeUInt32BE((index + 0x80000000) >>> 0, 0);
    material = createHmac("sha512", material.subarray(32)).update(
      Buffer.concat([Buffer.from([0]), material.subarray(0, 32), hardened]),
    ).digest();
  }
  return keyPairFromSeed(material.subarray(0, 32));
}

function normalizeAddress(value) {
  return Address.parse(value).toRawString();
}

function uint256FromHex(value) {
  const normalized = String(value).replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{1,64}$/.test(normalized)) throw new Error("Invalid uint256 hash");
  return BigInt("0x" + normalized);
}

function transactionIsSuccessful(transaction, message) {
  if (message?.bounced === true) return false;
  const tx = transaction?.transaction ?? transaction;
  if (tx?.aborted === true || tx?.description?.aborted === true) return false;
  const compute = tx?.description?.compute_ph ?? tx?.compute_ph;
  if (compute?.success === false) return false;
  const action = tx?.description?.action ?? tx?.action;
  if (action?.success === false) return false;
  return true;
}

function parseMessageBody(message) {
  const body = message?.msg_data?.body ?? message?.message_content?.body ?? message?.body;
  if (typeof body !== "string" || !body) return null;
  try {
    const cells = Cell.fromBoc(Buffer.from(body, "base64"));
    if (cells.length !== 1) return null;
    const cell = cells[0];
    const slice = cell.beginParse();
    return { cell, opcode: slice.remainingBits >= 32 ? slice.loadUint(32) : null };
  } catch {
    return null;
  }
}

export function findReserveRefundDispatch(transactions, buyerAddress, expectedAmount = "200000000") {
  const buyer = normalizeAddress(buyerAddress);
  for (const transaction of transactions) {
    const outMessages = Array.isArray(transaction.out_msgs)
      ? transaction.out_msgs
      : Object.values(transaction.out_msgs ?? {});
    for (const message of outMessages) {
      const destination = message.destination ?? message.dest;
      const parsed = parseMessageBody(message);
      if (
        destination && normalizeAddress(destination) === buyer &&
        String(message.value) === expectedAmount &&
        parsed?.opcode === REFUND_OPCODE &&
        transactionIsSuccessful(transaction, message)
      ) {
        return { transaction, message, body: parsed.cell };
      }
    }
  }
  return null;
}

export function findReserveRefundReceipt(transactions, vaultAddress, expectedAmount = "200000000") {
  const vault = normalizeAddress(vaultAddress);
  for (const transaction of transactions) {
    const message = transaction.in_msg;
    const source = message?.source ?? message?.src;
    const parsed = parseMessageBody(message);
    if (
      source && normalizeAddress(source) === vault &&
      String(message.value) === expectedAmount &&
      parsed?.opcode === REFUND_OPCODE &&
      transactionIsSuccessful(transaction, message)
    ) {
      return { transaction, message, body: parsed.cell };
    }
  }
  return null;
}

export function buildV3SettlementStatement({
  marketplace, vault, buyer, orderId, principal, operationId, queryId,
  dispatchTransactionHash, dispatchMessageHash, receiptTransactionHash,
  receiptMessageHash, masterchainSeqno, expiresAt, epoch,
}) {
  const identity = beginCell()
    .storeAddress(Address.parse(marketplace))
    .storeAddress(Address.parse(vault))
    .storeAddress(Address.parse(buyer))
    .storeUint(BigInt(orderId), 64)
    .storeCoins(BigInt(principal))
    .endCell();
  const operation = beginCell()
    .storeUint(BigInt(operationId), 64)
    .storeUint(BigInt(queryId), 64)
    .endCell();
  const dispatch = beginCell()
    .storeUint(uint256FromHex(dispatchTransactionHash), 256)
    .storeUint(BigInt(dispatchMessageHash), 256)
    .endCell();
  const result = beginCell()
    .storeUint(1, 8)
    .storeUint(uint256FromHex(receiptTransactionHash), 256)
    .storeUint(uint256FromHex(receiptMessageHash), 256)
    .storeCoins(BigInt(principal))
    .storeUint(BigInt(masterchainSeqno), 32)
    .storeUint(BigInt(expiresAt), 64)
    .storeUint(BigInt(epoch), 32)
    .endCell();
  return beginCell()
    .storeUint(0x56523301, 32)
    .storeUint(1, 16)
    .storeInt(-3, 32)
    .storeRef(identity)
    .storeRef(operation)
    .storeRef(dispatch)
    .storeRef(result)
    .endCell();
}

async function toncenter(path, params = {}) {
  const url = new URL(API + "/" + path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  let response;
  for (let attempt = 0; attempt < 6; attempt++) {
    response = await fetch(url, {
      headers: process.env.TONCENTER_API_KEY ? { "X-API-Key": process.env.TONCENTER_API_KEY } : {},
      redirect: "error",
    });
    if (response.ok) break;
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 5) {
      throw new Error(path + " RPC HTTP " + response.status);
    }
    await sleep(response.status === 429 ? Math.min(2000 * 2 ** attempt, 20000) : Math.min(1000 * 2 ** attempt, 10000));
  }
  const data = await response.json();
  if (data.ok !== true) throw new Error(path + " RPC returned ok=false");
  return data.result;
}

export function findMarketplacePayoutReceipt(transactions, marketplaceAddress, expectedAmount, expectedOpcode, expectedOrderId = 1) {
  const marketplace = normalizeAddress(marketplaceAddress);
  for (const transaction of transactions) {
    const message = transaction.in_msg;
    const source = message?.source ?? message?.src;
    const parsed = parseMessageBody(message);
    if (
      source && normalizeAddress(source) === marketplace &&
      String(message.value) === String(expectedAmount) &&
      parsed?.opcode === expectedOpcode &&
      transactionIsSuccessful(transaction, message)
    ) {
      const slice = parsed.cell.beginParse();
      slice.loadUint(32);
      const orderId = slice.loadUintBig(64);
      if (orderId === BigInt(expectedOrderId)) {
        return { transaction, message, body: parsed.cell };
      }
    }
  }
  return null;
}

async function findConfirmedPayouts(seller, treasury, marketplace, orderId) {
  for (let attempt = 0; attempt < 18; attempt++) {
    const [sellerTransactions, treasuryTransactions] = await Promise.all([
      toncenter("getTransactions", { address: seller, limit: 30, archival: "true" }),
      toncenter("getTransactions", { address: treasury, limit: 30, archival: "true" }),
    ]);
    const sellerPayout = findMarketplacePayoutReceipt(
      sellerTransactions, marketplace, "9700000", 0x71b00101, orderId,
    );
    const platformPayout = findMarketplacePayoutReceipt(
      treasuryTransactions, marketplace, "300000", 0x71b00102, orderId,
    );
    if (sellerPayout && platformPayout) {
      return {
        sellerPayoutHash: sellerPayout.transaction.transaction_id?.hash,
        platformPayoutHash: platformPayout.transaction.transaction_id?.hash,
      };
    }
    if (attempt < 17) await sleep(5000);
  }
  throw new Error("Seller and platform payout receipts were not both confirmed; settlement attestation withheld");
}

export function sameReserveRefundBody(dispatch, receipt) {
  return Boolean(dispatch?.body && receipt?.body &&
    dispatch.body.hash().equals(receipt.body.hash()));
}

async function findConfirmedRefund(vault, buyer) {
  for (let attempt = 0; attempt < 18; attempt++) {
    const [vaultTransactions, buyerTransactions] = await Promise.all([
      toncenter("getTransactions", { address: vault, limit: 30, archival: "true" }),
      toncenter("getTransactions", { address: buyer, limit: 30, archival: "true" }),
    ]);
    const dispatch = findReserveRefundDispatch(vaultTransactions, buyer);
    const receipt = findReserveRefundReceipt(buyerTransactions, vault);
    if (dispatch && receipt) {
      // Matching amount/opcode/source alone is insufficient when the same buyer
      // has received multiple reserve refunds. Bind both legs to the exact
      // serialized refund body before issuing any validator signatures.
      if (!sameReserveRefundBody(dispatch, receipt)) {
        throw new Error("Vault dispatch and buyer receipt refer to different refund messages");
      }
      const dispatchHash = dispatch.transaction.transaction_id?.hash;
      const receiptHash = receipt.transaction.transaction_id?.hash;
      if (!dispatchHash || !receiptHash) throw new Error("Transaction hash missing from Testnet RPC response");
      return { dispatch, receipt, dispatchHash, receiptHash };
    }
    if (attempt < 17) await sleep(5000);
  }
  throw new Error("No matching 0.2 TON vault dispatch and buyer receipt found; no attestation was submitted");
}

async function readBig(client, address, method, args = []) {
  const result = await client.runMethod(address, method, args);
  return result.stack.readBigNumber();
}

async function main() {
  const marketplace = Address.parse(required("V3_PRODUCTION_TESTNET_MARKETPLACE_ADDRESS"));
  const coordinator = Address.parse(required("V3_PRODUCTION_TESTNET_COORDINATOR_ADDRESS"));
  const verifier = Address.parse(required("V3_PRODUCTION_TESTNET_VERIFIER_ADDRESS"));
  const orderId = BigInt(required("V3_TESTNET_ORDER_ID"));
  if (orderId <= 0n) throw new Error("V3_TESTNET_ORDER_ID must be positive");
  const principal = 200000000n;
  const mnemonic = required("DEPLOYER_MNEMONIC").trim().split(/\s+/);
  const buyerMnemonic = required("BUYER_MNEMONIC").trim().split(/\s+/);
  const apiKey = process.env.TONCENTER_API_KEY;
  const client = new TonClient({
    endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC",
    ...(apiKey ? { apiKey } : {}),
  });
  const ownerKeys = await mnemonicToPrivateKey(mnemonic);
  const wallet = WalletContractV5R1.create({ workchain: 0, publicKey: ownerKeys.publicKey, walletId: { networkGlobalId: -3 } });
  const openedWallet = client.open(wallet);
  const owner = wallet.address;
  const expectedOwner = Address.parse(required("V3_TESTNET_DEPLOYER_ADDRESS"));
  if (!owner.equals(expectedOwner)) {
    throw new Error("Derived admin wallet does not match the deployment preflight address; verify mnemonic scheme before signing");
  }
  const buyerKeys = deriveBip39TonWalletKeys(buyerMnemonic);
  const buyerWallet = WalletContractV5R1.create({ workchain: 0, publicKey: buyerKeys.publicKey, walletId: { networkGlobalId: -3 } });
  const buyerAddress = buyerWallet.address;
  if (!buyerAddress.equals(Address.parse(required("PLATFORM_TREASURY_ADDRESS")))) {
    throw new Error("Derived buyer wallet does not match Testnet fixture wallet; settlement withheld");
  }

  const marketplaceOwner = (await client.runMethod(marketplace, "ownerV2")).stack.readAddress();
  if (!marketplaceOwner.equals(owner)) throw new Error("Deployer wallet is not the production Marketplace owner");
  const allocationStatus = await readBig(client, coordinator, "reserveCoordinatorStatusV3", [
    { type: "int", value: orderId },
  ]);
  const coordinatorVault = (await client.runMethod(coordinator, "reserveCoordinatorVaultV3", [
    { type: "int", value: orderId },
  ])).stack.readAddressOpt();
  if (!coordinatorVault) throw new Error("Coordinator has no per-order vault for order " + orderId);
  const vault = coordinatorVault;
  const marketplaceStatus = await readBig(client, marketplace, "marketplaceReserveStatusV3", [
    { type: "int", value: orderId },
  ]);
  const marketplaceVault = (await client.runMethod(marketplace, "marketplaceReserveVaultV3", [
    { type: "int", value: orderId },
  ])).stack.readAddressOpt();
  if (allocationStatus !== 2n || marketplaceStatus !== 2n || !marketplaceVault?.equals(vault)) {
    throw new Error("Marketplace and Coordinator do not agree on a funded order-local reserve vault");
  }

  const vaultStatus = await readBig(client, vault, "reserveVaultStatusV3");
  const inFlight = await readBig(client, vault, "reserveVaultInFlightV3");
  const operationId = await readBig(client, vault, "reserveVaultOperationV3");
  const queryId = await readBig(client, vault, "reserveVaultQueryV3");
  const dispatchMessageHash = await readBig(client, vault, "reserveVaultDispatchMessageHashV3");
  if (vaultStatus !== 2n || inFlight !== principal || operationId < 1n || queryId < 1n || dispatchMessageHash === 0n) {
    throw new Error("Vault is not in the expected single-dispatch in-flight state");
  }

  const proof = await findConfirmedRefund(vault.toString(), buyerAddress.toString());
  const payoutReceipts = await findConfirmedPayouts(owner.toString(), buyerAddress.toString(), marketplace.toString(), orderId);
  const masterchain = await toncenter("getMasterchainInfo");
  const masterchainSeqno = BigInt(masterchain.last?.seqno ?? 0);
  if (masterchainSeqno <= 0n) throw new Error("Could not obtain a finalized Testnet masterchain sequence number");
  const epoch = await readBig(client, verifier, "verifierEpoch");
  const statement = buildV3SettlementStatement({
    marketplace: marketplace.toRawString(),
    vault: vault.toRawString(),
    buyer: buyerAddress.toRawString(),
    orderId,
    principal,
    operationId,
    queryId,
    dispatchTransactionHash: proof.dispatchHash,
    dispatchMessageHash,
    receiptTransactionHash: proof.receiptHash,
    receiptMessageHash: proof.receipt.body.hash().toString("hex"),
    masterchainSeqno,
    expiresAt: BigInt(Math.floor(Date.now() / 1000) + 600),
    epoch,
  });

  const signatures = Dictionary.empty(Dictionary.Keys.Uint(8), Dictionary.Values.Cell());
  const seen = new Set();
  for (let index = 0; index < 3; index++) {
    const seed = required("V3_VALIDATOR_" + index + "_SEED");
    if (!/^[0-9a-fA-F]{64}$/.test(seed)) throw new Error("Invalid validator seed " + index);
    const privateKey = createPrivateKey({
      key: Buffer.concat([PKCS8_ED25519_PREFIX, Buffer.from(seed, "hex")]),
      format: "der",
      type: "pkcs8",
    });
    const publicKey = Buffer.from(createPublicKey(privateKey).export({ format: "der", type: "spki" })).subarray(-32);
    const publicHex = publicKey.toString("hex");
    if (seen.has(publicHex)) throw new Error("Duplicate validator public key");
    seen.add(publicHex);
    const signature = sign(null, statement.hash(), privateKey);
    signatures.set(index, beginCell().storeBuffer(signature).endCell());
  }
  if (seen.size !== 3) throw new Error("Three distinct validator signatures are required");

  const signatureBundle = beginCell().storeDict(signatures).endCell();
  const submitBody = beginCell()
    .storeUint(SUBMIT_ATTESTATION_OPCODE, 32)
    .storeRef(statement)
    .storeRef(signatureBundle)
    .endCell();
  const seqno = await openedWallet.getSeqno();
  await openedWallet.sendTransfer({
    seqno,
    secretKey: ownerKeys.secretKey,
    messages: [internal({
      to: vault,
      value: toNano("0.05"),
      bounce: true,
      body: submitBody,
    })],
  });

  let finalStatus = 0n;
  let paid = 0n;
  for (let attempt = 0; attempt < 18; attempt++) {
    await sleep(5000);
    finalStatus = await readBig(client, vault, "reserveVaultStatusV3");
    paid = await readBig(client, vault, "reserveVaultPaidV3");
    if (finalStatus === 3n && paid === principal) break;
  }
  if (finalStatus !== 3n || paid !== principal) {
    throw new Error("Attestation submitted but vault did not reach paid state; inspect verifier and vault transactions");
  }
  console.log(JSON.stringify({
    network: "testnet",
    marketplace: marketplace.toString(),
    coordinator: coordinator.toString(),
    vault: vault.toString(),
    buyer: buyerAddress.toString(),
    orderId: orderId.toString(),
    reservePrincipalNano: principal.toString(),
    dispatchTransactionHash: proof.dispatchHash,
    buyerReceiptTransactionHash: proof.receiptHash,
    sellerPayoutTransactionHash: payoutReceipts.sellerPayoutHash,
    platformPayoutTransactionHash: payoutReceipts.platformPayoutHash,
    masterchainSeqno: masterchainSeqno.toString(),
    validatorQuorum: "3/3",
    vaultStatus: Number(finalStatus),
    paidNano: paid.toString(),
    mainnetTransactionsSent: false,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch((error) => {
    console.error("V3 Testnet reserve attestation failed closed: " + error.message);
    process.exitCode = 1;
  });
}
