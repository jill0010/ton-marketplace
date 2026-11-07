import test from "node:test";
import assert from "node:assert/strict";
import { Address, beginCell, Cell } from "@ton/core";
import { WalletContractV5R1 } from "@ton/ton";
import {
  findReserveRefundDispatch,
  findReserveRefundReceipt,
  sameReserveRefundBody,
  deriveBip39TonWalletKeys,
  findMarketplacePayoutReceipt,
  buildV3SettlementStatement,
} from "./attest.mjs";

const vault = Address.parseRaw("0:" + "01".repeat(32));
const buyer = Address.parseRaw("0:" + "02".repeat(32));
const opcode = 0x72730506;
const body = beginCell().storeUint(opcode, 32).storeUint(1, 64).endCell();
const bodyB64 = body.toBoc().toString("base64");

test("finds only the exact 0.2 TON reserve dispatch to the configured buyer", () => {
  const transactions = [{
    transaction_id: { hash: "11".repeat(32) },
    out_msgs: [
      { destination: buyer.toString(), value: "200000000", msg_data: { body: bodyB64 } },
      { destination: buyer.toString(), value: "10000000", msg_data: { body: bodyB64 } },
    ],
  }];
  assert.equal(findReserveRefundDispatch(transactions, buyer.toString()).transaction, transactions[0]);
  assert.equal(findReserveRefundDispatch(transactions, vault.toString()), null);
});

test("finds buyer-side receipt only when source, amount and opcode all match", () => {
  const transactions = [{
    transaction_id: { hash: "22".repeat(32) },
    in_msg: {
      source: vault.toString(),
      value: "200000000",
      msg_data: { body: bodyB64 },
    },
  }];
  assert.equal(findReserveRefundReceipt(transactions, vault.toString()).transaction, transactions[0]);
  assert.equal(findReserveRefundReceipt(transactions, buyer.toString()), null);
  const bounced = [{
    transaction_id: { hash: "33".repeat(32) },
    aborted: true,
    in_msg: {
      source: vault.toString(),
      value: "200000000",
      bounced: true,
      msg_data: { body: bodyB64 },
    },
  }];
  assert.equal(findReserveRefundReceipt(bounced, vault.toString()), null);
});

test("requires actual seller and platform payout receipts from the Marketplace", () => {
  const sellerBody = beginCell()
    .storeUint(0x71b00101, 32)
    .storeUint(1, 64)
    .storeUint(1, 64)
    .storeUint(2, 64)
    .endCell();
  const platformBody = beginCell()
    .storeUint(0x71b00102, 32)
    .storeUint(1, 64)
    .storeUint(2, 64)
    .storeUint(3, 64)
    .endCell();
  const marketplace = Address.parseRaw("0:" + "03".repeat(32));
  const sellerTransactions = [{
    transaction_id: { hash: "66".repeat(32) },
    in_msg: {
      source: marketplace.toString(),
      value: "9700000",
      msg_data: { body: sellerBody.toBoc().toString("base64") },
    },
  }];
  const treasuryTransactions = [{
    transaction_id: { hash: "77".repeat(32) },
    in_msg: {
      source: marketplace.toString(),
      value: "300000",
      msg_data: { body: platformBody.toBoc().toString("base64") },
    },
  }];
  assert.equal(findMarketplacePayoutReceipt(sellerTransactions, marketplace.toString(), "9700000", 0x71b00101)?.transaction, sellerTransactions[0]);
  assert.equal(findMarketplacePayoutReceipt(treasuryTransactions, marketplace.toString(), "300000", 0x71b00102)?.transaction, treasuryTransactions[0]);
  assert.equal(findMarketplacePayoutReceipt(sellerTransactions, marketplace.toString(), "9700000", 0x71b00102), null);
});

test("builds domain-separated Testnet settlement statement with immutable operation identity", () => {
  const statement = buildV3SettlementStatement({
    marketplace: "0:" + "03".repeat(32),
    vault: vault.toRawString(),
    buyer: buyer.toRawString(),
    orderId: 1,
    principal: 200000000n,
    operationId: 1,
    queryId: 1,
    dispatchTransactionHash: "33".repeat(32),
    dispatchMessageHash: 4n,
    receiptTransactionHash: "44".repeat(32),
    receiptMessageHash: "55".repeat(32),
    masterchainSeqno: 123,
    expiresAt: 1900000000,
    epoch: 1,
  });
  const root = Cell.fromBoc(statement.toBoc())[0].beginParse();
  assert.equal(root.loadUint(32), 0x56523301);
  assert.equal(root.loadUint(16), 1);
  assert.equal(root.loadInt(32), -3);
  assert.equal(root.remainingRefs, 4);
});

test("refuses to pair an unrelated historical refund with the current reserve dispatch",()=>{
  const other=beginCell().storeUint(opcode,32).storeUint(2,64).endCell();
  assert.equal(sameReserveRefundBody({body},{body}),true);
  assert.equal(sameReserveRefundBody({body},{body:other}),false);
  assert.equal(sameReserveRefundBody({body},null),false);
});

test("Acton BIP39 buyer derivation follows SLIP-0010 m/44'/607'/0' and V5 uses Testnet wallet ID",()=>{
  const phrase="abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about".split(" ");
  const keys=deriveBip39TonWalletKeys(phrase);
  assert.equal(keys.publicKey.toString("hex"),"7952e94118f34607c75e23258dd9220d66ccac5a3ee074125c25068e8107bfbf");
  const testnet=WalletContractV5R1.create({workchain:0,publicKey:keys.publicKey,walletId:{networkGlobalId:-3}});
  const mainnet=WalletContractV5R1.create({workchain:0,publicKey:keys.publicKey,walletId:{networkGlobalId:-239}});
  assert.notEqual(testnet.address.toRawString(),mainnet.address.toRawString());
  assert.throws(()=>deriveBip39TonWalletKeys(["only","two"]),/12 or 24/);
});
