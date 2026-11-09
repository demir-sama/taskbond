"use client";

import { useState } from "react";
import type { AgentView, ReservationView } from "@/lib/types";
import { near, Pill, AccountLink } from "./ui";

const SOURCE_URL: Record<string, string> = {
  "account-model": "https://docs.near.org/protocol/accounts-contracts/account-model",
  "access-keys": "https://docs.near.org/protocol/accounts-contracts/access-keys",
  faucet: "https://docs.near.org/getting-started/faucet",
};

export function parseReason(reason: string) {
  const live = reason.startsWith("[NEAR AI]");
  const fixture = reason.startsWith("[fixture]");
  const text = reason.replace(/^\[(NEAR AI|fixture)\]\s*/, "");
  const score = text.match(/^(\d{1,3})\/100 · /);
  return { live, fixture, text: score ? text.slice(score[0].length) : text, score: score ? Number(score[1]) : null };
}

function citationsOf(evidence: string): { sourceId: string; quote: string }[] {
  try {
    return (JSON.parse(evidence) as { citations?: { sourceId: string; quote: string }[] }).citations ?? [];
  } catch {
    return [];
  }
}

export function agentPhase(a: AgentView, winnerId: number | null, jobStatus: string) {
  if (a.status === "PendingGuard") return { label: "Waiting for guard", tone: "amber" as const };
  if (a.status === "Rejected") return { label: "Rejected by guard", tone: "coral" as const };
  if (a.review === "Accepted" || a.id === winnerId) return { label: jobStatus === "Paid" ? "Winner · paid" : "Winner", tone: "mint" as const };
  if (a.review === "Rejected") return { label: "Not selected", tone: "mute" as const };
  if (a.review === "Pending") return { label: "Submitted · in review", tone: "iris" as const };
  return { label: "Approved · working", tone: "iris" as const };
}

function AiBadge({ live, fixture }: { live: boolean; fixture: boolean }) {
  if (live) return <Pill tone="iris">NEAR AI</Pill>;
  if (fixture) return <Pill tone="amber">Fixture</Pill>;
  return null;
}

function Usage({ r }: { r: ReservationView }) {
  const purpose = r.purpose === "Guard" ? "Guard" : r.purpose === "Worker" ? "Research" : r.purpose;
  const live = r.settled_input + r.settled_output > 0;
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-mute">{purpose} call</span>
      <span className="mono text-soft">
        {r.status === "Settled" ? (live ? `${r.settled_input.toLocaleString()} in · ${r.settled_output.toLocaleString()} out` : "0 tokens (no model call)") : r.status}
        <span className="text-dim"> · {near(r.settled_cost, 6)} Ⓝ</span>
      </span>
    </div>
  );
}

export function AgentCard({ a, usage, winnerId, jobStatus, delay = 0, me }: { a: AgentView; usage: ReservationView[]; winnerId: number | null; jobStatus: string; delay?: number; me?: string | null }) {
  const [showPrompt, setShowPrompt] = useState(a.status === "Rejected");
  const phase = agentPhase(a, winnerId, jobStatus);
  const guard = a.guard_reason ? parseReason(a.guard_reason) : null;
  const review = a.review_reason ? parseReason(a.review_reason) : null;
  const cites = citationsOf(a.evidence);
  const cap = BigInt(a.cap);
  const spent = BigInt(a.spent);
  const reserved = BigInt(a.reserved);
  const refunded = BigInt(a.unspent) === 0n && BigInt(a.gas_reserve) === 0n && BigInt(a.refund_locked) === 0n;
  const pct = (v: bigint) => (cap > 0n ? Math.max(0.5, Number((v * 10000n) / cap) / 100) : 0);
  const rejected = a.status === "Rejected";
  const winner = phase.tone === "mint";
  return (
    <article
      className={`card relative flex flex-col overflow-hidden p-5 animate-rise ${winner ? "border-mint/35 shadow-[0_0_0_1px_rgb(76_242_176/0.15),0_30px_80px_-40px_rgb(76_242_176/0.5)]" : rejected ? "border-coral/25" : ""}`}
      style={{ animationDelay: `${delay}ms` }}
      data-testid={`agent-${a.name.toLowerCase()}`}
    >
      {winner && <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-mint to-transparent" />}
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`grid size-10 place-items-center rounded-xl border text-sm font-semibold ${rejected ? "border-coral/30 bg-coral/10 text-coral" : winner ? "border-mint/30 bg-mint/10 text-mint" : "border-line-strong bg-white/[0.03] text-soft"}`}>
            {a.name.slice(0, 2)}
          </div>
          <div>
            <div className="flex items-center gap-2 font-semibold">
              {a.name}
              {me && a.owner === me && <Pill tone="iris">You</Pill>}
            </div>
            <AccountLink id={a.owner} className="text-[11px] text-dim" />
          </div>
        </div>
        <Pill tone={phase.tone} dot pulse={phase.tone === "amber" || phase.label.includes("working")}>{phase.label}</Pill>
      </header>

      <button onClick={() => setShowPrompt((s) => !s)} className="mt-4 flex items-center gap-1.5 text-left text-xs text-mute hover:text-soft">
        <span className={`transition-transform ${showPrompt ? "rotate-90" : ""}`}>›</span> System prompt
      </button>
      {showPrompt && <pre className={`mono mt-2 whitespace-pre-wrap rounded-xl border p-3 text-[11.5px] leading-relaxed ${rejected ? "border-coral/20 bg-coral/[0.04] text-coral/90" : "border-line bg-black/40 text-soft"}`}>{a.prompt}</pre>}

      {guard && (
        <div className={`mt-4 rounded-xl border p-3.5 ${guard.text.startsWith("Rejected") ? "border-coral/25 bg-coral/[0.05]" : "border-line bg-white/[0.02]"}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="eyebrow !text-[10px]">Guardrail verdict</span>
            <AiBadge live={guard.live} fixture={guard.fixture} />
          </div>
          <p className={`mt-2 text-[13px] leading-relaxed ${guard.text.startsWith("Rejected") ? "text-coral" : "text-soft"}`}>{guard.text}</p>
        </div>
      )}

      {a.summary && (
        <div className="mt-4">
          <div className="eyebrow !text-[10px]">Result</div>
          <p className="mt-2 text-[13.5px] leading-relaxed text-soft">{a.summary}</p>
          {a.steps.length > 0 && (
            <ol className="mt-3 space-y-1.5">
              {a.steps.map((s, i) => (
                <li key={i} className="flex gap-2 text-xs text-mute">
                  <span className="mono text-dim">{String(i + 1).padStart(2, "0")}</span>
                  {s}
                </li>
              ))}
            </ol>
          )}
          {cites.length > 0 && (
            <div className="mt-3 space-y-2">
              {cites.map((c, i) => (
                <blockquote key={i} className="rounded-lg border-l-2 border-mint/50 bg-mint/[0.03] py-2 pl-3 pr-2 text-xs leading-relaxed text-soft">
                  “{c.quote.replace(/\*\*|`/g, "")}”
                  <a href={SOURCE_URL[c.sourceId] ?? "#"} target="_blank" rel="noreferrer" className="mono mt-1 block text-[10.5px] text-mute hover:text-mint">
                    {c.sourceId} · verified exact quote ↗
                  </a>
                </blockquote>
              ))}
            </div>
          )}
          {a.summary && cites.length === 0 && <p className="mt-3 text-xs text-coral">No verified quotes in the evidence.</p>}
        </div>
      )}

      {review && (
        <div className={`mt-4 flex items-start gap-3 rounded-xl border p-3.5 ${winner ? "border-mint/25 bg-mint/[0.05]" : "border-line bg-white/[0.02]"}`}>
          {review.score != null && (
            <div className="relative grid size-12 shrink-0 place-items-center">
              <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke={winner ? "#4cf2b0" : "#8b9cff"} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(review.score / 100) * 97.4} 97.4`} />
              </svg>
              <span className="mono text-sm font-semibold">{review.score}</span>
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="eyebrow !text-[10px]">Reviewer</span>
              <AiBadge live={review.live} fixture={review.fixture} />
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-soft">{review.text}</p>
          </div>
        </div>
      )}

      <div className="mt-auto pt-5">
        <div className="flex items-center justify-between text-[11px] text-mute">
          <span>Inference cap</span>
          <span className="mono">{near(a.cap, 4)} Ⓝ</span>
        </div>
        <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="bg-iris" style={{ width: `${pct(spent)}%` }} />
          <div className="bg-amber" style={{ width: `${reserved > 0n ? pct(reserved) : 0}%` }} />
        </div>
        <div className="mt-3 space-y-1.5">
          {usage.map((r) => (
            <Usage key={r.id} r={r} />
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-[11px]">
          <span className="text-mute">Unused deposit</span>
          <span className={`mono ${refunded ? "text-mint" : "text-soft"}`}>{refunded ? "Refunded ✓" : `${near(BigInt(a.unspent) + BigInt(a.gas_reserve), 4)} Ⓝ ${rejected || jobStatus === "Paid" || jobStatus === "Refunded" ? "withdrawable" : "held"}`}</span>
        </div>
      </div>
    </article>
  );
}
