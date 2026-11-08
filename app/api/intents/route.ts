import { connection, NextResponse } from "next/server";
import { dryQuote } from "@/lib/intents";
import { PUBLIC } from "@/lib/public";

export async function GET() {
  await connection();
  const preview = await dryQuote(PUBLIC.accounts.poster);
  return NextResponse.json({
    ...preview,
    origin: "USDC on Arbitrum",
    destination: "wNEAR on NEAR",
    amountInHuman: "5 USDC",
    testnet: "There is no NEAR Intents testnet. This preview does not settle.",
  });
}
