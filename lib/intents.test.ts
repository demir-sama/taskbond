import assert from "node:assert/strict";
import test from "node:test";
import { buildDryQuoteRequest, dryQuote, quoteDeadline, stripSettlementFields } from "./intents.ts";

test("quote request is always dry, exact-output wNEAR, Intents recipient and refund", () => {
  const r = buildDryQuoteRequest("nep141:sol.omft.near", "130000000000000000000000", "demirsama.near", new Date("2026-11-09T00:00:00.123Z"));
  assert.equal(r.dry, true);
  assert.equal(r.swapType, "EXACT_OUTPUT");
  assert.equal(r.destinationAsset, "nep141:wrap.near");
  assert.equal(r.recipientType, "INTENTS");
  assert.equal(r.refundType, "INTENTS");
  assert.equal(r.deadline, "2026-11-09T01:00:00Z");
  assert.match(quoteDeadline(), /T\d\d:\d\d:\d\dZ$/);
});

test("bad recipient or amount is refused before any request", async () => {
  assert.throws(() => buildDryQuoteRequest("nep141:sol.omft.near", "1", "Bad Name"), /recipient/);
  assert.throws(() => buildDryQuoteRequest("nep141:sol.omft.near", "-5", "a.near"), /amount/);
  const r = await dryQuote("x", "0", "a.near", (async () => { throw new Error("must not fetch"); }) as unknown as typeof fetch);
  assert.equal(r.ok, false);
});

test("deposit address is stripped from the preview", async () => {
  assert.equal(stripSettlementFields({ depositAddress: "x", amountIn: "1" }).depositAddress, undefined);
  const fake = (async () => new Response(JSON.stringify({ quote: { depositAddress: "SECRET", amountIn: "5", amountInFormatted: "0.005", amountOut: "130", timeEstimate: 22 } }))) as unknown as typeof fetch;
  const r = await dryQuote("nep141:sol.omft.near", "130", "a.near", fake);
  assert.equal(r.ok, true);
  assert.equal(JSON.stringify(r).includes("SECRET"), false);
  if (r.ok) assert.equal(r.depositAddressDiscarded, true);
});
