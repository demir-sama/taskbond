import "server-only";
import { Account, JsonRpcProvider, KeyPairSigner, actions } from "near-api-js";
import { PUBLIC, txUrl } from "./public";

export type TxRef = { label: string; method: string; signer: string; hash: string; explorer: string };

let provider: JsonRpcProvider | null = null;
function rpc(): JsonRpcProvider {
  provider ??= new JsonRpcProvider({ url: PUBLIC.rpc });
  return provider;
}

function signerKeys(): Record<string, string> {
  const raw = process.env.TASKBOND_SIGNERS;
  if (!raw) throw new Error("TASKBOND_SIGNERS is not set on this server, so the scripted demo cannot sign.");
  return JSON.parse(raw) as Record<string, string>;
}

export function canSign(): boolean {
  try {
    const keys = signerKeys();
    return Boolean(keys[PUBLIC.accounts.operator]);
  } catch {
    return false;
  }
}

const accounts = new Map<string, Account>();
function account(id: string): Account {
  let found = accounts.get(id);
  if (!found) {
    const key = signerKeys()[id];
    if (!key) throw new Error(`no testnet signer for ${id}`);
    found = new Account(id, rpc(), KeyPairSigner.fromSecretKey(key as `ed25519:${string}`));
    accounts.set(id, found);
  }
  return found;
}

type Raw = { transaction?: { hash?: string }; transaction_outcome?: { id?: string }; status?: unknown; receipts_outcome?: { outcome?: { logs?: string[]; status?: unknown } }[] };

function failure(outcome: Raw): string | null {
  const status = outcome.status as { Failure?: unknown } | undefined;
  if (status && typeof status === "object" && "Failure" in status) return JSON.stringify(status.Failure).slice(0, 400);
  for (const r of outcome.receipts_outcome ?? []) {
    const s = r.outcome?.status as { Failure?: unknown } | undefined;
    if (s && typeof s === "object" && "Failure" in s) return JSON.stringify(s.Failure).slice(0, 400);
  }
  return null;
}

export function logsOf(outcome: Raw): string[] {
  return (outcome.receipts_outcome ?? []).flatMap((r) => r.outcome?.logs ?? []);
}

export type Call = { method: string; args: Record<string, unknown>; deposit?: bigint; gas?: bigint };

/** One signed transaction carrying one or more function calls to the escrow. */
export async function send(signer: string, label: string, calls: Call[], waitUntil: "EXECUTED_OPTIMISTIC" | "FINAL" = "EXECUTED_OPTIMISTIC"): Promise<{ tx: TxRef; logs: string[]; value: unknown }> {
  const acct = account(signer);
  const outcome = (await acct.signAndSendTransaction({
    receiverId: PUBLIC.contract,
    actions: calls.map((c) => actions.functionCall(c.method, c.args, c.gas ?? (calls.length > 1 ? 280_000_000_000_000n / BigInt(calls.length) : 100_000_000_000_000n), c.deposit ?? 0n)),
    waitUntil,
    throwOnFailure: false,
  })) as unknown as Raw;
  const hash = outcome.transaction?.hash ?? outcome.transaction_outcome?.id ?? "";
  const bad = failure(outcome);
  if (bad) throw new Error(`${calls.map((c) => c.method).join("+")} failed (${hash}): ${bad}`);
  let value: unknown = null;
  const status = outcome.status as { SuccessValue?: string } | undefined;
  if (status?.SuccessValue) {
    try {
      value = JSON.parse(Buffer.from(status.SuccessValue, "base64").toString("utf8"));
    } catch {
      value = null;
    }
  }
  return { tx: { label, method: calls.map((c) => c.method).join(" + "), signer, hash, explorer: txUrl(hash) }, logs: logsOf(outcome), value };
}

export async function view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(PUBLIC.rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "tb",
      method: "query",
      params: { request_type: "call_function", finality: "optimistic", account_id: PUBLIC.contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") },
    }),
    cache: "no-store",
  });
  const body = (await res.json()) as { result?: { result: number[] }; error?: { message?: string; data?: unknown } };
  if (body.error || !body.result) throw new Error(`view ${method}: ${body.error?.message ?? "rpc error"} ${JSON.stringify(body.error?.data ?? "").slice(0, 200)}`);
  return JSON.parse(Buffer.from(body.result.result).toString("utf8")) as T;
}

export async function balance(accountId: string): Promise<bigint> {
  const res = await fetch(PUBLIC.rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "tb", method: "query", params: { request_type: "view_account", finality: "optimistic", account_id: accountId } }),
    cache: "no-store",
  });
  const body = (await res.json()) as { result?: { amount: string } };
  return BigInt(body.result?.amount ?? "0");
}
