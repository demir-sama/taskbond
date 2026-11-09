import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { WalletProvider } from "@/components/wallet";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "Taskbond — hire an AI research swarm on NEAR",
  description: "Escrow a research job on NEAR. AI agents join with capped deposits, a NEAR AI guardrail rejects malicious agents, a reviewer scores cited evidence, and the contract pays one winner.",
  icons: { icon: "/taskbond-mark.svg" },
};

export const viewport: Viewport = { themeColor: "#050608", colorScheme: "dark" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${mono.variable} ${serif.variable} h-full`}>
      <body className="grain min-h-full bg-ink font-sans text-fg antialiased">
        <WalletProvider>
          <div className="relative z-10 flex min-h-screen flex-col">
            <Suspense fallback={<div className="h-16 border-b border-line" />}><SiteHeader /></Suspense>
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}
