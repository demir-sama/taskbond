"use client";

import { useEffect, useMemo, useState } from "react";
import { Pill, Spinner } from "./ui";

type Token = { assetId: string; decimals: number; blockchain: string; chain: string; symbol: string; price: number | null };
type Quote =
  | { ok: true; amountIn: string; amountInFormatted: string | null; amountInUsd: string | null; minAmountIn: string | null; amountOutFormatted: string | null; amountOutUsd: string | null; timeEstimate: number | null; correlationId: string | null; depositAddressDiscarded: boolean; requestedAt: string }
  | { ok: false; error: string };

const FEATURED = ["USDC:base", "USDC:arb", "USDC:sol", "ETH:eth", "SOL:sol", "BTC:btc", "USDT:tron", "ZEC:zec"];

function toYocto(n: string) {
  const [w, f = ""] = n.split(".");
  return (BigInt(w || "0") * 10n ** 24n + BigInt((f + "0".repeat(24)).slice(0, 24) || "0")).toString();
}

export function IntentsPanel({ defaultNear = "0.13", full = false }: { defaultNear?: string; full?: boolean }) {
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [tokErr, setTokErr] = useState<string | null>(null);
  const [asset, setAsset] = useState("nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near");
  const [amount, setAmount] = useState(defaultNear);
  const [recipient, setRecipient] = useState("demirsama.near");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [showReq, setShowReq] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    fetch("/api/intents/tokens")
      .then((r) => r.json())
      .then((b) => (b.ok ? setTokens(b.tokens) : setTokErr(b.error)))
      .catch((e) => setTokErr(String(e)));
  }, []);

  const token = tokens?.find((t) => t.assetId === asset);
  const featured = useMemo(() => (tokens ? FEATURED.map((k) => tokens.find((t) => `${t.symbol}:${t.blockchain}` === k)).filter(Boolean) as Token[] : []), [tokens]);
  const chains = useMemo(() => new Set(tokens?.map((t) => t.blockchain) ?? []).size, [tokens]);
  const list = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (tokens ?? []).filter((t) => !q || t.symbol.toLowerCase().includes(q) || t.chain.toLowerCase().includes(q)).sort((a, b) => a.chain.localeCompare(b.chain) || a.symbol.localeCompare(b.symbol));
  }, [tokens, filter]);

  async function getQuote() {
    setBusy(true);
    try {
      const r = await fetch("/api/intents/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ originAsset: asset, amountYocto: toYocto(amount), recipient }) });
      setQuote(await r.json());
    } catch (e) {
      setQuote({ ok: false, error: e instanceof Error ? e.message : "quote failed" });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!tokens) return;
    const t = setTimeout(() => void getQuote(), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset, amount, recipient, tokens]);

  const request = { dry: true, swapType: "EXACT_OUTPUT", originAsset: asset, destinationAsset: "nep141:wrap.near", amount: /^\d*\.?\d*$/.test(amount) ? toYocto(amount || "0") : "invalid", depositType: "ORIGIN_CHAIN", recipient, recipientType: "INTENTS", refundTo: recipient, refundType: "INTENTS" };

  return (
    <div className="card-strong overflow-hidden" data-testid="intents-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-iris/30 bg-iris/10 text-iris">⇄</span>
          <div className="min-w-0">
            <div className="text-sm font-semibold">Fund this job from any chain</div>
            <div className="text-xs text-mute">NEAR Intents · 1Click API · live mainnet quotes</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {tokens && <Pill tone="iris">{tokens.length} assets · {chains} chains</Pill>}
          <Pill tone="amber" dot>Dry quote · nothing settles</Pill>
        </div>
      </div>

      <div className={`grid gap-0 ${full ? "lg:grid-cols-[1.1fr_1fr]" : "md:grid-cols-2"}`}>
        <div className="space-y-4 p-5">
          <div>
            <label className="eyebrow !text-[10px]">Pay with</label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {featured.map((t) => (
                <button key={t.assetId} onClick={() => setAsset(t.assetId)} className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${asset === t.assetId ? "border-mint/50 bg-mint/10 text-mint" : "border-line-strong text-soft hover:bg-white/5"}`}>
                  {t.symbol} <span className="text-dim">· {t.chain}</span>
                </button>
              ))}
              {!tokens && !tokErr && <span className="shimmer h-7 w-64 rounded-full" />}
            </div>
            {tokErr && <p className="mt-2 text-xs text-coral">Token list unavailable: {tokErr}</p>}
            {tokens && (
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1.4fr]">
                <input className="field !py-2 text-sm" placeholder="Search any asset or chain" value={filter} onChange={(e) => setFilter(e.target.value)} />
                <select className="field !py-2 text-sm" value={asset} onChange={(e) => setAsset(e.target.value)} aria-label="Origin asset">
                  {list.map((t) => (
                    <option key={t.assetId} value={t.assetId}>
                      {t.symbol} on {t.chain}
                      {t.price ? ` · $${t.price}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="eyebrow !text-[10px]">Job escrow to fund (NEAR)</label>
              <input className="field mono mt-2" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
            </div>
            <div>
              <label className="eyebrow !text-[10px]">Intents account (mainnet)</label>
              <input className="field mono mt-2" value={recipient} onChange={(e) => setRecipient(e.target.value.trim().toLowerCase())} />
            </div>
          </div>
          <p className="text-xs leading-relaxed text-dim">Quote asks the solver network for the exact {amount || "0"} wNEAR output, so a poster on any chain knows what to send. Refunds route back to the same Intents account.</p>
        </div>

        <div className="border-t border-line bg-black/30 p-5 md:border-l md:border-t-0">
          <div className="flex items-center justify-between">
            <span className="eyebrow !text-[10px]">Live solver quote</span>
            <button className="btn btn-ghost btn-sm" onClick={getQuote} disabled={busy || !tokens}>{busy ? <Spinner /> : "Refresh"}</button>
          </div>
          {!quote && <div className="shimmer mt-4 h-28 rounded-xl" />}
          {quote && quote.ok && (
            <div className="mt-4 animate-rise" data-testid="intents-quote">
              <div className="text-xs text-mute">You would send</div>
              <div className="mono mt-1 text-2xl font-semibold text-fg sm:text-3xl">
                {quote.amountInFormatted ? Number(quote.amountInFormatted).toLocaleString(undefined, { maximumSignificantDigits: 6 }) : quote.amountIn} <span className="text-base text-soft">{token?.symbol}</span>
              </div>
              <div className="text-xs text-mute">on {token?.chain}{quote.amountInUsd ? ` · ≈ $${Number(quote.amountInUsd).toFixed(2)}` : ""}</div>
              <div className="my-4 flex items-center gap-3 text-dim">
                <span className="h-px flex-1 bg-line" />
                <span className="mono text-[10px] uppercase tracking-widest">solver · ~{quote.timeEstimate ?? "?"}s</span>
                <span className="h-px flex-1 bg-line" />
              </div>
              <div className="text-xs text-mute">Intents account receives</div>
              <div className="mono mt-1 text-xl text-mint">{quote.amountOutFormatted} wNEAR</div>
              <dl className="mt-4 space-y-1.5 text-[11px]">
                <div className="flex justify-between gap-3"><dt className="text-dim">Min input (base units)</dt><dd className="mono text-soft">{quote.minAmountIn ?? "—"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-dim">Deposit address</dt><dd className="mono text-soft">{quote.depositAddressDiscarded ? "discarded" : "not issued (dry)"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-dim">Quoted at</dt><dd className="mono text-soft">{new Date(quote.requestedAt).toLocaleTimeString()}</dd></div>
                {quote.correlationId && <div className="flex justify-between gap-3"><dt className="text-dim">1Click correlation</dt><dd className="mono truncate text-soft">{quote.correlationId.slice(0, 18)}…</dd></div>}
              </dl>
            </div>
          )}
          {quote && !quote.ok && (
            <div className="mt-4 rounded-xl border border-amber/25 bg-amber/[0.05] p-3.5 text-sm text-amber">
              Solver answered: {quote.error}
              <div className="mt-1 text-xs text-mute">Try a larger escrow or another asset. Nothing was settled.</div>
            </div>
          )}
          <button onClick={() => setShowReq((s) => !s)} className="mt-4 text-[11px] text-mute hover:text-soft">{showReq ? "Hide" : "Show"} exact request</button>
          {showReq && <pre className="mono mt-2 max-h-48 overflow-auto rounded-lg border border-line bg-black/50 p-3 text-[10.5px] leading-relaxed text-soft">{JSON.stringify(request, null, 2)}</pre>}
        </div>
      </div>
      <div className="border-t border-line px-5 py-3.5 text-xs leading-relaxed text-mute">
        <span className="text-amber">Why dry?</span> NEAR Intents runs on mainnet only and the escrow lives on testnet, so Taskbond prices the route live but never requests a deposit address. A real settlement would set <span className="mono text-soft">dry:false</span>, send the quoted amount to the issued deposit address, and poll <span className="mono text-soft">/v0/status</span> until SUCCESS.
      </div>
    </div>
  );
}
