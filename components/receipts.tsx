"use client";

import type { RunEvent } from "@/lib/types";
import { TxLink, Pill } from "./ui";

function providerMessage(raw: string) {
  const text = raw.replace(" (credits exhausted)", " (billing authorization required)");
  const split = text.indexOf(": {");
  if (split < 0) return text;
  try {
    const detail = JSON.parse(text.slice(split + 2)) as { error?: { message?: unknown } };
    return typeof detail.error?.message === "string" ? `${text.slice(0, split)}: ${detail.error.message}` : text;
  } catch {
    return text;
  }
}

export function Receipts({ events }: { events: RunEvent[] }) {
  const txs = events.filter((e) => e.type === "tx");
  const ais = events.filter((e) => e.type === "ai");
  if (!txs.length && !ais.length) return null;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="card p-5">
        <div className="flex items-center justify-between gap-3"><span className="eyebrow">Transaction receipts</span><Pill>{txs.length} on NEAR testnet</Pill></div>
        <ul className="mt-4 space-y-2.5">
          {txs.map((t) => (
            <li key={t.hash} className="flex items-center justify-between gap-3 border-b border-line pb-2.5 last:border-b-0 last:pb-0">
              <span className="text-xs text-soft">{t.label}</span><TxLink hash={t.hash} />
            </li>
          ))}
        </ul>
      </div>
      <div className="card p-5">
        <div className="flex items-center justify-between gap-3"><span className="eyebrow">NEAR AI receipts</span><Pill tone="iris">{ais.filter((a) => a.mode === "live" && !a.error).length} live calls</Pill></div>
        <ul className="mt-4 space-y-3">
          {ais.map((a, i) => (
            <li key={i} className="border-b border-line pb-3 last:border-b-0">
              <div className="flex items-center justify-between text-xs"><span className="capitalize text-soft">{a.role}{a.agent ? ` · ${a.agent}` : ""}</span><span className="mono text-mute">{a.inputTokens}→{a.outputTokens} tokens · {(a.ms / 1000).toFixed(1)}s</span></div>
              <div className="mono mt-1 break-all text-[10px] text-dim">{a.mode === "live" ? a.model : "fixture"} · {a.responseId ?? "no model call"}</div>
              {a.error && <div className="mt-1 text-xs text-coral [overflow-wrap:anywhere]">Failed closed: {providerMessage(a.error)}</div>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
