import assert from "node:assert/strict";
import test from "node:test";
import { aiMode, chatJson, parseGuardJson } from "./nearai.ts";

test("malformed guard JSON fails closed", () => {
  assert.throws(() => parseGuardJson("not json"), /not JSON/);
  assert.throws(() => parseGuardJson('{"decision":"maybe","reason":"x"}'), /missed/);
  assert.equal(parseGuardJson('{"decision":"reject","reason":"drain","category":"fund_drain"}').decision, "reject");
});

test("AI mode is live only with a key and no fixture override", () => {
  assert.equal(aiMode({}), "fixture");
  assert.equal(aiMode({ NEAR_AI_API_KEY: "k" }), "live");
  assert.equal(aiMode({ NEAR_AI_API_KEY: "k", TASKBOND_AI_MODE: "fixture" }), "fixture");
});

test("chatJson refuses without a key and never invents output", async () => {
  delete process.env.NEAR_AI_API_KEY;
  await assert.rejects(
    chatJson({ system: "s", user: "u", schemaName: "x", schema: {}, maxTokens: 100, parse: (r) => r }),
    /unset/,
  );
});

test("chatJson fails closed on truncation and accepts strict JSON", async () => {
  process.env.NEAR_AI_API_KEY = "test";
  const mk = (finish: string, content: string) =>
    (async () => new Response(JSON.stringify({ id: "r1", choices: [{ finish_reason: finish, message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }))) as unknown as typeof fetch;
  await assert.rejects(
    chatJson({ system: "s", user: "u", schemaName: "x", schema: {}, maxTokens: 100, parse: (r) => r, fetchImpl: mk("length", "{") }),
    /token cap/,
  );
  const ok = await chatJson({ system: "s", user: "u", schemaName: "x", schema: {}, maxTokens: 100, parse: parseGuardJson, fetchImpl: mk("stop", '{"decision":"approve","reason":"on task","category":"none"}') });
  assert.equal(ok.value.decision, "approve");
  assert.equal(ok.inputTokens, 10);
  await assert.rejects(
    chatJson({ system: "s", user: "u", schemaName: "x", schema: {}, maxTokens: 2048, parse: (r) => r, fetchImpl: mk("stop", "{}") }),
    /ceiling/,
  );
  delete process.env.NEAR_AI_API_KEY;
});
