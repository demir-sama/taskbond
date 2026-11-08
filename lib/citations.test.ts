import assert from "node:assert/strict";
import test from "node:test";
import { checkCitations } from "./citations.ts";

const pack = [{ id: "account-model", body: "A unique account model that supports access keys." }];

test("accepts an exact quote and rejects inventions", () => {
  assert.equal(
    checkCitations(pack, [{ sourceId: "account-model", quote: "unique account model" }]).ok,
    true,
  );
  const bad = checkCitations(pack, [{ sourceId: "account-model", quote: "the chain is private" }]);
  assert.equal(bad.ok, false);
  assert.equal(checkCitations(pack, [{ sourceId: "missing", quote: "unique account model" }]).ok, false);
});
