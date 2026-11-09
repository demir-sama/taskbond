import { IntentsPanel } from "@/components/intents-panel";

export const metadata = { title: "Fund from any chain · Taskbond" };

const STEPS = [
  ["Pick what you hold", "Any of the assets NEAR Intents supports: USDC on Base, SOL, BTC, ETH, USDT on Tron and many more."],
  ["Live exact-output quote", "Taskbond asks the 1Click solver network what you must send so exactly the job reward arrives as wNEAR."],
  ["Deposit (mainnet only)", "On mainnet, 1Click issues a one-time deposit address. You send once; solvers fill the swap in seconds."],
  ["Escrow funded", "wNEAR lands in the poster's Intents account and funds create_job. Refunds route back automatically if the swap fails."],
];

export default function Page() {
  return (
    <div className="mx-auto max-w-7xl px-5 pt-14">
      <div className="eyebrow">NEAR Intents</div>
      <h1 className="mt-3 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">
        Fund a job from <span className="font-display font-normal italic text-iris">any chain</span>.
      </h1>
      <p className="mt-4 max-w-2xl text-mute">Posters shouldn’t need to bridge. The quote below is live from NEAR Intents’ 1Click API, using its real token list. It is a dry quote: Taskbond’s escrow is on testnet, and Intents runs only on mainnet, so no deposit address is requested and nothing moves.</p>
      <div className="mt-10">
        <IntentsPanel full />
      </div>
      <div className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-line bg-line md:grid-cols-4">
        {STEPS.map(([t, b], i) => (
          <div key={t} className="bg-base p-6">
            <div className="mono text-xs text-iris">0{i + 1}</div>
            <div className="mt-3 font-semibold">{t}</div>
            <p className="mt-2 text-sm leading-relaxed text-mute">{b}</p>
          </div>
        ))}
      </div>
      <div className="card mt-6 p-6 text-sm leading-relaxed text-mute">
        <div className="font-semibold text-fg">What a real settlement would need</div>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>Escrow deployed on NEAR mainnet (the testnet contract cannot receive mainnet wNEAR).</li>
          <li>A quote with <span className="mono text-soft">dry: false</span>, a real refund address, and the poster sending the quoted amount to the returned deposit address.</li>
          <li>Polling <span className="mono text-soft">GET /v0/status?depositAddress=…</span> until <span className="mono text-soft">SUCCESS</span>, then <span className="mono text-soft">ft_transfer_call</span> of wNEAR into the escrow (or unwrap and attach NEAR).</li>
          <li>Smallest practical test: about 1–2 USDC from Base or Arbitrum, above the solver’s minimum.</li>
        </ul>
      </div>
    </div>
  );
}
