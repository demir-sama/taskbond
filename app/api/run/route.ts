import { runGate, scriptedRun } from "@/lib/run";
import { canSign } from "@/lib/near-server";
import { aiMode } from "@/lib/nearai";
import { createRun, lease, release, saveRun } from "@/lib/db";
import type { RunEvent } from "@/lib/types";

export const maxDuration = 300;

export async function POST() {
  if (!canSign()) return Response.json({ ok: false, reason: "This host has no testnet demo signers configured." }, { status: 503 });
  let token: string | null;
  try {
    token = await lease("pipeline", 300);
  } catch (e) {
    return Response.json({ ok: false, reason: e instanceof Error ? e.message : "durable store unavailable" }, { status: 503 });
  }
  if (!token) return Response.json({ ok: false, reason: "Another pipeline is running. Wait for it to finish." }, { status: 429 });
  const gate = await runGate();
  if (!gate.ok) {
    await release("pipeline", token);
    return Response.json(gate, { status: 429 });
  }
  const runId = await createRun(aiMode());
  const encoder = new TextEncoder();
  const events: RunEvent[] = [];
  let jobId: number | null = null;
  let status = "running";
  let flush: Promise<unknown> = Promise.resolve();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: RunEvent) => {
        events.push(e);
        if (e.type === "job") jobId = e.jobId;
        if (e.type === "done") status = e.ok ? "complete" : "failed";
        const snapshot = events.slice();
        const j = jobId;
        const st = status;
        flush = flush.then(() => saveRun(runId, j, st, snapshot)).catch(() => {});
        controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      };
      try {
        await scriptedRun(emit);
      } finally {
        await flush;
        await release("pipeline", token!).catch(() => {});
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
