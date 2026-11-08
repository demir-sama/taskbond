import assert from "node:assert/strict";
import test from "node:test";
import { assertPermit, parseGuardJson } from "./nearai.ts";

test("NEAR AI is refused without a reservation permit", () => {
  assert.throws(() => assertPermit(null), /reservation/);
  assert.throws(() => assertPermit({ id: "x", phase: "reserved", purpose: "Guard" }), /reservation/);
});

test("malformed guard JSON fails closed", () => {
  assert.throws(() => parseGuardJson("not json"), /not JSON/);
  assert.throws(() => parseGuardJson('{"decision":"maybe","reason":"x"}'), /missed/);
  assert.deepEqual(parseGuardJson('{"decision":"reject","reason":"drain"}'), {
    decision: "reject",
    reason: "drain",
  });
});
