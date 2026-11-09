"use client";

import { useState } from "react";
import type { RunEvent } from "@/lib/types";
import type { JobDetail } from "./job-board";
import { useWallet } from "./wallet";
import { near, Pill, Spinner, TxLink } from "./ui";

const AGENT_STORAGE = 80_000_000_000_000_000_000_000n;
const GAS_RESERVE = 5_000_000_000_000_000_000_000n;

type Log = { tone: "mint" | "coral" | "mute" | "iris"; text: string; hash?: string };

function yocto(n: string) {
  const [w, f = ""] = n.split(".");
  return BigInt(w || "0") * 10n ** 24n + BigInt((f + "0".repeat(24)).slice(0, 24) || "0");
}

export function JobActions({ d, worstCase, onChange }: { d: JobDetail; worstCase: string | null; onChange: () => Promise<void> }) {
  const w = useWallet();
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<Log[]>([]);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("You are a careful researcher. Answer the job using only the pinned sources, cite exact snippets, and list your steps.");
  const [capNear, setCapNear] = useState("0.01");
  const [draft, setDraft] = useState<{ agentId: number; summary: string; steps: string[]; evidence: string; valid: number; invalid: number } | null>(null);
  const { job, agents } = d;
  const open = job.status === "Open";
  const mine = agents.filter((a) => w.accountId && a.owner === w.accountId);
  const pendingGuard = agents.filter((a) => a.status === "PendingGuard");
  const pendingReview = agents.filter((a) => a.review === "Pending");
  const worst = BigInt(worstCase ?? "2037760000000000000000");
  const cap = (() => { try { return yocto(capNear); } catch { return 0n; } })();
  const deposit = AGENT_STORAGE + GAS_RESERVE + cap;
  const capOk = cap >= worst * 2n;

  const push = (l: Log) => setLog((x) => [l, ...x].slice(0, 12));
  const events = (evs: RunEvent[]) => evs.forEach((e) => {
    if (e.type === "tx") push({ tone: "mute", text: e.label, hash: e.hash });
    if (e.type === "ai") push({ tone: e.error ? "coral" : "iris", text: `${e.role}${e.agent ? ` · ${e.agent}` : ""}: ${e.error ? `failed closed (${e.error.slice(0, 80)})` : e.mode === "live" ? `NEAR AI ${e.inputTokens}→${e.outputTokens} tokens` : "fixture"}` });
  });

  async function wallet(label: string, fn: () => Promise<{ hash: string | null; redirected: boolean }>) {
    setBusy(label);
    try {
      const r = await fn();
      if (r.redirected) push({ tone: "mute", text: `${label}: continue in your wallet, you'll return here.` });
      else push({ tone: "mint", text: `${label} confirmed`, hash: r.hash ?? undefined });
      await onChange();
    } catch (e) {
      push({ tone: "coral", text: `${label}: ${e instanceof Error ? e.message.slice(0, 220) : "failed"}` });
    } finally {
      setBusy(null);
    }
  }

  async function server(label: string, path: string, payload: Record<string, unknown>) {
    setBusy(label);
    try {
      const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const b = await r.json();
      events(b.events ?? []);
      if (!b.ok) push({ tone: "coral", text: `${label}: ${b.error}` });
      else push({ tone: "mint", text: `${label} done` });
      await onChange();
      return b;
    } catch (e) {
      push({ tone: "coral", text: `${label}: ${e instanceof Error ? e.message : "failed"}` });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card-strong p-5 sm:p-6" data-testid="job-actions">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Act on this job</div>
          <p className="mt-1 text-sm text-mute">Your wallet signs escrow actions. Taskbond&apos;s operator runs the NEAR AI guard, research and review calls, each paid from the on-chain reservation.</p>
        </div>
        {!w.accountId && <button className="btn btn-primary btn-sm" onClick={w.open}>Connect wallet</button>}
      </div>

      {open && w.accountId && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void wallet("Join as agent", () => w.call({ method: "register_agent", args: { job_id: job.id, name: name.trim(), prompt: prompt.trim() }, deposit: deposit.toString() }));
            }}
          >
            <div className="text-sm font-semibold">Join as an agent</div>
            <input className="field" placeholder="Agent name" maxLength={64} required value={name} onChange={(e) => setName(e.target.value)} />
            <textarea className="field min-h-28 resize-y text-[13px] leading-relaxed" maxLength={2000} required value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            <div className="grid grid-cols-[1fr_auto] items-end gap-3">
              <div>
                <label className="eyebrow !text-[10px]">Inference cap (NEAR)</label>
                <input className="field mono mt-1.5" value={capNear} onChange={(e) => setCapNear(e.target.value.replace(/[^0-9.]/g, ""))} />
              </div>
              <button className="btn btn-primary" disabled={!!busy || !name.trim() || !capOk}>{busy === "Join as agent" ? <Spinner /> : `Deposit ${near(deposit, 3)} Ⓝ`}</button>
            </div>
            <p className="text-[11px] leading-relaxed text-dim">
              Deposit = 0.08 storage bond + 0.005 gas reserve + your cap. Each model call reserves {near(worst, 4)} Ⓝ worst case; the cap must cover guard + research ({near(worst * 2n, 4)} Ⓝ).
              {!capOk && <span className="text-coral"> Cap too small.</span>} Unused cap and gas reserve are refundable.
            </p>
          </form>

          <div className="space-y-3">
            <div className="text-sm font-semibold">Run the pipeline</div>
            <Step
              title="Guardrail"
              body={pendingGuard.length ? `${pendingGuard.length} agent(s) waiting. NEAR AI reads each prompt and records approve/reject with a reason.` : "No agent is waiting for the guard."}
              action={pendingGuard.length > 0 && <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => void server("Guardrail", "/api/guard", { jobId: job.id })}>{busy === "Guardrail" ? <Spinner /> : "Run guard"}</button>}
            />
            {mine.filter((a) => a.status === "Approved" && a.review === "None").map((a) => (
              <Step
                key={a.id}
                title={`Research · ${a.name}`}
                body={draft?.agentId === a.id ? `Draft ready: ${draft.valid} verified quotes${draft.invalid ? `, ${draft.invalid} dropped` : ""}. Sign to submit it on chain.` : "Run your agent on NEAR AI against the pinned source pack, then sign the result."}
                action={
                  draft?.agentId === a.id ? (
                    <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => void wallet("Submit result", () => w.call({ method: "submit_result", args: { agent_id: a.id, summary: draft.summary, steps: draft.steps, evidence: draft.evidence } }))}>Sign & submit</button>
                  ) : (
                    <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={async () => { const b = await server(`Research ${a.name}`, "/api/work", { jobId: job.id, agentId: a.id }); if (b?.ok) setDraft(b.result); }}>{busy === `Research ${a.name}` ? <Spinner /> : "Run research"}</button>
                  )
                }
              />
            ))}
            {draft && mine.some((a) => a.id === draft.agentId && a.review === "None") && <p className="rounded-xl border border-line bg-black/30 p-3 text-xs leading-relaxed text-soft">{draft.summary}</p>}
            <Step
              title="Review & payout"
              body={pendingReview.length ? `${pendingReview.length} submission(s) waiting. The Reviewer Agent scores them; the contract pays the winner.` : job.winner_agent_id ? "Winner recorded." : "Waiting for submissions."}
              action={(pendingReview.length > 0 || job.winner_agent_id) && <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => void server("Review & pay", "/api/review", { jobId: job.id })}>{busy === "Review & pay" ? <Spinner /> : job.winner_agent_id ? "Pay winner" : "Review & pay"}</button>}
            />
            {!job.winner_agent_id && BigInt(job.deadline_ns) < BigInt(Date.now()) * 1_000_000n && (
              <Step title="Deadline reached" body="No accepted winner. Anyone can return the escrowed reward to the poster." action={<button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => void wallet("Refund expired job", () => w.call({ method: "refund_expired", args: { job_id: job.id }, gas: "200000000000000" }))}>Refund poster</button>} />
            )}
            {w.accountId === job.poster && agents.every((a) => a.review === "None") && (
              <Step title="Cancel job" body="Before any submission, the poster can cancel and get the reward back." action={<button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => void wallet("Cancel job", () => w.call({ method: "cancel_job", args: { job_id: job.id }, gas: "200000000000000" }))}>Cancel & refund</button>} />
            )}
          </div>
        </div>
      )}

      {w.accountId && mine.length > 0 && (
        <div className="mt-6 space-y-2 border-t border-line pt-5">
          <div className="text-sm font-semibold">Your agents</div>
          {mine.map((a) => {
            const left = BigInt(a.unspent) + BigInt(a.gas_reserve);
            const terminal = a.status === "Rejected" || job.status === "Paid" || job.status === "Refunded";
            return (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
                <div className="text-sm">
                  {a.name} <span className="text-mute">· {a.status}{a.review !== "None" ? ` · review ${a.review}` : ""}</span>
                </div>
                {left > 0n && terminal ? (
                  <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => void wallet("Withdraw deposit", () => w.call({ method: "withdraw_agent", args: { agent_id: a.id }, gas: "150000000000000" }))}>Withdraw {near(left, 4)} Ⓝ</button>
                ) : (
                  <Pill tone={left === 0n ? "mint" : "mute"}>{left === 0n ? "Refunded" : "Refund unlocks when job ends"}</Pill>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!open && !mine.length && <p className="mt-4 text-sm text-mute">This job is {job.status.toLowerCase()}. Browse open jobs or post a new one.</p>}

      {(log.length > 0 || w.lastRedirectTx || w.error) && (
        <ul className="mt-6 space-y-1.5 border-t border-line pt-4">
          {w.lastRedirectTx && <li className="text-xs text-mint">Wallet returned a transaction · <TxLink hash={w.lastRedirectTx} /></li>}
          {w.error && <li className="text-xs text-coral">Wallet: {w.error}</li>}
          {log.map((l, i) => (
            <li key={i} className={`text-xs ${l.tone === "mint" ? "text-mint" : l.tone === "coral" ? "text-coral" : l.tone === "iris" ? "text-iris" : "text-soft"}`}>
              {l.text} {l.hash && <TxLink hash={l.hash} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Step({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white/[0.015] px-4 py-3">
      <div className="min-w-0">
        <div className="text-[13px] font-medium">{title}</div>
        <div className="mt-0.5 text-xs leading-relaxed text-mute">{body}</div>
      </div>
      {action}
    </div>
  );
}
