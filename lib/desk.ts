import { readFileSync } from "node:fs";
import path from "node:path";
import { demoInflight, readDemo } from "./demo";
import { PUBLIC } from "./public";
import { loadPack } from "./sources";

function readSavedDemo() {
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), "artifacts", "demo-state.json"), "utf8"));
  } catch {
    return null;
  }
}

export function loadDesk() {
  const pack = loadPack();
  const demo = readDemo() ?? readSavedDemo();
  if (demo?.running && !demoInflight()) {
    demo.running = false;
    demo.error = demo.error ?? "The demo process stopped before it finished.";
  }
  let proof: unknown = null;
  try {
    proof = JSON.parse(readFileSync(path.join(process.cwd(), "artifacts", "testnet-escrow.json"), "utf8"));
  } catch {
    proof = null;
  }
  return {
    network: "testnet" as const,
    aiMode: process.env.TASKBOND_AI_MODE === "live" && process.env.NEAR_AI_API_KEY ? "live" : "fixture",
    liveKeyPresent: Boolean(process.env.NEAR_AI_API_KEY),
    contract: PUBLIC.contract,
    accounts: PUBLIC.accounts,
    rpc: PUBLIC.rpc,
    packHash: pack.packHash,
    sources: pack.sources.map(({ id, url, sha256 }) => ({ id, url, sha256 })),
    demo,
    proof,
  };
}
