"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useWallet } from "./wallet";
import { Spinner, TxLink } from "./ui";

const JOB_STORAGE = 30_000_000_000_000_000_000_000n;

function yocto(n: string) {
  const [w, f = ""] = n.split(".");
  return BigInt(w || "0") * 10n ** 24n + BigInt((f + "0".repeat(24)).slice(0, 24) || "0");
}

export function PostForm() {
  const w = useWallet();
  const router = useRouter();
  const [title, setTitle] = useState("How do NEAR access keys limit what an app can do?");
  const [topic, setTopic] = useState("Explain full-access vs function-call keys, what a function-call key cannot do, and how a developer funds a testnet account. Cite the pinned NEAR docs.");
  const [reward, setReward] = useState("0.1");
  const [hours, setHours] = useState("24");
  const [status, setStatus] = useState<{ packHash: string; sources: { id: string; url: string }[]; config: { now: string } } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; hash?: string } | null>(null);
  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then(setStatus).catch(() => {});
  }, []);
  let r = 0n;
  try { r = yocto(reward); } catch { r = 0n; }
  const valid = r >= 100_000_000_000_000_000_000_000n && title.trim().length > 3 && topic.trim().length > 10 && Number(hours) >= 1 && Number(hours) <= 168;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!w.accountId) return w.open();
    if (!status) return;
    setBusy(true);
    setMsg(null);
    try {
      const deadline = (BigInt(Date.now()) * 1_000_000n + BigInt(Math.round(Number(hours) * 3600)) * 1_000_000_000n).toString();
      const res = await w.call({ method: "create_job", args: { title: title.trim(), topic: topic.trim(), source_pack_hash: status.packHash, deadline_ns: deadline }, deposit: (r + JOB_STORAGE).toString() });
      if (res.redirected) return;
      setMsg({ ok: true, text: `Job #${res.value} is live with ${reward} NEAR in escrow.`, hash: res.hash ?? undefined });
      if (typeof res.value === "number") setTimeout(() => router.push(`/jobs/${res.value}`), 1200);
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message.slice(0, 260) : "Transaction failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card-strong space-y-5 p-5 sm:p-6" data-testid="post-form">
      <div>
        <label className="eyebrow !text-[10px]">Title</label>
        <input className="field mt-2" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label className="eyebrow !text-[10px]">Research brief</label>
        <textarea className="field mt-2 min-h-28 resize-y leading-relaxed" maxLength={400} value={topic} onChange={(e) => setTopic(e.target.value)} />
        <div className="mono mt-1 text-right text-[10px] text-dim">{topic.length}/400</div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="eyebrow !text-[10px]">Reward (NEAR, min 0.1)</label>
          <input className="field mono mt-2" inputMode="decimal" value={reward} onChange={(e) => setReward(e.target.value.replace(/[^0-9.]/g, ""))} />
        </div>
        <div>
          <label className="eyebrow !text-[10px]">Deadline (hours, max 168)</label>
          <input className="field mono mt-2" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value.replace(/[^0-9]/g, ""))} />
        </div>
      </div>
      <div className="rounded-xl border border-line bg-black/30 p-4">
        <div className="eyebrow !text-[10px]">Pinned source pack</div>
        <ul className="mt-2 space-y-1">
          {(status?.sources ?? []).map((s) => (
            <li key={s.id} className="flex min-w-0 justify-between gap-3 text-xs">
              <span className="text-soft">{s.id}</span>
              <a href={s.url} target="_blank" rel="noreferrer" className="mono min-w-0 truncate text-dim hover:text-mint">{s.url.replace("https://", "")}</a>
            </li>
          ))}
        </ul>
        <div className="mono mt-2 break-all text-[10px] text-dim">sha256 {status?.packHash ?? "…"}</div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <div className="text-xs text-mute">
          You sign <span className="mono text-soft">{reward || "0"} + 0.03</span> NEAR (reward + storage bond)
        </div>
        <button className="btn btn-primary" disabled={busy || (!!w.accountId && (!valid || !status))} data-testid="post-submit">
          {busy ? <Spinner /> : w.accountId ? "Sign & escrow" : "Connect wallet to post"}
        </button>
      </div>
      {msg && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${msg.ok ? "border-mint/25 bg-mint/[0.05] text-mint" : "border-coral/25 bg-coral/[0.05] text-coral"}`}>
          {msg.text} {msg.hash && <TxLink hash={msg.hash} />}
        </div>
      )}
      <p className="text-[11px] leading-relaxed text-dim">Need testnet NEAR? Create a testnet account in Meteor or MyNearWallet, or use the <a className="underline hover:text-mint" href="https://docs.near.org/getting-started/faucet" target="_blank" rel="noreferrer">NEAR faucet</a>.</p>
    </form>
  );
}
