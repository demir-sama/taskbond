import { connection } from "next/server";
import { chainName, listTokens } from "@/lib/intents";

export async function GET() {
  await connection();
  try {
    const tokens = await listTokens();
    return Response.json(
      { ok: true, source: "https://1click.chaindefuser.com/v0/tokens", fetchedAt: new Date().toISOString(), tokens: tokens.map((t) => ({ ...t, chain: chainName(t.blockchain) })) },
      { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" } },
    );
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "tokens failed" }, { status: 502 });
  }
}
