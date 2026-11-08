import assert from "node:assert/strict";
import test from "node:test";
import { LIVE_CALL_BUDGET, LIVE_CALL_PLAN, createCallBudget, liveReadiness } from "./live-job.ts";

test("live readiness stays blocked without NEAR_AI_API_KEY", () => {
  const status = liveReadiness({});
  assert.equal(status.ready, false);
  assert.equal(status.complete, false);
  assert.match(status.blocker ?? "", /NEAR_AI_API_KEY/);
});

test("a key alone does not mark the live job ready or complete", () => {
  const status = liveReadiness({ NEAR_AI_API_KEY: "present", TASKBOND_AI_MODE: "fixture" });
  assert.equal(status.ready, false);
  assert.equal(status.complete, false);
});

test("the live plan is one guard per agent, two workers, and one reviewer", () => {
  assert.equal(LIVE_CALL_BUDGET, 6);
  assert.deepEqual(LIVE_CALL_PLAN, ["guard:mal", "guard:ada", "guard:bas", "worker:ada", "worker:bas", "reviewer"]);
  const budget = createCallBudget();
  for (const label of LIVE_CALL_PLAN) budget.take(label);
  assert.equal(budget.used(), 6);
  assert.throws(() => budget.take("reviewer"), /budget exceeded|duplicate/);
});
