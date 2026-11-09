"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { WalletSelector } from "@near-wallet-selector/core";
import type { WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import { actionCreators } from "@near-js/transactions";
import config from "@/config/testnet-public.json";

export type WalletCall = { method: string; args: Record<string, unknown>; deposit?: string; gas?: string };
export type WalletTxResult = { hash: string | null; value: unknown; redirected: boolean };

type Ctx = {
  ready: boolean;
  accountId: string | null;
  walletName: string | null;
  error: string | null;
  open: () => void;
  signOut: () => Promise<void>;
  call: (c: WalletCall) => Promise<WalletTxResult>;
  lastRedirectTx: string | null;
};

const WalletContext = createContext<Ctx | null>(null);

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet outside provider");
  return ctx;
}

function decodeValue(outcome: unknown): unknown {
  const status = (outcome as { status?: { SuccessValue?: string } })?.status;
  if (!status?.SuccessValue) return null;
  try {
    return JSON.parse(atob(status.SuccessValue));
  } catch {
    return null;
  }
}

function failureOf(outcome: unknown): string | null {
  const o = outcome as { status?: { Failure?: unknown }; receipts_outcome?: { outcome?: { status?: { Failure?: unknown } } }[] };
  if (o?.status && "Failure" in (o.status as object)) return JSON.stringify(o.status.Failure);
  for (const r of o?.receipts_outcome ?? []) if (r.outcome?.status && "Failure" in (r.outcome.status as object)) return JSON.stringify(r.outcome.status.Failure);
  return null;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const selectorRef = useRef<WalletSelector | null>(null);
  const modalRef = useRef<WalletSelectorModal | null>(null);
  const [ready, setReady] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRedirectTx, setLastRedirectTx] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let sub: { unsubscribe: () => void } | null = null;
    (async () => {
      try {
        const [{ setupWalletSelector }, { setupModal }, meteor, mnw, hot, intear] = await Promise.all([
          import("@near-wallet-selector/core"),
          import("@near-wallet-selector/modal-ui"),
          import("@near-wallet-selector/meteor-wallet"),
          import("@near-wallet-selector/my-near-wallet"),
          import("@near-wallet-selector/hot-wallet"),
          import("@near-wallet-selector/intear-wallet"),
        ]);
        await import("@near-wallet-selector/modal-ui/styles.css");
        const selector = await setupWalletSelector({
          network: "testnet",
          modules: [meteor.setupMeteorWallet(), mnw.setupMyNearWallet(), hot.setupHotWallet(), intear.setupIntearWallet()],
        });
        if (cancelled) return;
        const modal = setupModal(selector, { contractId: config.contract, theme: "dark", description: "Connect a NEAR testnet wallet to post jobs, join as an agent, and sign escrow actions." });
        selectorRef.current = selector;
        modalRef.current = modal;
        const sync = async () => {
          const state = selector.store.getState();
          const active = state.accounts.find((a) => a.active) ?? state.accounts[0];
          setAccountId(active?.accountId ?? null);
          const mod = state.modules.find((m) => m.id === state.selectedWalletId);
          setWalletName(mod?.metadata.name ?? null);
        };
        await sync();
        sub = selector.store.observable.subscribe(() => void sync());
        const params = new URLSearchParams(window.location.search);
        const hashes = params.get("transactionHashes");
        if (hashes) setLastRedirectTx(hashes.split(",").pop() ?? null);
        if (params.get("errorCode")) setError(decodeURIComponent(params.get("errorMessage") ?? params.get("errorCode") ?? "wallet error"));
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "wallet selector failed to load");
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      sub?.unsubscribe();
    };
  }, []);

  const open = useCallback(() => {
    setError(null);
    if (!modalRef.current) {
      setError("Wallet selector is still loading. Try again in a second.");
      return;
    }
    modalRef.current.show();
  }, []);

  const signOut = useCallback(async () => {
    const selector = selectorRef.current;
    if (!selector) return;
    try {
      const wallet = await selector.wallet();
      await wallet.signOut();
    } catch (e) {
      setError(e instanceof Error ? e.message : "sign out failed");
    }
  }, []);

  const call = useCallback(async (c: WalletCall): Promise<WalletTxResult> => {
    const selector = selectorRef.current;
    if (!selector || !selector.isSignedIn()) throw new Error("Connect a wallet first.");
    const wallet = await selector.wallet();
    const outcome = await wallet.signAndSendTransaction({
      receiverId: config.contract,
      actions: [actionCreators.functionCall(c.method, c.args, BigInt(c.gas ?? "100000000000000"), BigInt(c.deposit ?? "0"))],
    });
    if (!outcome) return { hash: null, value: null, redirected: true };
    const bad = failureOf(outcome);
    const hash = (outcome as { transaction?: { hash?: string } }).transaction?.hash ?? null;
    if (bad) throw new Error(`Transaction ${hash ?? ""} failed on chain: ${bad.slice(0, 300)}`);
    return { hash, value: decodeValue(outcome), redirected: false };
  }, []);

  const value = useMemo(() => ({ ready, accountId, walletName, error, open, signOut, call, lastRedirectTx }), [ready, accountId, walletName, error, open, signOut, call, lastRedirectTx]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function WalletButton({ compact = false }: { compact?: boolean }) {
  const w = useWallet();
  const [menu, setMenu] = useState(false);
  if (!w.accountId) {
    return (
      <button className={`btn btn-primary ${compact ? "btn-sm" : ""}`} onClick={w.open} disabled={!w.ready} data-testid="connect-wallet">
        <span className="size-1.5 rounded-full bg-[#03130c]" />
        {w.ready ? <><span className="sm:hidden">Connect</span><span className="hidden sm:inline">Connect wallet</span></> : "Loading…"}
      </button>
    );
  }
  return (
    <div className="relative">
      <button className={`btn btn-ghost ${compact ? "btn-sm" : ""}`} onClick={() => setMenu((m) => !m)} data-testid="wallet-account">
        <span className="size-2 rounded-full bg-mint shadow-[0_0_10px_#4cf2b0]" />
        <span className="mono max-w-[9rem] truncate text-xs sm:max-w-[14rem]">{w.accountId}</span>
      </button>
      {menu && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 rounded-2xl border border-line-strong bg-panel p-2 shadow-2xl">
          <div className="px-3 py-2">
            <div className="eyebrow">Connected · testnet</div>
            <div className="mono mt-1 break-all text-xs text-soft">{w.accountId}</div>
            {w.walletName && <div className="mt-1 text-xs text-mute">via {w.walletName}</div>}
          </div>
          <a className="block rounded-xl px-3 py-2 text-sm text-soft hover:bg-white/5" href={`https://testnet.nearblocks.io/address/${w.accountId}`} target="_blank" rel="noreferrer">
            View on explorer ↗
          </a>
          <button className="block w-full rounded-xl px-3 py-2 text-left text-sm text-soft hover:bg-white/5" onClick={() => { setMenu(false); w.open(); }}>
            Switch wallet
          </button>
          <button className="block w-full rounded-xl px-3 py-2 text-left text-sm text-coral hover:bg-white/5" onClick={() => { setMenu(false); void w.signOut(); }}>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
