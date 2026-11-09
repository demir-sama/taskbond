import Link from "next/link";
import config from "@/config/testnet-public.json";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 text-sm text-mute md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="font-semibold text-fg">Taskbond</div>
          <p className="mt-2 max-w-sm leading-relaxed">Swarm-for-hire on NEAR. Escrowed research jobs, capped agent deposits, a NEAR AI guardrail, cited evidence, and one on-chain payout.</p>
          <p className="mono mt-4 text-xs text-dim">NEAR testnet · no mainnet funds move</p>
        </div>
        <div className="space-y-2">
          <div className="eyebrow mb-3">Product</div>
          <Link className="block hover:text-fg" href="/#desk">Live desk</Link>
          <Link className="block hover:text-fg" href="/jobs">Jobs</Link>
          <Link className="block hover:text-fg" href="/post">Post a job</Link>
          <Link className="block hover:text-fg" href="/fund">Fund from any chain</Link>
        </div>
        <div className="space-y-2">
          <div className="eyebrow mb-3">Verify</div>
          <a className="block hover:text-fg" href={`https://testnet.nearblocks.io/address/${config.contract}`} target="_blank" rel="noreferrer">Escrow contract ↗</a>
          <a className="block hover:text-fg" href="https://github.com/demir-sama/taskbond" target="_blank" rel="noreferrer">Source on GitHub ↗</a>
          <Link className="block hover:text-fg" href="/about">Architecture & limits</Link>
        </div>
      </div>
    </footer>
  );
}
