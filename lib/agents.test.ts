import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DEMO_AGENTS, evidenceJson, fixtureGuard, fixtureReview, fixtureWork, parseReview, pickWinner, type Submission } from "./agents.ts";

const pack = ["account-model", "access-keys", "faucet"].map((id) => ({ id, url: "", body: readFileSync(`sources/${id}.txt`, "utf8") }));

test("fixture guard rejects Mal and approves the honest agents", () => {
  const [mal, ada, bas] = DEMO_AGENTS;
  assert.equal(fixtureGuard(mal.prompt).decision, "reject");
  assert.equal(fixtureGuard(mal.prompt).category, "fund_drain");
  assert.equal(fixtureGuard(ada.prompt).decision, "approve");
  assert.equal(fixtureGuard(bas.prompt).decision, "approve");
});

test("fixture quotes are exact members of the pinned pack", () => {
  for (const key of ["ada", "bas"]) {
    const ev = evidenceJson(pack, fixtureWork(key));
    assert.equal(ev.invalid, 0, key);
    assert.ok(ev.text.length <= 1800);
  }
});

test("fabricated quotes are dropped from evidence", () => {
  const ev = evidenceJson(pack, { summary: "x", steps: ["y"], citations: [{ sourceId: "faucet", quote: "The faucet sends one million NEAR to anyone." }] });
  assert.equal(ev.valid.length, 0);
  assert.equal(ev.invalid, 1);
});

test("reviewer must score every submission and the winner needs evidence", () => {
  const subs: Submission[] = [
    { agentId: 2, name: "Ada", summary: "a".repeat(400), steps: ["1", "2", "3", "4"], validCitations: 3, invalidCitations: 0, quotes: [] },
    { agentId: 3, name: "Bas", summary: "b", steps: ["1"], validCitations: 1, invalidCitations: 0, quotes: [] },
  ];
  const s = fixtureReview(subs);
  assert.equal(pickWinner(subs, s), 2);
  assert.throws(() => parseReview({ scores: [{ agentId: 2, score: 90, reason: "x" }] }, [2, 3]), /every/);
  const live = parseReview({ scores: [{ agentId: 2, score: 40, reason: "x" }, { agentId: 3, score: 30, reason: "y" }] }, [2, 3]);
  assert.equal(pickWinner(subs, live), null);
});

test("snippets are exact substrings and refs resolve to exact quotes", async () => {
  const { snippets, parseWorkerWith } = await import("./agents.ts");
  const list = snippets(pack);
  assert.ok(list.length > 20);
  for (const s of list) assert.ok(pack.find((p) => p.id === s.sourceId)!.body.includes(s.text));
  const out = parseWorkerWith(pack)({ summary: "s", steps: ["a"], citations: [list[0].ref, "faucet:999"] });
  const ev = evidenceJson(pack, out);
  assert.equal(ev.valid.length, 1);
  assert.equal(ev.invalid, 1);
});
