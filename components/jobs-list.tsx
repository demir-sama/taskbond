"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import config from "@/config/testnet-public.json";
import type { JobView } from "@/lib/types";
import { jobTone } from "./job-board";
import { near, Pill } from "./ui";

export function JobsList() {
  const [jobs, setJobs] = useState<JobView[] | null>(null);
  const [tab, setTab] = useState<"all" | "open" | "paid">("all");
  useEffect(() => {
    fetch("/api/jobs", { cache: "no-store" }).then((r) => r.json()).then((b) => setJobs(b.jobs)).catch(() => setJobs([]));
  }, []);
  const shown = (jobs ?? []).filter((j) => tab === "all" || (tab === "open" ? j.status === "Open" : j.status === "Paid"));
  return (
    <div className="mt-10">
      <div className="inline-flex rounded-full border border-line-strong p-1">
        {(["all", "open", "paid"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-full px-4 py-1.5 text-sm capitalize ${tab === t ? "bg-white/[0.08] text-fg" : "text-mute hover:text-fg"}`}>{t}</button>
        ))}
      </div>
      <div className="mt-6 overflow-hidden rounded-2xl border border-line">
        {!jobs && <div className="shimmer h-40" />}
        {jobs && shown.length === 0 && <div className="p-10 text-center text-sm text-mute">No jobs here yet.</div>}
        {shown.map((j) => (
          <Link key={j.id} href={`/jobs/${j.id}`} className="group grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-line bg-base px-5 py-4 transition-colors last:border-b-0 hover:bg-panel sm:grid-cols-[4rem_1fr_9rem_8rem_7rem]">
            <span className="mono text-xs text-dim">#{j.id}</span>
            <div className="min-w-0">
              <div className="truncate font-medium group-hover:text-mint">{j.title}</div>
              <div className="mono truncate text-[11px] text-dim">{j.poster === config.accounts.poster ? "scripted demo poster" : j.poster}</div>
            </div>
            <span className="mono hidden text-sm text-soft sm:block">{near(j.escrow_amount, 3)} Ⓝ</span>
            <span className="mono hidden text-xs text-mute sm:block">{j.agent_count} agents</span>
            <span className="justify-self-end"><Pill tone={jobTone(j.status)} dot>{j.status}</Pill></span>
          </Link>
        ))}
      </div>
    </div>
  );
}
