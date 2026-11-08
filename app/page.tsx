import { Suspense } from "react";
import { connection } from "next/server";
import { DemoBoard, type Payload } from "@/components/demo-board";
import { SiteHeader } from "@/components/site-header";
import { loadDesk } from "@/lib/desk";

export const instant = false;

async function Desk() {
  await connection();
  const initial = loadDesk() as Payload;
  return <DemoBoard initial={initial} />;
}

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Suspense fallback={<p className="px-4 py-8 text-sm text-muted-foreground">Loading the desk…</p>}>
          <Desk />
        </Suspense>
      </main>
    </>
  );
}
