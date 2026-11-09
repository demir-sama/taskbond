"use client";

import type { AgentView, JobView, ReservationView, RunEvent } from "@/lib/types";
import { AgentCard } from "./agent-card";
import { near, Pill, AccountLink } from "./ui";

export type JobDetail = { job: JobView; agents: AgentView[]; reservations: Record<string, ReservationView[]>; review: ReservationView[]; run?: { status: string; events: RunEvent[] } | null };

export function jobTone(status: string) {
  if (status === "Paid") return "mint" as const;
  if (status === "Refunded") return "mute" as const;
  if (status.includes("Flight")) return "amber" as const;
  return "iris" as const;
}

export function JobHeader({ d, compact = false }: { d: JobDetail; compact?: boolean }) {
  const { job } = d;
  const winner = d.agents.find((a) => a.id === job.winner_agent_id);
  const reviewTokens = d.review.reduce((n, r) => n + r.settled_input + r.settled_output, 0);
  return (
    <div className="card-strong p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mono text-xs text-mute">Job #{job.id}</span>
        <Pill tone={jobTone(job.status)} dot>{job.status === "Open" ? "Open · escrow locked" : job.status}</Pill>
        {job.status === "Paid" && <Pill tone="mint">Evidence approved</Pill>}
      </div>
      <h3 className={`mt-3 font-semibold tracking-tight ${compact ? "text-xl" : "text-2xl sm:text-3xl"}`}>{job.title}</h3>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-mute">{job.topic}</p>
      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
        <div>
          <dt className="eyebrow !text-[10px]">Escrowed reward</dt>
          <dd className="mono mt-1.5 text-lg text-fg">{near(job.escrow_amount, 3)} Ⓝ</dd>
        </div>
        <div>
          <dt className="eyebrow !text-[10px]">Agents</dt>
          <dd className="mono mt-1.5 text-lg text-fg">{job.agent_count}</dd>
        </div>
        <div>
          <dt className="eyebrow !text-[10px]">Winner</dt>
          <dd className="mt-1.5 text-sm text-fg">{winner ? <span className="font-semibold text-mint">{winner.name} · {job.score}/100</span> : <span className="text-mute">—</span>}</dd>
        </div>
        <div>
          <dt className="eyebrow !text-[10px]">Poster</dt>
          <dd className="mt-1.5 text-xs text-soft"><AccountLink id={job.poster} /></dd>
        </div>
      </dl>
      {job.status === "Paid" && winner && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-mint/25 bg-mint/[0.05] px-4 py-3.5">
          <div className="text-sm">
            <span className="text-mint">Paid {near(job.escrow_amount, 3)} NEAR</span>
            <span className="text-soft"> to </span>
            <AccountLink id={winner.owner} className="text-soft" />
          </div>
          <span className="mono text-[11px] text-mute">result {job.result_hash?.slice(0, 10)}… · evidence {job.evidence_hash?.slice(0, 10)}…</span>
        </div>
      )}
      {reviewTokens > 0 && <p className="mono mt-3 text-[11px] text-dim">Reviewer call: {reviewTokens.toLocaleString()} tokens settled on chain from the operator budget</p>}
    </div>
  );
}

export function AgentGrid({ d, me }: { d: JobDetail; me?: string | null }) {
  const order = (a: AgentView) => (a.status === "Rejected" ? 0 : a.id === d.job.winner_agent_id ? 1 : 2);
  const agents = d.agents.slice().sort((a, b) => order(a) - order(b) || a.id - b.id);
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {agents.map((a, i) => (
        <AgentCard key={a.id} a={a} usage={d.reservations[String(a.id)] ?? []} winnerId={d.job.winner_agent_id} jobStatus={d.job.status} delay={i * 80} me={me} />
      ))}
      {agents.length === 0 && <div className="card col-span-full p-8 text-center text-sm text-mute">No agents have joined this job yet.</div>}
    </div>
  );
}
