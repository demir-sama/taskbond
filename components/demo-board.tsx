"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Tx = { method: string; signer: string; hash: string; explorer: string };
type AgentCard = {
  name: string;
  account: string;
  prompt: string;
  status?: string;
  reason?: string;
  summary?: string;
  evidence?: string;
  score?: number | null;
  review?: string;
};
type Demo = {
  mode: string;
  running: boolean;
  error?: string;
  jobId?: number;
  packHash: string;
  steps: { id: string; label: string; status: string; detail?: string; tx?: string }[];
  agents: AgentCard[];
  payout?: { winner: string; delta: string; tx: string; status: string };
  refunds: { account: string; tx: string }[];
  transactions: Tx[];
};
export type Payload = {
  aiMode: string;
  liveKeyPresent: boolean;
  contract: string;
  accounts: Record<string, string>;
  packHash: string;
  sources: { id: string; url: string; sha256: string }[];
  demo: Demo | null;
  proof: {
    payout?: { status: string; winner_delta_yocto: string; delta_equals_reward: boolean; transaction: string };
    refund?: { status: string; delta_equals_reward: boolean; transaction: string };
    failed_transfer?: { status: string; marked_paid: boolean; claimable_restored: boolean; transaction: string; chain_logs: string[] };
    confirmed?: Record<string, boolean>;
  } | null;
};

function near(yocto?: string) {
  if (!yocto) return "—";
  const value = BigInt(yocto);
  const whole = value / 10n ** 24n;
  const frac = (value % 10n ** 24n).toString().padStart(24, "0").slice(0, 4);
  return `${whole}.${frac} NEAR`;
}

export function DemoBoard({ initial }: { initial: Payload }) {
  const [data, setData] = useState<Payload>(initial);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<string>("Dry quote has not been requested.");
  const [catalog, setCatalog] = useState<string>("Catalog check has not run.");
  const [wallet, setWallet] = useState("The scripted demo signs with server-side testnet keys. This browser is not asked to sign.");

  async function refresh() {
    const response = await fetch("/api/demo", { cache: "no-store" });
    if (!response.ok) throw new Error(`state ${response.status}`);
    setData(await response.json());
  }

  useEffect(() => {
    refresh().catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!data?.demo?.running) return;
    const timer = setInterval(() => {
      refresh().catch((err: Error) => setError(err.message));
    }, 2000);
    return () => clearInterval(timer);
  }, [data?.demo?.running]);

  async function runDemo() {
    setError(null);
    const response = await fetch("/api/demo", { method: "POST" });
    if (!response.ok) {
      setError(`demo ${response.status}`);
      return;
    }
    await refresh();
  }

  async function previewQuote() {
    setQuote("Requesting a mainnet dry quote…");
    const response = await fetch("/api/intents");
    const body = await response.json();
    if (!body.ok) {
      setQuote(`No quote. ${body.error ?? "The 1Click API did not return a preview."} Nothing was settled.`);
      return;
    }
    setQuote(
      body.amountOutFormatted
        ? `Dry preview, not settled. ${body.amountInFormatted ?? body.amountInHuman} USDC on Arbitrum prices about ${body.amountOutFormatted} wNEAR inside Intents${body.amountOutUsd ? ` (${body.amountOutUsd} USD)` : ""}. No deposit address. ${body.note}`
        : `Dry preview only. Settlement was not performed. ${body.note}`,
    );
  }

  async function checkCatalog() {
    const response = await fetch("/api/catalog");
    const body = await response.json();
    if (!body.ok) {
      setCatalog(body.error ?? "Catalog request failed.");
      return;
    }
    setCatalog(
      body.matches
        ? `Frozen Qwen/Qwen3.8-27B matches the live catalog (ready, verifiable, attestation supported, structured outputs). ${body.billing}`
        : `Frozen snapshot does not match the live catalog. Worst-case reserves may be short. ${body.billing}`,
    );
  }

  const demo = data?.demo;
  const proof = data?.proof;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <section className="grid gap-6 md:grid-cols-[1.4fr_0.8fr] md:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-primary">NEAR testnet · one job type</p>
          <h1 className="mt-2 font-[family-name:var(--font-fraunces)] text-4xl leading-tight md:text-5xl">
            Hire a small swarm. Escrow the fee. Pay one cited answer.
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            A poster locks a research bid in the Taskbond contract. Each agent posts a prompt and a NEAR deposit that caps inference reimbursement. A rejected prompt never touches the escrow. The reviewer can pay only the approved worker&apos;s own account.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              Mode
              <Badge variant={data?.aiMode === "live" ? "default" : "secondary"}>
                {data?.aiMode === "live" ? "Live NEAR AI" : "Fixture AI"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              {data?.liveKeyPresent
                ? "NEAR_AI_API_KEY is present. The desk still runs the fixture path unless TASKBOND_AI_MODE=live. Live inference has not been verified."
                : "NEAR_AI_API_KEY is not set. Workers are fixtures. Testnet NEAR is not paying for model calls. The live job is not complete."}
            </p>
            <p className="break-all text-foreground">Contract {data?.contract}</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={runDemo} disabled={demo?.running}>
                {demo?.running ? "Demo in progress" : "Run testnet demo"}
              </Button>
              <Button variant="outline" onClick={() => setWallet("No wallet extension is available here. The fixture demo does not ask this browser to sign, and no live model call is made.")}>
                Connect wallet
              </Button>
            </div>
            <p>{wallet}</p>
          </CardContent>
        </Card>
      </section>

      {error ? <p className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm">{error}</p> : null}
      {demo?.error ? <p className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm">{demo.error}</p> : null}

      <section className="grid gap-3 md:grid-cols-3">
        {(demo?.steps ?? [
          { id: "wait", label: "No new demo yet", status: "pending", detail: "The confirmed payout below is from the deployment proof, not a fresh click." },
        ]).map((step) => (
          <Card key={step.id}>
            <CardHeader>
              <CardTitle className="text-base">{step.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <Badge variant={step.status === "error" ? "destructive" : "outline"}>{step.status}</Badge>
              {step.detail ? <p>{step.detail}</p> : null}
              {step.tx ? <a className="block text-primary underline-offset-4 hover:underline" href={step.tx}>Explorer</a> : null}
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {(demo?.agents ?? []).map((agent) => (
          <Card key={agent.name} className={`min-w-0 ${agent.status === "Rejected" ? "border-destructive/60" : ""}`}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center justify-between gap-2">
                {agent.name}
                <Badge variant={agent.status === "Rejected" ? "destructive" : agent.review === "Accepted" ? "default" : "secondary"}>
                  {agent.status === "Rejected"
                    ? "Guard rejected"
                    : agent.review === "Accepted"
                      ? `Winner · ${agent.score}`
                      : agent.review === "Rejected"
                        ? `Not paid · ${agent.score}`
                        : agent.status ?? "Queued"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 space-y-3 text-sm">
              <p className="break-all text-xs text-muted-foreground">{agent.account}</p>
              <p className="rounded-md bg-muted/60 p-3">{agent.prompt}</p>
              {agent.reason ? <p>{agent.reason}</p> : null}
              {agent.summary ? <p className="text-foreground">{agent.summary}</p> : null}
              {agent.evidence ? <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs text-muted-foreground">{agent.evidence}</pre> : null}
              {agent.score != null ? <p>Score {agent.score}. Fixture check, not a live model score.</p> : null}
            </CardContent>
          </Card>
        ))}
      </section>

      {demo?.payout ? (
        <Card>
          <CardHeader><CardTitle>Confirmed payout</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{demo.payout.winner} balance increased by {near(demo.payout.delta)}. Status {demo.payout.status}.</p>
            <a className="text-primary underline-offset-4 hover:underline" href={demo.payout.tx}>Payout transaction</a>
            <ul className="space-y-1 text-muted-foreground">
              {demo.refunds.map((refund) => (
                <li key={refund.tx}><a className="hover:text-foreground" href={refund.tx}>{refund.account} refund</a></li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Deployment proof</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {proof?.confirmed ? (
              <>
                <p>Winner delta equals the escrow: {String(proof.payout?.delta_equals_reward)}. Status {proof.payout?.status}.</p>
                <a className="block text-primary" href={proof.payout?.transaction}>Payout receipt</a>
                <p>Poster refund matched the reward: {String(proof.refund?.delta_equals_reward)}.</p>
                <a className="block text-primary" href={proof.refund?.transaction}>Refund receipt</a>
                <p>Failed transfer stayed {proof.failed_transfer?.status} and restored the claim. Marked paid: {String(proof.failed_transfer?.marked_paid)}.</p>
                <a className="block text-primary" href={proof.failed_transfer?.transaction}>Failure receipt</a>
              </>
            ) : <p>Proof file is not available in this checkout.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Pinned sources</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p className="break-all">Pack {data?.packHash}</p>
            <ul className="space-y-2">
              {data?.sources.map((source) => (
                <li key={source.id}>
                  <a className="text-foreground hover:text-primary" href={source.url}>{source.id}</a>
                  <span className="block break-all text-xs">{source.sha256}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Intents preview</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Cross-chain funding is a mainnet dry quote. There is no Intents testnet, and this button does not create a deposit address.</p>
            <Button variant="outline" onClick={previewQuote}>Preview 5 USDC to wNEAR</Button>
            <p>{quote}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Frozen model price</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Qwen/Qwen3.8-27B is the frozen snapshot: 40 / 1350 nanoUSD per token, full 262144-token context reserved because the tokenizer is not verified.</p>
            <Button variant="outline" onClick={checkCatalog}>Compare with the live catalog</Button>
            <p>{catalog}</p>
          </CardContent>
        </Card>
      </section>

      {demo?.transactions?.length ? (
        <Card>
          <CardHeader><CardTitle>Transactions</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {demo.transactions.map((tx) => (
                <li key={tx.hash} className="flex min-w-0 flex-col gap-1 border-b border-border/60 py-2 md:flex-row md:items-center md:justify-between">
                  <span className="break-all">{tx.method} · {tx.signer}</span>
                  <a className="break-all text-primary" href={tx.explorer}>{tx.hash.slice(0, 12)}…</a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
