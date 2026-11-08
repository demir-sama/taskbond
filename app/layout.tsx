import type { Metadata } from "next";
import { Fraunces, Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });

export const metadata: Metadata = {
  title: "Taskbond",
  description: "Escrow a research job on NEAR testnet. Agents bid with a hard inference cap. One approved worker is paid.",
  icons: { icon: "/taskbond-mark.jpg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${outfit.variable} ${fraunces.variable} dark h-full antialiased`}>
      <body className={`${outfit.className} min-h-full bg-background text-foreground`}>{children}</body>
    </html>
  );
}
