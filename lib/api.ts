import "server-only";
import { lease, release } from "./db";
import type { RunEvent } from "./types";

/** All operator transactions serialize through the same durable serverless lease. */
export async function collect(fn: (emit: (e: RunEvent) => void) => Promise<unknown>) {
  const events: RunEvent[] = [];
  let token: string | null = null;
  try {
    token = await lease("pipeline", 300);
    if (!token) return Response.json({ ok: false, error: "Another pipeline is running. Wait for it to finish, then retry.", events }, { status: 429 });
    const result = await fn((e) => events.push(e));
    return Response.json({ ok: true, result, events });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message.slice(0, 400) : "failed", events }, { status: 400 });
  } finally {
    if (token) await release("pipeline", token).catch(() => {});
  }
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}
