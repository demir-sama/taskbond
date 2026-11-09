import { createHash, timingSafeEqual } from "node:crypto";

export async function POST(req: Request) {
  const token = process.env.TASKBOND_DIAGNOSTIC_TOKEN ?? "";
  const supplied = req.headers.get("x-taskbond-diagnostic") ?? "";
  if (!token || supplied.length !== token.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))) return new Response(null, { status: 404 });
  const key = process.env.NEAR_AI_API_KEY ?? "";
  const base = (process.env.NEAR_AI_BASE_URL || "https://cloud-api.near.ai/v1").replace(/\/$/, "");
  const response = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000), cache: "no-store" });
  return Response.json({ name: "NEAR_AI_API_KEY", length: key.length, sha256: createHash("sha256").update(key).digest("hex"), outerWhitespace: key !== key.trim(), base, authHeaderScheme: "Bearer", mode: process.env.TASKBOND_AI_MODE, modelsHttpStatus: response.status }, { headers: { "Cache-Control": "no-store" } });
}
