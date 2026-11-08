/** Bounded live NEAR AI plan. Not executed unless NEAR_AI_API_KEY and TASKBOND_AI_MODE=live. */

export const LIVE_ENV = "NEAR_AI_API_KEY";
export const LIVE_MODE = "TASKBOND_AI_MODE";

export const LIVE_CALL_PLAN = [
  "guard:mal",
  "guard:ada",
  "guard:bas",
  "worker:ada",
  "worker:bas",
  "reviewer",
] as const;

export const LIVE_CALL_BUDGET = LIVE_CALL_PLAN.length;

export function createCallBudget(max = LIVE_CALL_BUDGET) {
  let used = 0;
  const labels: string[] = [];
  return {
    max,
    used: () => used,
    labels: () => labels.slice(),
    take(label: (typeof LIVE_CALL_PLAN)[number]) {
      if (used >= max) throw new Error(`live call budget exceeded at ${label}`);
      if (!LIVE_CALL_PLAN.includes(label)) throw new Error(`unexpected live call ${label}`);
      if (labels.includes(label)) throw new Error(`duplicate live call ${label}`);
      used += 1;
      labels.push(label);
      return used;
    },
  };
}

export function liveReadiness(env: NodeJS.ProcessEnv = process.env): {
  ready: boolean;
  complete: false;
  blocker: string | null;
} {
  const key = env[LIVE_ENV];
  const mode = env[LIVE_MODE];
  if (!key) {
    return {
      ready: false,
      complete: false,
      blocker: `${LIVE_ENV} is not set. Live guard, two workers, and the reviewer were not called.`,
    };
  }
  if (mode !== "live") {
    return {
      ready: false,
      complete: false,
      blocker: `${LIVE_MODE} is not live. The fixture desk stays on. Set ${LIVE_MODE}=live on the sanctioned host before spending credits.`,
    };
  }
  return { ready: true, complete: false, blocker: null };
}

export const GUARD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["decision", "reason"],
  properties: {
    decision: { type: "string", enum: ["approve", "reject"] },
    reason: { type: "string", maxLength: 280 },
  },
} as const;

export const WORKER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "steps", "citations"],
  properties: {
    summary: { type: "string", maxLength: 1000 },
    steps: { type: "array", maxItems: 8, items: { type: "string", maxLength: 200 } },
    citations: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sourceId", "quote"],
        properties: {
          sourceId: { type: "string" },
          quote: { type: "string" },
        },
      },
    },
  },
} as const;

export const REVIEWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["score", "accept", "reason"],
  properties: {
    score: { type: "integer", minimum: 0, maximum: 100 },
    accept: { type: "boolean" },
    reason: { type: "string", maxLength: 280 },
  },
} as const;
