import type { ReactNode } from "react";

export function near(yocto: string | bigint | number | null | undefined, digits = 4) {
  if (yocto == null || yocto === "") return "—";
  const v = BigInt(yocto);
  const whole = v / 10n ** 24n;
  const frac = (v % 10n ** 24n).toString().padStart(24, "0").slice(0, digits);
  return `${whole}.${frac}`;
}

export function short(hash: string, a = 6, b = 4) {
  return hash.length > a + b + 1 ? `${hash.slice(0, a)}…${hash.slice(-b)}` : hash;
}

type Tone = "mint" | "coral" | "amber" | "iris" | "mute";
const TONES: Record<Tone, string> = {
  mint: "text-mint border-mint/25 bg-mint/[0.07]",
  coral: "text-coral border-coral/25 bg-coral/[0.07]",
  amber: "text-amber border-amber/25 bg-amber/[0.07]",
  iris: "text-iris border-iris/25 bg-iris/[0.07]",
  mute: "text-soft border-line-strong bg-white/[0.03]",
};

export function Pill({ tone = "mute", children, dot = false, pulse = false }: { tone?: Tone; children: ReactNode; dot?: boolean; pulse?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide ${TONES[tone]}`}>
      {dot && <span className={`size-1.5 rounded-full bg-current ${pulse ? "animate-pulse-soft" : ""}`} />}
      {children}
    </span>
  );
}

export function TxLink({ hash, label }: { hash: string; label?: string }) {
  return (
    <a href={`https://testnet.nearblocks.io/txns/${hash}`} target="_blank" rel="noreferrer" className="mono inline-flex items-center gap-1 text-xs text-soft underline decoration-white/15 underline-offset-4 hover:text-mint hover:decoration-mint/50">
      {label ?? short(hash, 8, 6)} <span aria-hidden>↗</span>
    </a>
  );
}

export function AccountLink({ id, className = "" }: { id: string; className?: string }) {
  return (
    <a href={`https://testnet.nearblocks.io/address/${id}`} target="_blank" rel="noreferrer" className={`mono break-all hover:text-mint ${className}`}>
      {id}
    </a>
  );
}

export function SectionHead({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="max-w-3xl">
      <div className="eyebrow">{eyebrow}</div>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-[2.6rem] sm:leading-[1.08]">{title}</h2>
      {children && <p className="mt-4 text-[15px] leading-relaxed text-mute sm:text-base">{children}</p>}
    </div>
  );
}

export function Spinner({ className = "size-3.5" }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} aria-hidden />;
}
