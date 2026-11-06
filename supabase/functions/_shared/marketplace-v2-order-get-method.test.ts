import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  buildOrderCellRunGetMethodRequest,
  extractOrderCellBoc,
  parseMarketplaceV2OrderId,
} from "./marketplace-v2-order-get-method.ts";

Deno.test("builds the exact orderCellV2 request with hexadecimal uint64 stack value", () => {
  assertEquals(buildOrderCellRunGetMethodRequest("0:abc", "15"), {
    address: "0:abc",
    method: "orderCellV2",
    stack: [{ type: "num", value: "0xf" }],
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
