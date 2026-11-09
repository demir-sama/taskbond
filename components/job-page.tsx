"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AgentGrid, JobHeader, type JobDetail } from "./job-board";
import { Receipts } from "./receipts";
import { JobActions } from "./job-actions";
import { useWallet } from "./wallet";

export function JobPage({ id }: { id: number }) {
  const w = useWallet();
  const [d, setD] = useState<JobDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [worst, setWorst] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
    if (!r.ok) {
      setErr(r.status === 404 ? "Job not found on this contract." : `Could not load job (${r.status}).`);
      return;
    }
    setD(await r.json());
  }, [id]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    fetch("/api/status").then((r) => r.json()).then((s) => setWorst(s.config?.worst_case ?? null)).catch(() => {});
    return () => clearTimeout(t);
  }, [load]);
  return (
    <div className="mx-auto max-w-7xl px-5 pt-10">
      <Link href="/jobs" className="text-sm text-mute hover:text-fg">← All jobs</Link>
      <div className="mt-5 space-y-5">
        {err && <div className="card p-8 text-center text-sm text-coral">{err}</div>}
        {!d && !err && <div className="card shimmer h-60" />}
        {d && (
          <>
            <JobHeader d={d} />
            <JobActions d={d} worstCase={worst} onChange={load} />
            <AgentGrid d={d} me={w.accountId} />
            {d.run && <Receipts events={d.run.events} />}
          </>
        )}
      </div>
    </div>
  );
}
