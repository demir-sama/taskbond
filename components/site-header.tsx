"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { WalletButton } from "./wallet";

const NAV = [
  { href: "/#desk", label: "Live desk" },
  { href: "/jobs", label: "Jobs" },
  { href: "/post", label: "Post a job" },
  { href: "/fund", label: "Fund from any chain" },
  { href: "/about", label: "How it works" },
];

export function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-2.5">
      <svg viewBox="0 0 64 64" className="size-8" aria-hidden>
        <rect width="64" height="64" rx="16" fill="#0b0d11" />
        <rect x="0.5" y="0.5" width="63" height="63" rx="15.5" fill="none" stroke="#4cf2b0" strokeOpacity=".35" />
        <path d="M18 22h28M32 22v22" stroke="#4cf2b0" strokeWidth="5" strokeLinecap="round" />
        <circle cx="32" cy="46" r="3.5" fill="#eceef2" />
      </svg>
      <span className="text-[0.95rem] font-semibold tracking-tight sm:text-[1.05rem]">Taskbond</span>
      <span className="mono hidden rounded-full border border-line-strong px-2 py-0.5 text-[10px] uppercase tracking-widest text-mute sm:inline">testnet</span>
    </Link>
  );
}

export function SiteHeader() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:px-5">
        <Logo />
        <nav className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => {
            const active = n.href === path || (n.href !== "/#desk" && path.startsWith(n.href));
            return (
              <Link key={n.href} href={n.href} className={`rounded-full px-3.5 py-2 text-sm transition-colors ${active ? "bg-white/[0.06] text-fg" : "text-mute hover:text-fg"}`}>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <WalletButton compact />
          <div className="lg:hidden"><button className="btn btn-ghost btn-sm" aria-label="Menu" onClick={() => setOpen((o) => !o)}>
            <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path d={open ? "M5 5l10 10M15 5L5 15" : "M3 6h14M3 10h14M3 14h14"} /></svg>
          </button></div>
        </div>
      </div>
      {open && (
        <nav className="border-t border-line px-5 py-3 lg:hidden">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-3 text-[15px] text-soft hover:bg-white/5">
              {n.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
