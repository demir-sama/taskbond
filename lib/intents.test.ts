import assert from "node:assert/strict";
import test from "node:test";
import { buildDryQuoteRequest, quoteDeadline, stripSettlementFields } from "./intents.ts";

test("dry quote request matches the 1Click schema and avoids the testnet 400", () => {
  const body = buildDryQuoteRequest("poster.tb3ed5051370.testnet", new Date("2026-11-08T00:00:00Z"));
  assert.equal(body.dry, true);
  assert.equal(body.swapType, "EXACT_INPUT");
  assert.equal(body.slippageTolerance, 100);
  assert.equal(body.amount, "5000000");
  assert.equal(body.depositType, "ORIGIN_CHAIN");
  assert.equal(body.recipientType, "INTENTS");
  assert.equal(body.refundType, "ORIGIN_CHAIN");
  assert.equal(body.originAsset, "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near");
  assert.equal(body.destinationAsset, "nep141:wrap.near");
  assert.equal(body.deadline, "2026-11-09T00:00:00Z");
  assert.equal(quoteDeadline(new Date("2026-11-08T00:00:00Z")), "2026-11-09T00:00:00Z");
  assert.equal("customRecipientMsg" in body, false);
  assert.equal("depositAddress" in body, false);
});

test("settlement fields are removed before the desk can show them", () => {
  const stripped = stripSettlementFields({
    amountOut: "1",
    depositAddress: "0xabc",
    deadline: "2026-11-09T00:00:00Z",
    timeWhenInactive: "2026-11-09T00:00:00Z",
    chainDepositAddresses: [{ address: "0xabc" }],
  });
  assert.deepEqual(stripped, { amountOut: "1" });
});
