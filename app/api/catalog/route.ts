import { connection, NextResponse } from "next/server";
import { view } from "@/lib/chain";
import { MODEL_FACTS } from "@/lib/nearai";

export async function GET() {
  await connection();
  const response = await fetch("https://cloud-api.near.ai/v1/model/list?limit=100&offset=0");
  if (!response.ok) {
    return NextResponse.json({ ok: false, error: `catalog ${response.status}` }, { status: 502 });
  }
  const body = (await response.json()) as {
    models: { modelId: string; inputCostPerToken: { amount: number }; outputCostPerToken: { amount: number }; metadata: Record<string, unknown> }[];
  };
  const live = body.models.find((model) => model.modelId === MODEL_FACTS.modelId);
  const frozen = await view<{
    model: { model_id: string; input_amount: string; output_amount: string; context_length: string; max_output: string; verifiable: boolean; provider_type: string } | null;
  }>("get_config");
  const model = frozen.model;
  const matches = Boolean(
    live &&
      model &&
      model.model_id === live.modelId &&
      model.input_amount === String(live.inputCostPerToken.amount) &&
      model.output_amount === String(live.outputCostPerToken.amount) &&
      model.context_length === String(live.metadata.contextLength) &&
      model.max_output === String(live.metadata.maxOutputLength),
  );
  return NextResponse.json({
    ok: true,
    frozen: model,
    live: live
      ? {
          modelId: live.modelId,
          input: live.inputCostPerToken.amount,
          output: live.outputCostPerToken.amount,
          contextLength: live.metadata.contextLength,
          maxOutput: live.metadata.maxOutputLength,
          verifiable: live.metadata.verifiable,
          attestationSupported: live.metadata.attestationSupported,
          providerType: live.metadata.providerType,
          features: live.metadata.supportedFeatures,
          isReady: live.metadata.isReady,
        }
      : null,
    matches,
    billing: "Prices are nanoUSD per token, not per million. Testnet NEAR does not pay this bill. The contract freezes the snapshot and reserves the full context window because the tokenizer is not verified.",
  });
}
