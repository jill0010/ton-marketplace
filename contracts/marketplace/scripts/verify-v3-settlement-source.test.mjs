import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("./verify-v3-production-testnet-settlement.tolk", import.meta.url), "utf8");

test("settlement verifier resolves the exact NFT product and resulting order", () => {
  assert.match(source, /assetProductIdV2\(nftItem!!\)/);
  assert.match(source, /orderIdForProductV2\(productId!!\)/);
  assert.match(source, /orderCellV2\(orderId!!\)/);
  assert.doesNotMatch(source, /orderIdForProductV2\(1\)|orderCellV2\(1\)/);
});

test("all reserve getters use the dynamically resolved order ID", () => {
  for (const getter of ["marketplaceReserveStatusV3", "reserveCoordinatorStatusV3",
                        "reserveCoordinatorVaultV3", "marketplaceReserveVaultV3"]) {
    assert.match(source, new RegExp('"' + getter + '"\\s*,\\s*\\[orderId!!\\]'));
  }
  assert.match(source, /marketplaceVault!! == vault/);
});

test("getter-only checks never claim independent refund receipt or finality", () => {
  assert.doesNotMatch(source, /END-TO-END SETTLEMENT VERIFIED|attested by 3\/3 configured validators/);
  assert.match(source, /INDEPENDENT TRANSFER FINALITY NOT ATTESTED/);
});
