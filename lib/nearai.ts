/**
 * NEAR AI Cloud client (OpenAI-compatible). Every call is bounded:
 * a fixed small max_tokens, thinking disabled so the budget goes to the
 * JSON answer, strict json_schema output, and a hard timeout. A failure is
 * an error, never an invented answer.
 */

export const NEAR_AI_BASE = (process.env.NEAR_AI_BASE_URL || "https://cloud-api.near.ai/v1").replace(/\/$/, "");
export const NEAR_AI_MODEL = process.env.NEAR_AI_MODEL || "Qwen/Qwen3.8-27B";
/** Contract-frozen ceilings: the escrow refuses to settle above these. */
export const FROZEN_CONTEXT = 16_384;
export const FROZEN_MAX_OUTPUT = 1_024;

export const MODEL_FACTS = {
  modelId: "Qwen/Qwen3.8-27B",
  providerType: "vllm",
  verifiable: true,
  inputNanoUsd: 40,
  outputNanoUsd: 1350,
  note: "Chosen from the NEAR AI Cloud catalog: ready, structured outputs, marked verifiable with attestation support.",
};

export class NearAiError extends Error {}

export type AiMode = "live" | "fixture";

export function aiMode(env: NodeJS.ProcessEnv = process.env): AiMode {
  if (env.TASKBOND_AI_MODE === "fixture") return "fixture";
  return env.NEAR_AI_API_KEY ? "live" : "fixture";
}

export type AiResult<T> = {
  value: T;
  inputTokens: number;
  outputTokens: number;
  model: string;
  responseId: string | null;
  ms: number;
};

export async function chatJson<T>(options: {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  parse: (raw: unknown) => T;
  fetchImpl?: typeof fetch;
}): Promise<AiResult<T>> {
  const key = process.env.NEAR_AI_API_KEY;
  if (!key) throw new NearAiError("NEAR_AI_API_KEY is unset. No completion was requested.");
  if (options.maxTokens > FROZEN_MAX_OUTPUT) throw new NearAiError("max_tokens above the frozen ceiling");
  if ((options.system.length + options.user.length) / 3 > FROZEN_CONTEXT - options.maxTokens) {
    throw new NearAiError("prompt could exceed the frozen context ceiling");
  }
  const started = Date.now();
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(`${NEAR_AI_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: NEAR_AI_MODEL,
        temperature: 0,
        max_tokens: options.maxTokens,
        chat_template_kwargs: { enable_thinking: false },
        response_format: { type: "json_schema", json_schema: { name: options.schemaName, strict: true, schema: options.schema } },
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.user },
        ],
      }),
      signal: AbortSignal.timeout(50_000),
    });
  } catch (error) {
    throw new NearAiError(`NEAR AI unreachable: ${error instanceof Error ? error.message : "network"}`);
  }
  const text = await response.text();
  if (!response.ok) {
    const hint = response.status === 401 ? " (key rejected)" : response.status === 402 ? " (billing authorization required)" : response.status === 429 ? " (rate limited)" : "";
    throw new NearAiError(`NEAR AI HTTP ${response.status}${hint}: ${text.slice(0, 200)}`);
  }
  let body: {
    id?: string;
    model?: string;
    choices?: { finish_reason?: string; message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  try {
    body = JSON.parse(text);
  } catch {
    throw new NearAiError("NEAR AI response was not JSON");
  }
  const choice = body.choices?.[0];
  if (choice?.finish_reason === "length") throw new NearAiError("NEAR AI hit the token cap before finishing. Nothing was accepted.");
  const content = choice?.message?.content;
  if (!content) throw new NearAiError("NEAR AI returned no content");
  let raw: unknown;
  try {
    raw = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    throw new NearAiError("model output was not JSON");
  }
  const inputTokens = body.usage?.prompt_tokens ?? 0;
  const outputTokens = body.usage?.completion_tokens ?? 0;
  if (inputTokens > FROZEN_CONTEXT || outputTokens > FROZEN_MAX_OUTPUT) throw new NearAiError("usage above frozen ceilings");
  return { value: options.parse(raw), inputTokens, outputTokens, model: body.model ?? NEAR_AI_MODEL, responseId: body.id ?? null, ms: Date.now() - started };
}

export function parseGuardJson(raw: unknown): { decision: "approve" | "reject"; reason: string; category: string } {
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new NearAiError("guard output was not JSON");
    }
  }
  if (!parsed || typeof parsed !== "object") throw new NearAiError("guard output was not an object");
  const { decision, reason, category } = parsed as { decision?: unknown; reason?: unknown; category?: unknown };
  if ((decision !== "approve" && decision !== "reject") || typeof reason !== "string" || !reason.trim()) {
    throw new NearAiError("guard output missed decision or reason");
  }
  return { decision, reason: reason.trim().slice(0, 240), category: typeof category === "string" ? category : "none" };
}
