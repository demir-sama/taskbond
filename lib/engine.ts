import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  GUARD_SCHEMA, GUARD_SYSTEM, guardUser, fixtureGuard,
  WORKER_SCHEMA, workerSystem, workerUser, parseWorkerWith, fixtureWork, evidenceJson,
  REVIEWER_SCHEMA, REVIEWER_SYSTEM, reviewerUser, parseReview, fixtureReview, pickWinner,
  type PackSource, type Submission, type WorkerOutput,
} from "./agents";
import { durableAi } from "./db";
import { aiMode, chatJson, parseGuardJson, NEAR_AI_MODEL } from "./nearai";
import { send, view, type TxRef } from "./near-server";
import { PUBLIC } from "./public";
import { SOURCE_INDEX, sha256 } from "./sources";
import type { AgentView, JobView, ReservationView, RunEvent } from "./types";

export type Emit = (event: RunEvent) => void;

let packCache: { sources: PackSource[]; packHash: string } | null = null;
export function pack() {
  if (!packCache) {
    const sources = SOURCE_INDEX.map((e) => ({ id: e.id, url: e.url, body: readFileSync(path.join(process.cwd(), "sources", e.file), "utf8") }));
    const packHash = sha256(sources.map((s) => `${s.id}\n${sha256(s.body)}\n`).join(""));
    packCache = { sources, packHash };
  }
  return packCache;
}

const OPS = PUBLIC.accounts.operator;
const tag = (mode: string) => (mode === "live" ? "[NEAR AI]" : "[fixture]");

export async function reservationExists(id: string) {
  return (await view<ReservationView | null>("get_reservation", { reservation_id: id })) != null;
}

/** Guard: reserve worst case on the agent's own cap, call NEAR AI, settle actual tokens, record the decision. */
export async function guardAgents(job: JobView, agents: AgentView[], emit: Emit, prefix = "tb"): Promise<Map<number, { approved: boolean; reason: string }>> {
  const mode = aiMode();
  const pending = agents.filter((a) => a.status === "PendingGuard");
  const out = new Map<number, { approved: boolean; reason: string }>();
  if (!pending.length) return out;
  const ids = pending.map((a) => `${prefix}-guard-${a.id}`);
  for (const id of ids) if (await reservationExists(id)) throw new Error(`guard already reserved for ${id}`);
  const r = await send(OPS, "Reserve guard budget", ids.map((id, i) => ({ method: "reserve", args: { reservation_id: id, agent_id: pending[i].id, purpose: "Guard" } })));
  emit({ type: "tx", ...r.tx });
  const results = await Promise.all(
    pending.map(async (a, i) => {
      if (mode === "fixture") {
        const d = fixtureGuard(a.prompt);
        emit({ type: "ai", role: "guard", agent: a.name, mode, model: "deterministic policy", inputTokens: 0, outputTokens: 0, ms: 0, responseId: null });
        return { a, d, inTok: 0, outTok: 0 };
      }
      try {
        const res = await durableAi(ids[i], () => chatJson({ system: GUARD_SYSTEM, user: guardUser(job, a.prompt), schemaName: "taskbond_guard", schema: GUARD_SCHEMA, maxTokens: 220, parse: parseGuardJson }));
        emit({ type: "ai", role: "guard", agent: a.name, mode, model: res.model, inputTokens: res.inputTokens, outputTokens: res.outputTokens, ms: res.ms, responseId: res.responseId });
        return { a, d: res.value, inTok: res.inputTokens, outTok: res.outputTokens };
      } catch (error) {
        const msg = error instanceof Error ? error.message : "guard failed";
        emit({ type: "ai", role: "guard", agent: a.name, mode, model: NEAR_AI_MODEL, inputTokens: 0, outputTokens: 0, ms: 0, responseId: null, error: msg });
        return { a, d: { decision: "reject" as const, category: "other_abuse", reason: `Guard unavailable, failed closed. Reserve held for reconciliation: ${msg.slice(0, 90)}` }, inTok: 0, outTok: 0, uncertain: true };
      }
    }),
  );
  const calls = results.flatMap(({ a, d, inTok, outTok, ...rest }, i) => {
    const reason = `${tag(mode)} ${d.decision === "approve" ? "Approved" : `Rejected · ${d.category.replace(/_/g, " ")}`} · ${d.reason}`.slice(0, 280);
    out.set(a.id, { approved: d.decision === "approve", reason });
    return [
      ...("uncertain" in rest ? [] : [{ method: "settle", args: { reservation_id: ids[i], input_tokens: inTok, output_tokens: outTok } }]),
      { method: "record_guard", args: { agent_id: a.id, approved: d.decision === "approve", reason } },
    ];
  });
  const s = await send(OPS, "Settle guard usage + record decisions", calls);
  emit({ type: "tx", ...s.tx });
  return out;
}

/** Worker: reserve on the agent cap, call NEAR AI with the agent persona + pinned pack, settle, verify quotes. */
export async function runWorkers(job: JobView, agents: AgentView[], emit: Emit, keyOf: (a: AgentView) => string, prefix = "tb") {
  const mode = aiMode();
  const approved = agents.filter((a) => a.status === "Approved" && a.review === "None");
  const out = new Map<number, { output: WorkerOutput; evidence: string; valid: number; invalid: number }>();
  if (!approved.length) return out;
  const ids: string[] = [];
  for (const a of approved) {
    let id = "";
    for (let n = 1; n <= 3; n++) {
      const candidate = `${prefix}-work-${a.id}-${n}`;
      if (!(await reservationExists(candidate))) { id = candidate; break; }
    }
    if (!id) throw new Error(`worker budget for agent ${a.id} already used three times`);
    ids.push(id);
  }
  const r = await send(OPS, "Reserve worker budget", ids.map((id, i) => ({ method: "reserve", args: { reservation_id: id, agent_id: approved[i].id, purpose: "Worker" } })));
  emit({ type: "tx", ...r.tx });
  const { sources } = pack();
  const results = await Promise.all(
    approved.map(async (a, i) => {
      if (mode === "fixture") {
        emit({ type: "ai", role: "worker", agent: a.name, mode, model: "fixture output", inputTokens: 0, outputTokens: 0, ms: 0, responseId: null });
        return { a, output: fixtureWork(keyOf(a)), inTok: 0, outTok: 0 };
      }
      try {
        const res = await durableAi(ids[i], () => chatJson({ system: workerSystem(a.prompt), user: workerUser(job, sources), schemaName: "taskbond_work", schema: WORKER_SCHEMA, maxTokens: 900, parse: parseWorkerWith(sources) }));
        emit({ type: "ai", role: "worker", agent: a.name, mode, model: res.model, inputTokens: res.inputTokens, outputTokens: res.outputTokens, ms: res.ms, responseId: res.responseId });
        return { a, output: res.value, inTok: res.inputTokens, outTok: res.outputTokens };
      } catch (error) {
        const msg = error instanceof Error ? error.message : "worker failed";
        emit({ type: "ai", role: "worker", agent: a.name, mode, model: NEAR_AI_MODEL, inputTokens: 0, outputTokens: 0, ms: 0, responseId: null, error: msg });
        return { a, output: null, inTok: 0, outTok: 0 };
      }
    }),
  );
  const settleCalls = results.flatMap(({ output, inTok, outTok }, i) => output ? [{ method: "settle", args: { reservation_id: ids[i], input_tokens: inTok, output_tokens: outTok } }] : []);
  if (settleCalls.length) {
    const s = await send(OPS, "Settle worker usage", settleCalls);
    emit({ type: "tx", ...s.tx });
  }
  for (const { a, output } of results) {
    if (!output) continue;
    const ev = evidenceJson(sources, output);
    out.set(a.id, { output: { ...output, steps: output.steps.length ? output.steps : ["Read the pinned sources"] }, evidence: ev.text, valid: ev.valid.length, invalid: ev.invalid });
  }
  return out;
}

export function submissionOf(a: AgentView): Submission {
  let valid = 0;
  let invalid = 0;
  let quotes: string[] = [];
  try {
    const ev = JSON.parse(a.evidence) as { citations?: { sourceId: string; quote: string }[]; invalid?: number };
    const checked = evidenceJson(pack().sources, { summary: a.summary, steps: a.steps, citations: ev.citations ?? [] });
    valid = checked.valid.length;
    invalid = checked.invalid + (ev.invalid ?? 0);
    quotes = checked.valid.map((c) => c.quote);
  } catch {
    invalid = 1;
  }
  return { agentId: a.id, name: a.name, summary: a.summary, steps: a.steps, validCitations: valid, invalidCitations: invalid, quotes };
}

/** Reviewer: one bounded call scores every pending submission; the contract binds hashes and the winner. */
export async function reviewJob(job: JobView, agents: AgentView[], emit: Emit, prefix = "tb") {
  const mode = aiMode();
  const pending = agents.filter((a) => a.review === "Pending");
  if (!pending.length) throw new Error("no pending submissions to review");
  let id = "";
  for (let n = 1; n <= 3; n++) {
    const c = `${prefix}-review-${job.id}-${n}`;
    if (!(await reservationExists(c))) { id = c; break; }
  }
  if (!id) throw new Error("review budget for this job already used three times");
  const r = await send(OPS, "Reserve reviewer budget", [{ method: "reserve", args: { reservation_id: id, agent_id: 0, purpose: "Reviewer" } }]);
  emit({ type: "tx", ...r.tx });
  const subs = pending.map(submissionOf);
  let scores: Map<number, { score: number; reason: string }>;
  let inTok = 0;
  let outTok = 0;
  let failed: string | null = null;
  if (mode === "fixture") {
    scores = fixtureReview(subs);
    emit({ type: "ai", role: "reviewer", mode, model: "deterministic rubric", inputTokens: 0, outputTokens: 0, ms: 0, responseId: null });
  } else {
    try {
      const res = await durableAi(id, () => chatJson({ system: REVIEWER_SYSTEM, user: reviewerUser(job, subs), schemaName: "taskbond_review", schema: REVIEWER_SCHEMA, maxTokens: 400, parse: (raw) => parseReview(raw, subs.map((s) => s.agentId)) }));
      scores = res.value;
      inTok = res.inputTokens;
      outTok = res.outputTokens;
      emit({ type: "ai", role: "reviewer", mode, model: res.model, inputTokens: inTok, outputTokens: outTok, ms: res.ms, responseId: res.responseId });
    } catch (error) {
      failed = error instanceof Error ? error.message : "review failed";
      emit({ type: "ai", role: "reviewer", mode, model: NEAR_AI_MODEL, inputTokens: 0, outputTokens: 0, ms: 0, responseId: null, error: failed });
      scores = new Map();
    }
  }
  if (failed) {
    return { winner: null as number | null, scores, failed: `${failed}. Reserve held for reconciliation; no payout.` };
  }
  const winner = pickWinner(subs, scores);
  const calls = [
    { method: "settle", args: { reservation_id: id, input_tokens: inTok, output_tokens: outTok } },
    ...pending
      .slice()
      .sort((a, b) => Number(a.id === winner) - Number(b.id === winner))
      .map((a) => {
        const s = scores.get(a.id)!;
        return {
          method: "record_review",
          args: {
            agent_id: a.id,
            result_hash: a.result_hash,
            evidence_hash: a.evidence_hash,
            score: s.score,
            accept: a.id === winner,
            reason: `${tag(mode)} ${s.score}/100 · ${s.reason}`.slice(0, 280),
          },
        };
      }),
  ];
  const s = await send(OPS, winner ? "Record scores + accept winner" : "Record scores (no winner met the bar)", calls);
  emit({ type: "tx", ...s.tx });
  return { winner, scores, failed: null as string | null };
}

export async function payout(jobId: number, emit: Emit): Promise<TxRef> {
  const p = await send(OPS, "Pay the winner from escrow", [{ method: "payout_winner", args: { job_id: jobId }, gas: 200_000_000_000_000n }], "FINAL");
  emit({ type: "tx", ...p.tx });
  return p.tx;
}

/** RPC nodes lag a block or two behind a just-executed tx; poll until the state we expect is visible. */
export async function loadUntil(jobId: number, ok: (d: { job: JobView | null; agents: AgentView[] }) => boolean, timeoutMs = 15_000) {
  const until = Date.now() + timeoutMs;
  let d = await loadJob(jobId);
  while (!ok(d) && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 700));
    d = await loadJob(jobId);
  }
  return d;
}

export async function loadJob(jobId: number) {
  const [job, agents] = await Promise.all([view<JobView | null>("get_job", { job_id: jobId }), view<AgentView[]>("list_agents", { job_id: jobId })]);
  return { job, agents };
}
