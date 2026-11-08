import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-border/80">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        <Link href="/" className="flex items-center gap-3">
          <img src="/taskbond-mark.jpg" alt="" className="size-11 rounded-full border border-primary/40" />
          <span>
            <span className="font-[family-name:var(--font-fraunces)] text-xl tracking-tight">Taskbond</span>
            <span className="block text-xs uppercase tracking-[0.18em] text-muted-foreground">Swarm for hire</span>
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">Desk</Link>
          <Link href="/docs" className="hover:text-foreground">Docs</Link>
          <Link href="/about" className="hover:text-foreground">About</Link>
        </nav>
      </div>
    </header>
  );
}
