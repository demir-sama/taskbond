import type { LedgerEntry } from "./ledger.ts";

export const NEAR_AI_URL = "https://cloud-api.near.ai/v1/chat/completions";
export const NEAR_AI_MODEL = "Qwen/Qwen3.8-27B";
export const MODEL_FACTS = {
  modelId: NEAR_AI_MODEL,
  providerType: "vllm",
  verifiable: true,
  attestationSupported: true,
  structuredOutputs: true,
  contextLength: 262144,
  maxOutput: 65536,
  inputNanoUsd: 40,
  outputNanoUsd: 1350,
  note: "Chosen from the public catalog because it was ready, advertised structured outputs, and is marked verifiable with attestation. Other catalog models are not assumed to be TEE-backed.",
};

export class NearAiError extends Error {}

export function assertPermit(permit: LedgerEntry | null): LedgerEntry {
  if (!permit || permit.phase !== "api_started") {
    throw new NearAiError("refusing NEAR AI call without a persisted reservation acknowledgement");
  }
  return permit;
}

export async function chatJson(options: {
  permit: LedgerEntry | null;
  messages: { role: "system" | "user"; content: string }[];
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<{ content: string; inputTokens: number; outputTokens: number; requestId: string | null }> {
  assertPermit(options.permit);
  const maxTokens = options.maxTokens ?? 800;
  if (maxTokens > 1024) throw new NearAiError("max_tokens exceeds the app output bound");
  const key = process.env.NEAR_AI_API_KEY;
  if (!key) throw new NearAiError("NEAR_AI_API_KEY is unset. No completion was invented.");
  const response = await fetch(NEAR_AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-Request-Id": crypto.randomUUID(),
    },
    body: JSON.stringify({
      model: NEAR_AI_MODEL,
      messages: options.messages,
      max_tokens: maxTokens,
      temperature: 0,
      response_format: { type: "json_schema", json_schema: { name: options.schemaName, strict: true, schema: options.schema } },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) {
    throw new NearAiError(`NEAR AI ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  const body = (await response.json()) as {
    choices?: { message?: { content?: string | null; reasoning_content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new NearAiError("NEAR AI returned no content");
  return {
    content,
    inputTokens: body.usage?.prompt_tokens ?? 0,
    outputTokens: body.usage?.completion_tokens ?? 0,
    requestId: response.headers.get("x-request-id"),
  };
}

export function parseGuardJson(content: string): { decision: "approve" | "reject"; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new NearAiError("guard output was not JSON");
  }
  if (!parsed || typeof parsed !== "object") throw new NearAiError("guard output was not an object");
  const decision = (parsed as { decision?: unknown }).decision;
  const reason = (parsed as { reason?: unknown }).reason;
  if ((decision !== "approve" && decision !== "reject") || typeof reason !== "string" || !reason.trim()) {
    throw new NearAiError("guard output missed decision or reason");
  }
  return { decision, reason: reason.slice(0, 280) };
}
