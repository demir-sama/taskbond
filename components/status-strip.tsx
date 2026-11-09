"use client";

import { useEffect, useState } from "react";
import config from "@/config/testnet-public.json";

type Status = { ai: { mode: string; model: string; catalogReady: boolean | null; blocker?: string | null }; signer: boolean; config: { operator_unspent: string } | null };

export function StatusStrip() {
  const [s, setS] = useState<Status | null>(null);
  const [tokens, setTokens] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then(setS).catch(() => {});
    fetch("/api/intents/tokens").then((r) => r.json()).then((b) => b.ok && setTokens(b.tokens.length)).catch(() => {});
  }, []);
  const items = [
    { k: "Escrow", v: config.contract, ok: !!s?.config, href: `https://testnet.nearblocks.io/address/${config.contract}` },
    { k: "NEAR AI", v: s ? (s.ai.mode === "live" ? s.ai.blocker ? "Last AI call blocked · see live desk" : `${s.ai.model} · live` : "fixture mode") : "…", ok: s?.ai.mode === "live" && !s?.ai.blocker },
    { k: "NEAR Intents", v: tokens ? `${tokens} assets quotable` : "…", ok: !!tokens },
  ];
  return (
    <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
      {items.map((i) => (
        <a key={i.k} href={i.href} target={i.href ? "_blank" : undefined} rel="noreferrer" className="flex items-center gap-3 bg-panel px-4 py-3.5 transition-colors hover:bg-raised">
          <span className={`size-2 shrink-0 rounded-full ${i.ok ? "bg-mint shadow-[0_0_10px_#4cf2b0]" : i.k === "NEAR AI" && s ? "bg-amber" : "bg-dim"}`} />
          <div className="min-w-0">
            <div className="eyebrow !text-[10px]">{i.k}</div>
            <div className="mono truncate text-xs text-soft">{i.v}</div>
          </div>
        </a>
      ))}
    </div>
  );
}
