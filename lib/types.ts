export type JobView = {
  id: number;
  poster: string;
  title: string;
  topic: string;
  job_type: string;
  source_pack_hash: string;
  deadline_ns: string;
  status: "Open" | "PayoutInFlight" | "Paid" | "RefundInFlight" | "Refunded" | string;
  escrow_amount: string;
  escrow_claimable: string;
  escrow_in_flight: string;
  storage_stake: string;
  winner_agent_id: number | null;
  winner_owner: string | null;
  result_hash: string | null;
  evidence_hash: string | null;
  score: number | null;
  agent_count: number;
};

export type AgentView = {
  id: number;
  job_id: number;
  owner: string;
  name: string;
  prompt: string;
  prompt_hash: string;
  status: "PendingGuard" | "Approved" | "Rejected" | string;
  guard_reason: string;
  cap: string;
  spent: string;
  reserved: string;
  unspent: string;
  gas_reserve: string;
  storage_stake: string;
  refund_locked: string;
  gas_locked: string;
  summary: string;
  steps: string[];
  evidence: string;
  result_hash: string;
  evidence_hash: string;
  review: "None" | "Pending" | "Accepted" | "Rejected" | string;
  review_reason: string;
};

export type ReservationView = {
  id: string;
  payer: string;
  agent_id: number;
  purpose: string;
  amount: string;
  status: string;
  settled_input: number;
  settled_output: number;
  settled_cost: string;
};

export type ConfigView = {
  owner: string;
  operator: string;
  worst_case: string;
  operator_unspent: string;
  model: { model_id: string; context_length: string; max_output: string; input_amount: string; output_amount: string; verifiable: boolean } | null;
  now: string;
};

/** Event streamed by the scripted run. */
export type RunEvent =
  | { type: "step"; id: string; status: "running" | "done" | "error" | "skipped"; detail?: string }
  | { type: "tx"; label: string; hash: string; explorer: string; signer: string }
  | { type: "ai"; role: "guard" | "worker" | "reviewer"; agent?: string; mode: "live" | "fixture"; model: string; inputTokens: number; outputTokens: number; ms: number; responseId: string | null; error?: string }
  | { type: "job"; jobId: number }
  | { type: "done"; jobId: number | null; ok: boolean; error?: string };
