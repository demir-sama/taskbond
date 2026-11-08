import assert from "node:assert/strict";
import test from "node:test";
import { costYocto, worstCaseYocto } from "./billing.ts";

const RATE = 1_000_000_000_000_000n;

test("qwen worst case matches the contract hand calculation", () => {
  const yocto = worstCaseYocto({
    inputAmount: 40n,
    outputAmount: 1350n,
    contextLength: 262_144n,
    maxOutput: 65_536n,
    yoctoPerNano: RATE,
  });
  const nano = 262_144n * 40n + 65_536n * 1350n;
  assert.equal(nano, 98_959_360n);
  assert.equal(yocto, nano * RATE);
});

test("zero tokens are free and overflow is rejected", () => {
  assert.equal(costYocto(40n, 1350n, 0n, 0n, RATE), 0n);
  assert.throws(() => costYocto((1n << 128n) - 1n, 1n, 2n, 0n, RATE), /overflow/);
});
