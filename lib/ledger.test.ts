import assert from "node:assert/strict";
import test from "node:test";
import { Meter, type ChainMeter } from "./ledger.ts";

function fakeChain(): ChainMeter & { calls: string[] } {
  return {
    calls: [],
    async reserve(id) {
      this.calls.push(`reserve:${id}`);
    },
    async settle(id, input, output) {
      this.calls.push(`settle:${id}:${input}:${output}`);
    },
  };
}

test("an API call is refused until authorize persists api_started", async () => {
  const chain = fakeChain();
  const meter = new Meter(new Map(), chain);
  const permit = await meter.authorize("guardada0001", 1, "Guard");
  assert.equal(permit.phase, "api_started");
  assert.deepEqual(chain.calls, ["reserve:guardada0001"]);
  await assert.rejects(() => meter.authorize("guardada0001", 1, "Guard"), /unresolved/);
});

test("unknown billing is not settled", async () => {
  const chain = fakeChain();
  const meter = new Meter(new Map(), chain);
  await meter.authorize("workerada0001", 1, "Worker");
  await meter.markUnknown("workerada0001");
  assert.equal(meter.get("workerada0001")?.phase, "unknown");
  assert.equal(chain.calls.some((call) => call.startsWith("settle")), false);
  await assert.rejects(() => meter.authorize("workerada0001", 1, "Worker"), /unresolved/);
});

test("fixture release settles zero only when no API call started", async () => {
  const chain = fakeChain();
  const meter = new Meter(new Map(), chain);
  await meter.reserveAndReleaseUnbilled("guardbas0001", 2, "Guard");
  assert.equal(meter.get("guardbas0001")?.phase, "released_unbilled");
  assert.deepEqual(chain.calls, ["reserve:guardbas0001", "settle:guardbas0001:0:0"]);
});
