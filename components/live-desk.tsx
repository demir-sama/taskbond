"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import config from "@/config/testnet-public.json";
import type { JobView, RunEvent } from "@/lib/types";
import { AgentGrid, JobHeader, type JobDetail } from "./job-board";
import { Pill, Spinner, TxLink } from "./ui";

const STEPS = [
  { id: "job", title: "Escrow", body: "Poster locks the reward in the NEAR contract" },
  { id: "join", title: "Agents join", body: "Name, system prompt, capped NEAR deposit" },
  { id: "guard", title: "Guardrail", body: "NEAR AI rejects injection and fund-drain prompts" },
  { id: "work", title: "Research", body: "Approved agents cite the pinned sources" },
  { id: "review", title: "Review", body: "Reviewer scores evidence; contract binds hashes" },
  { id: "pay", title: "Payout", body: "Contract pays the single winner" },
  { id: "refund", title: "Refunds", body: "Unspent deposits go back to every agent" },
];

type StepState = { status: "idle" | "running" | "done" | "error" | "skipped"; detail?: string };
type Tx = Extract<RunEvent, { type: "tx" }>;
type Ai = Extract<RunEvent, { type: "ai" }>;

export function LiveDesk() {
  const [aiBlocker, setAiBlocker] = useState<string | null>(null);
  const [aiMode, setAiMode] = useState<"live" | "fixture">("live");
  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then((s) => { setAiMode(s.ai?.mode === "fixture" ? "fixture" : "live"); setAiBlocker(s.ai?.blocker ?? null); }).catch(() => {});
  }, []);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Record<string, StepState>>({});
  const [txs, setTxs] = useState<Tx[]>([]);
  const [ais, setAis] = useState<Ai[]>([]);
  const [message, setMessage] = useState<{ tone: "mint" | "coral" | "amber"; text: string } | null>(null);
  const [started, setStarted] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const jobRef = useRef<number | null>(null);

  const load = useCallback(async (id: number) => {
    const r = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
    if (r.ok) {
      const d = await r.json() as JobDetail;
      setDetail(d);
      if (!jobRef.current && d.run?.events) {
        setTxs(d.run.events.filter((e): e is Tx => e.type === "tx"));
        setAis(d.run.events.filter((e): e is Ai => e.type === "ai"));
      }
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/jobs", { cache: "no-store" });
        const { jobs } = (await r.json()) as { jobs: JobView[] };
        const demo = jobs.filter((j) => j.poster === config.accounts.poster);
        const pick = demo.find((j) => j.status === "Paid") ?? demo[0];
        if (pick) await load(pick.id);
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  useEffect(() => {
    if (!started) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 500);
    return () => clearInterval(t);
  }, [started]);

  async function run() {
    setRunning(true);
    setMessage(null);
    setSteps({});
    setTxs([]);
    setAis([]);
    setDetail(null);
    setStarted(Date.now());
    setElapsed(0);
    jobRef.current = null;
    try {
      const res = await fetch("/api/run", { method: "POST" });
      if (!res.ok || !res.body) {
        const b = await res.json().catch(() => ({}));
        setMessage({ tone: "amber", text: b.reason ?? `Run refused (${res.status}).` });
        if (b.jobId) await load(b.jobId);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let lastLoad = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as RunEvent;
          if (e.type === "step") setSteps((s) => ({ ...s, [e.id]: { status: e.status, detail: e.detail } }));
          if (e.type === "tx") {
            setTxs((t) => [...t, e]);
            if (jobRef.current && Date.now() - lastLoad > 1500) {
              lastLoad = Date.now();
              void load(jobRef.current);
            }
          }
          if (e.type === "ai") setAis((a) => [...a, e]);
          if (e.type === "job") {
            jobRef.current = e.jobId;
            void load(e.jobId);
          }
          if (e.type === "done") {
            if (e.jobId) await load(e.jobId);
            setMessage(e.ok ? { tone: "mint", text: `Run complete. Job #${e.jobId} paid its winner and refunded every unused deposit, all on NEAR testnet.` } : { tone: "coral", text: e.error ?? "Run stopped." });
          }
        }
      }
    } catch (e) {
      setMessage({ tone: "coral", text: e instanceof Error ? e.message : "Stream failed." });
    } finally {
      setRunning(false);
      setStarted(null);
    }
  }

  const liveCalls = ais.filter((a) => a.mode === "live" && !a.error);
  const tokens = liveCalls.reduce((n, a) => n + a.inputTokens + a.outputTokens, 0);
  const hasRun = Object.keys(steps).length > 0;

  return (
    <section id="desk" className="mx-auto max-w-7xl scroll-mt-20 px-5 pt-24">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <div className="eyebrow">Live desk · NEAR testnet</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-[2.6rem] sm:leading-[1.08]">
            Watch a swarm get hired, <span className="font-display italic font-normal text-mint">filtered</span>, and paid.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-mute">
            One click runs the whole job on chain: three agents join, the guardrail rejects the malicious one, two research on {aiMode === "live" ? "NEAR AI" : "fixture outputs"}, the reviewer scores the evidence, and the contract pays the winner. Every step is a real testnet transaction.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <button className="btn btn-primary" onClick={run} disabled={running} data-testid="run-demo">
            {running ? <><Spinner /> Running · {elapsed}s</> : aiMode === "live" ? aiBlocker ? "Retry live demo" : "Run the live demo" : "Run testnet demo · fixture AI"}
          </button>
          <span className="text-xs text-dim">~40–60s · server-signed demo accounts · {aiMode === "live" ? "live NEAR AI" : "fixture AI"}</span>
        </div>
      </div>

      {aiMode === "live" && aiBlocker && <p className="mt-5 break-words rounded-xl border border-amber/25 bg-amber/[0.05] px-4 py-3 text-sm leading-relaxed text-amber">Live NEAR AI is configured, but the provider blocked the last call: {aiBlocker.slice(0, 300)}. No result or payout was invented. After resolving the provider-side issue, use Retry live demo.</p>}

      {aiMode === "fixture" && <p className="mt-5 break-words rounded-xl border border-amber/25 bg-amber/[0.05] px-4 py-3 text-sm leading-relaxed text-amber">New runs on this host use clearly labelled fixture AI until a valid host-side NEAR AI key is configured. Recorded runs whose verdicts say NEAR AI and show nonzero settled token counts used the real model. Escrow, wallet actions, payouts and refunds are real testnet transactions in both modes.</p>}

      {message && (
        <div className={`mt-6 rounded-2xl border px-4 py-3 text-sm ${message.tone === "mint" ? "border-mint/25 bg-mint/[0.05] text-mint" : message.tone === "coral" ? "border-coral/25 bg-coral/[0.05] text-coral" : "border-amber/25 bg-amber/[0.05] text-amber"}`}>{message.text}</div>
      )}

      <div className="mt-10 grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <ol className="card p-2">
            {STEPS.map((s, i) => {
              const st = steps[s.id]?.status ?? (hasRun ? "idle" : detail && detail.job.status === "Paid" ? "done" : "idle");
              return (
                <li key={s.id} className={`relative flex gap-3 rounded-xl px-3 py-3 transition-colors ${st === "running" ? "bg-white/[0.04]" : ""}`}>
                  <div className="flex flex-col items-center">
                    <span className={`grid size-6 shrink-0 place-items-center rounded-full border text-[10px] mono ${st === "done" ? "border-mint/40 bg-mint/15 text-mint" : st === "error" ? "border-coral/40 bg-coral/15 text-coral" : st === "running" ? "border-iris/50 text-iris" : "border-line-strong text-dim"}`}>
                      {st === "done" ? "✓" : st === "error" ? "!" : st === "running" ? <Spinner className="size-2.5" /> : i + 1}
                    </span>
                    {i < STEPS.length - 1 && <span className={`mt-1 w-px flex-1 ${st === "done" ? "bg-mint/30" : "bg-line"}`} />}
                  </div>
                  <div className="min-w-0 pb-1">
                    <div className={`text-sm font-medium ${st === "idle" ? "text-soft" : "text-fg"}`}>{s.title}</div>
                    <div className="mt-0.5 text-xs leading-relaxed text-mute">{steps[s.id]?.detail ?? s.body}</div>
                  </div>
                </li>
              );
            })}
          </ol>

          {(ais.length > 0 || running) && (
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <span className="eyebrow !text-[10px]">AI calls</span>
                {liveCalls.length > 0 && <Pill tone="iris">{liveCalls.length} live · {tokens.toLocaleString()} tok</Pill>}
              </div>
              <ul className="mt-3 space-y-2">
                {ais.map((a, i) => (
                  <li key={i} className="flex items-start justify-between gap-2 text-xs animate-rise">
                    <span className="text-soft">
                      <span className="capitalize">{a.role}</span>
                      {a.agent ? ` · ${a.agent}` : ""}
                    </span>
                    <span className={`mono text-right ${a.error ? "text-coral" : "text-mute"}`}>
                      {a.error ? "failed closed" : a.mode === "live" ? `${a.inputTokens}→${a.outputTokens} · ${(a.ms / 1000).toFixed(1)}s` : "fixture"}
                    </span>
                  </li>
                ))}
                {running && <li className="shimmer h-3 rounded" />}
              </ul>
              {liveCalls[0] && <p className="mono mt-3 break-all text-[10px] text-dim">model {liveCalls[0].model} · id {liveCalls[liveCalls.length - 1].responseId}</p>}
            </div>
          )}

          {txs.length > 0 && (
            <div className="card max-h-80 overflow-auto p-4">
              <div className="eyebrow !text-[10px]">Receipts · {txs.length} transactions</div>
              <ul className="mt-3 space-y-2.5">
                {txs.map((t) => (
                  <li key={t.hash} className="animate-rise">
                    <div className="text-xs text-soft">{t.label}</div>
                    <TxLink hash={t.hash} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        <div className="min-w-0 space-y-5">
          {loading && <div className="card shimmer h-72" />}
          {!loading && !detail && !running && (
            <div className="card grid place-items-center p-12 text-center">
              <p className="max-w-sm text-sm text-mute">No run on this contract yet. Start one and watch the cards fill in.</p>
            </div>
          )}
          {running && !detail && <div className="card shimmer h-72" />}
          {detail && (
            <>
              {!hasRun && (
                <div className="flex items-center justify-between gap-3 text-xs text-mute">
                  <span>Latest recorded run, read live from the contract</span>
                  <Link href={`/jobs/${detail.job.id}`} className="hover:text-mint">Open job #{detail.job.id} →</Link>
                </div>
              )}
              <JobHeader d={detail} />
              <AgentGrid d={detail} />
            </>
          )}
        </div>
      </div>
    </section>
  );
}
