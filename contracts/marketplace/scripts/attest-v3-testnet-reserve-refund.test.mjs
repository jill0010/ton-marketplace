import test from "node:test";
import assert from "node:assert/strict";
import { Address, beginCell, Cell } from "@ton/core";
import {
  findReserveRefundDispatch,
  findReserveRefundReceipt,
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
