import { createHash } from "node:crypto";
import { connection } from "next/server";
import { aiMode, MODEL_FACTS, NEAR_AI_MODEL } from "@/lib/nearai";
import { canSign, view } from "@/lib/near-server";
import { PUBLIC } from "@/lib/public";
import type { ConfigView } from "@/lib/types";
import { pack } from "@/lib/engine";

export async function GET() {
  await connection();
  const [cfg, catalog] = await Promise.all([
    view<ConfigView>("get_config").catch(() => null),
    fetch("https://cloud-api.near.ai/v1/model/list?limit=100&offset=0", { signal: AbortSignal.timeout(8000) })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null) as Promise<{ models?: { modelId: string; metadata?: { isReady?: boolean; verifiable?: boolean } }[] } | null>,
  ]);
  const live = catalog?.models?.find((m) => m.modelId === NEAR_AI_MODEL);
  return Response.json(
    {
      network: "testnet",
      contract: PUBLIC.contract,
      accounts: PUBLIC.accounts,
      ai: { keyLength: (process.env.NEAR_AI_API_KEY ?? "").length, keyFingerprintMatches: process.env.TASKBOND_EXPECTED_KEY_SHA256 ? createHash("sha256").update(process.env.NEAR_AI_API_KEY ?? "").digest("hex") === process.env.TASKBOND_EXPECTED_KEY_SHA256 : null, mode: aiMode(), model: NEAR_AI_MODEL, catalogReady: live?.metadata?.isReady ?? null, verifiable: live?.metadata?.verifiable ?? MODEL_FACTS.verifiable },
      signer: canSign(),
      packHash: pack().packHash,
      sources: pack().sources.map((s) => ({ id: s.id, url: s.url })),
      config: cfg,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
