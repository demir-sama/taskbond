import "server-only";
import { neon } from "@neondatabase/serverless";
import type { AiResult } from "./nearai";

let initialized: Promise<void> | null = null;
function sql() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured. Live jobs fail closed without durable idempotency.");
  return neon(process.env.DATABASE_URL);
}

export async function initDb() {
  if (!initialized) initialized = (async () => {
    const q = sql();
    await q`CREATE TABLE IF NOT EXISTS tb_lease (name text PRIMARY KEY, token text NOT NULL, expires_at timestamptz NOT NULL)`;
    await q`CREATE TABLE IF NOT EXISTS tb_ai_call (id text PRIMARY KEY, status text NOT NULL, result jsonb, error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`;
    await q`CREATE TABLE IF NOT EXISTS tb_run (id uuid PRIMARY KEY, job_id bigint, mode text NOT NULL, status text NOT NULL DEFAULT 'running', events jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`;
  })().catch((e) => { initialized = null; throw e; });
  await initialized;
}

export async function lease(name: string, seconds = 300): Promise<string | null> {
  await initDb();
  const q = sql();
  const token = crypto.randomUUID();
  const rows = await q`INSERT INTO tb_lease(name,token,expires_at) VALUES(${name},${token},now()+${seconds}*interval '1 second')
    ON CONFLICT(name) DO UPDATE SET token=EXCLUDED.token,expires_at=EXCLUDED.expires_at WHERE tb_lease.expires_at < now() RETURNING token`;
  return rows.length ? token : null;
}

export async function release(name: string, token: string) {
  const q = sql();
  await q`DELETE FROM tb_lease WHERE name=${name} AND token=${token}`;
}

function encode(value: unknown) {
  return JSON.stringify(value, (_k, v) => (v instanceof Map ? { __map: [...v] } : v));
}
function decode(value: unknown) {
  return JSON.parse(JSON.stringify(value), (_k, v) => (v && typeof v === "object" && "__map" in v ? new Map(v.__map) : v));
}

/**
 * At-most-once model call, across concurrent Vercel instances and cold starts.
 * Result is persisted before usage is settled. A started/uncertain call is
 * NEVER retried automatically (it may already have billed). Its reservation
 * stays held and needs explicit reconciliation.
 */
export async function durableAi<T>(id: string, fn: () => Promise<AiResult<T>>): Promise<AiResult<T>> {
  await initDb();
  const q = sql();
  const inserted = await q`INSERT INTO tb_ai_call(id,status) VALUES(${id},'started') ON CONFLICT DO NOTHING RETURNING id`;
  if (!inserted.length) {
    const rows = await q`SELECT status,result FROM tb_ai_call WHERE id=${id}`;
    if (rows[0]?.status === "complete") return decode(rows[0].result) as AiResult<T>;
    throw new Error(`AI call ${id} is already started or uncertain. Not replayed; its reserve stays held for reconciliation.`);
  }
  try {
    const result = await fn();
    await q`UPDATE tb_ai_call SET status='complete',result=${encode(result)}::jsonb,updated_at=now() WHERE id=${id}`;
    return result;
  } catch (e) {
    await q`UPDATE tb_ai_call SET status='uncertain',error=${e instanceof Error ? e.message.slice(0, 400) : "failed"},updated_at=now() WHERE id=${id}`;
    throw e;
  }
}

export async function createRun(mode: string) {
  await initDb();
  const q = sql();
  const id = crypto.randomUUID();
  await q`INSERT INTO tb_run(id,mode) VALUES(${id},${mode})`;
  return id;
}

export async function saveRun(id: string, jobId: number | null, status: string, events: unknown[]) {
  const q = sql();
  await q`UPDATE tb_run SET job_id=${jobId},status=${status},events=${JSON.stringify(events)}::jsonb,updated_at=now() WHERE id=${id}`;
}

export async function latestRun(jobId: number) {
  await initDb();
  const q = sql();
  const rows = await q`SELECT id,mode,status,events,created_at,updated_at FROM tb_run WHERE job_id=${jobId} ORDER BY created_at DESC LIMIT 1`;
  return rows[0] ?? null;
}

/** Non-secret outcome of the last model request; lets the UI distinguish configured from actually usable. */
export async function lastAiState(): Promise<{ status: string; error: string | null } | null> {
  await initDb();
  const q = sql();
  const rows = await q`SELECT status,error FROM tb_ai_call ORDER BY updated_at DESC LIMIT 1`;
  return rows[0] ? { status: String(rows[0].status), error: rows[0].error == null ? null : String(rows[0].error).replace(" (credits exhausted)", " (billing authorization required)") } : null;
}
