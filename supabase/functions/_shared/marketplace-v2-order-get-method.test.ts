import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  buildOrderCellRunGetMethodRequest,
  extractOrderCellBoc,
  extractSingleUint64StackValue,
  parseMarketplaceV2OrderId,
} from "./marketplace-v2-order-get-method.ts";

Deno.test("builds the exact orderCellV2 request with decimal uint64 stack value", () => {
  assertEquals(buildOrderCellRunGetMethodRequest("0:abc", "orderCellV2", "15"), {
    address: "0:abc",
    method: "orderCellV2",
    stack: [{ type: "num", value: "15" }],
  });
});

Deno.test("rejects invalid, zero, and overflowing order ids", () => {
  for (const value of [null, 0, "0", "-1", "01", "18446744073709551616"]) {
    assertThrows(() => parseMarketplaceV2OrderId(value));
  }
});

Deno.test("extracts documented TON Center V3 legacy cell stack entity", () => {
  assertEquals(extractOrderCellBoc({
    address: "0:abc", method: "orderCellV2",
    stack: [{ type: "cell", value: "te6ccg==" }],
  }), "te6ccg==");
});

Deno.test("extracts typed TVM cell result shape", () => {
  assertEquals(extractOrderCellBoc({
    result: {
      exit_code: 0,
      stack: [{ "@type": "tvm.stackEntryCell", cell: { bytes: "te6ccg==" } }],
    },
  }), "te6ccg==");
});

Deno.test("fails closed on non-cell, null, extra stack values, and failed execution", () => {
  assertThrows(() => extractOrderCellBoc({ stack: [{ type: "null", value: null }] }));
  assertThrows(() => extractOrderCellBoc({ stack: [{ type: "num", value: "0x1" }] }));
  assertThrows(() => extractOrderCellBoc({ stack: [{ type: "cell", value: "a" }, { type: "cell", value: "b" }] }));
  assertThrows(() => extractOrderCellBoc({ exit_code: 11, stack: [{ type: "cell", value: "a" }] }));
});

Deno.test("builds the product-to-order getter request with decimal uint64", () => {
  assertEquals(buildOrderCellRunGetMethodRequest("0:abc", "orderIdForProductV2", "22"), {
    address: "0:abc",
    method: "orderIdForProductV2",
    stack: [{ type: "num", value: "22" }],
  });
});

Deno.test("extracts one decimal uint64 from TON Center V3 getter response", () => {
  assertEquals(extractSingleUint64StackValue({
    gas_used: 123,
    exit_code: 0,
    stack: [{ type: "num", value: "7" }],
  }), "7");
});

Deno.test("rejects null, multiple, non-number, failed and overflowing getter results", () => {
  assertEquals(extractSingleUint64StackValue({ exit_code: 0, stack: [{ type: "null", value: null }] }), null);
  for (const response of [
    { exit_code: 0, stack: [{ type: "num", value: "1" }, { type: "num", value: "2" }] },
    { exit_code: 0, stack: [{ type: "num", value: "0x1" }] },
    { exit_code: 11, stack: [{ type: "num", value: "1" }] },
    { exit_code: 0, stack: [{ type: "num", value: "18446744073709551616" }] },
  ]) {
    assertThrows(() => extractSingleUint64StackValue(response));
  }
});
