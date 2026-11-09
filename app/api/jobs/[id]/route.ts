import { connection } from "next/server";
import { jobDetail } from "@/lib/jobs";

export async function GET(_req: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  await connection();
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1) return Response.json({ error: "bad id" }, { status: 400 });
  const detail = await jobDetail(n);
  if (!detail) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(detail, { headers: { "Cache-Control": "no-store" } });
}
