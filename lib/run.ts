import "server-only";
import { DEMO_AGENTS, DEMO_JOB } from "./agents";
import { aiMode } from "./nearai";
import { balance, send, view } from "./near-server";
import { guardAgents, loadUntil, pack, payout, reviewJob, runWorkers, type Emit } from "./engine";
import { AGENT_STORAGE, GAS_RESERVE, JOB_STORAGE, PUBLIC, formatNear } from "./public";
import type { ConfigView, JobView } from "./types";

export const DEMO_REWARD = 100_000_000_000_000_000_000_000n; // 0.1 NEAR
const HOUR_NS = 3_600_000_000_000n;

/** Refuse overlapping or rapid-fire runs. State comes from chain, so it survives serverless cold starts. */
export async function runGate(): Promise<{ ok: true } | { ok: false; reason: string; jobId?: number }> {
  const jobs = await view<JobView[]>("list_jobs");
  const cfg = await view<ConfigView>("get_config");
  const now = BigInt(cfg.now);
  const mine = jobs.filter((j) => j.poster === PUBLIC.accounts.poster);
  const last = mine[mine.length - 1];
  if (last) {
    const created = BigInt(last.deadline_ns) - HOUR_NS;
    const ageS = Number((now - created) / 1_000_000_000n);
    if (last.status === "Open" && ageS < 240) return { ok: false, reason: `Run #${last.id} is still in progress. Watch it instead.`, jobId: last.id };
    if (ageS < 60) return { ok: false, reason: `A run finished ${ageS}s ago. Next run opens in ${60 - ageS}s.`, jobId: last.id };
  }
  const recent = mine.filter((j) => now - (BigInt(j.deadline_ns) - HOUR_NS) < 24n * HOUR_NS);
  if (recent.length >= 40) return { ok: false, reason: "Daily scripted-run limit reached (40). Recorded runs stay browsable." };
  if ((await balance(PUBLIC.accounts.poster)) < 300_000_000_000_000_000_000_000n) return { ok: false, reason: "Demo poster is low on testnet NEAR." };
  return { ok: true };
}

export async function scriptedRun(emit: Emit) {
  const mode = aiMode();
  const cfg = await view<ConfigView>("get_config");
  const worst = BigInt(cfg.worst_case);
  const step = (id: string, status: "running" | "done" | "error" | "skipped", detail?: string) => emit({ type: "step", id, status, detail });
  let jobId: number | null = null;
  try {
    // 1. Poster escrows the reward.
    step("job", "running", `Escrowing ${formatNear(DEMO_REWARD, 2)} NEAR reward + storage bond`);
    const deadline = (BigInt(cfg.now) + HOUR_NS).toString();
    const created = await send(PUBLIC.accounts.poster, "Poster escrows the reward", [
      { method: "create_job", args: { title: DEMO_JOB.title, topic: DEMO_JOB.topic, source_pack_hash: pack().packHash, deadline_ns: deadline }, deposit: DEMO_REWARD + JOB_STORAGE },
    ]);
    emit({ type: "tx", ...created.tx });
    jobId = Number(created.value);
    emit({ type: "job", jobId });
    step("job", "done", `Job #${jobId} holds ${formatNear(DEMO_REWARD, 2)} NEAR in escrow`);

    // 2. Three agents join with a name, a system prompt, and a capped deposit.
    step("join", "running", "Mal, Ada and Bas deposit and register");
    const cap = worst * 3n;
    const deposit = AGENT_STORAGE + GAS_RESERVE + cap;
    const regs = await Promise.all(
      DEMO_AGENTS.map((a) =>
        send((PUBLIC.accounts as Record<string, string>)[a.key], `${a.name} joins with a capped deposit`, [
          { method: "register_agent", args: { job_id: jobId, name: a.name, prompt: a.prompt }, deposit },
        ]),
      ),
    );
    regs.forEach((r) => emit({ type: "tx", ...r.tx }));
    step("join", "done", `3 agents joined · inference cap ${formatNear(cap, 4)} NEAR each (hard limit in contract)`);

    // 3. Guard.
    step("guard", "running", mode === "live" ? "NEAR AI Guardrail Agent is reading each system prompt" : "Deterministic guard (NEAR AI key not set on this host)");
    let { job, agents } = await loadUntil(jobId, (d) => d.agents.length === DEMO_AGENTS.length);
    const verdicts = await guardAgents(job!, agents, emit);
    const rejected = [...verdicts.values()].filter((v) => !v.approved).length;
    step("guard", "done", `${verdicts.size - rejected} approved · ${rejected} rejected before spending`);

    // 4. Workers.
    ({ job, agents } = await loadUntil(jobId, (d) => d.agents.every((a) => a.status !== "PendingGuard")));
    const keyOf = (a: { owner: string }) => DEMO_AGENTS.find((d) => (PUBLIC.accounts as Record<string, string>)[d.key] === a.owner)?.key ?? "bas";
    step("work", "running", mode === "live" ? "Approved agents research the pinned NEAR docs on NEAR AI" : "Approved agents submit fixture research");
    const work = await runWorkers(job!, agents, emit, keyOf);
    const subs = await Promise.all(
      agents
        .filter((a) => work.has(a.id))
        .map((a) => {
          const w = work.get(a.id)!;
          return send(a.owner, `${a.name} submits result + evidence`, [{ method: "submit_result", args: { agent_id: a.id, summary: w.output.summary, steps: w.output.steps, evidence: w.evidence } }]);
        }),
    );
    subs.forEach((s) => emit({ type: "tx", ...s.tx }));
    step("work", subs.length ? "done" : "error", `${subs.length} submissions · ${[...work.values()].map((w) => `${w.valid} verified quotes`).join(" · ")}`);
    if (!subs.length) throw new Error("No worker produced a submission. Escrow stays locked until the deadline refund.");

    // 5. Reviewer.
    ({ job, agents } = await loadUntil(jobId, (d) => d.agents.filter((a) => a.review === "Pending").length >= subs.length));
    step("review", "running", mode === "live" ? "NEAR AI Reviewer Agent is scoring the evidence" : "Deterministic reviewer rubric");
    const review = await reviewJob(job!, agents, emit);
    const names = new Map(agents.map((a) => [a.id, a.name]));
    const scoreText = [...review.scores.entries()].map(([id, s]) => `${names.get(id)} ${s.score}`).join(" · ");
    if (!review.winner) {
      step("review", "error", review.failed ? `Reviewer failed closed: ${review.failed}` : `No submission met the bar (${scoreText})`);
      throw new Error("No winner. The reward refunds to the poster after the deadline.");
    }
    step("review", "done", `${names.get(review.winner)} wins · ${scoreText}`);

    // 6. Payout.
    step("pay", "running", "Contract transfers the reward to the winner");
    const winner = agents.find((a) => a.id === review.winner)!;
    const before = await balance(winner.owner);
    await payout(jobId, emit);
    const after = await balance(winner.owner);
    const final = await view<JobView>("get_job", { job_id: jobId });
    step("pay", final.status === "Paid" ? "done" : "error", `${final.status} · ${winner.name} balance +${formatNear(after - before, 4)} NEAR`);

    // 7. Refund unspent deposits.
    step("refund", "running", "Every agent withdraws its unspent cap + gas reserve");
    const fresh = (await loadUntil(jobId, (d) => d.job?.status === "Paid")).agents;
    const refunds = await Promise.allSettled(
      fresh
        .filter((a) => BigInt(a.unspent) + BigInt(a.gas_reserve) > 0n)
        .map((a) => send(a.owner, `${a.name} withdraws unspent deposit`, [{ method: "withdraw_agent", args: { agent_id: a.id }, gas: 150_000_000_000_000n }], "FINAL")),
    );
    refunds.forEach((r) => r.status === "fulfilled" && emit({ type: "tx", ...r.value.tx }));
    const okRefunds = refunds.filter((r) => r.status === "fulfilled").length;
    step("refund", okRefunds === refunds.length ? "done" : "error", `${okRefunds}/${refunds.length} refunds settled on chain`);
    emit({ type: "done", jobId, ok: true });
  } catch (error) {
    emit({ type: "done", jobId, ok: false, error: error instanceof Error ? error.message.slice(0, 400) : "run failed" });
  }
}
