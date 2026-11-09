import { dryQuote } from "@/lib/intents";
import { body } from "@/lib/api";

export async function POST(req: Request) {
  const b = await body(req);
  const q = await dryQuote(String(b.originAsset ?? ""), String(b.amountYocto ?? ""), String(b.recipient ?? "demirsama.near"));
  return Response.json(q, { status: q.ok ? 200 : 422, headers: { "Cache-Control": "no-store" } });
}
