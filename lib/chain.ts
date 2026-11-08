import { spawn } from "node:child_process";
import { PUBLIC, EXPLORER } from "./public";

export type TxRef = { method: string; signer: string; hash: string; explorer: string };

function scrub(text: string): string {
  return text.replace(/ed25519:[1-9A-HJ-NP-Za-km-z]+/g, "ed25519:[REDACTED]");
}

function runNear(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("near", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      out += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(scrub(out).slice(-2500)));
      else resolve(out);
    });
  });
}

function txHash(text: string): string {
  const match = text.match(/Transaction ID:\s*([A-Za-z0-9]+)/);
  if (!match) throw new Error(scrub(text).slice(-1500));
  return match[1];
}

export function txRef(method: string, signer: string, hash: string): TxRef {
  return { method, signer, hash, explorer: `${EXPLORER}/${hash}` };
}

async function rpc<T>(method: string, params: unknown): Promise<T> {
  const response = await fetch(PUBLIC.rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "taskbond", method, params }),
  });
  const body = (await response.json()) as { result?: T; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message ?? "rpc error");
  return body.result as T;
}

export async function view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  const result = await rpc<{ result: number[] }>("query", {
    request_type: "call_function",
    finality: "final",
    account_id: PUBLIC.contract,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
  });
  return JSON.parse(Buffer.from(result.result).toString("utf8")) as T;
}

export async function balance(accountId: string): Promise<bigint> {
  const result = await rpc<{ amount: string }>("query", {
    request_type: "view_account",
    finality: "final",
    account_id: accountId,
  });
  return BigInt(result.amount);
}

export async function call(
  signer: string,
  method: string,
  args: Record<string, unknown>,
  depositYocto = 0n,
  gas = "150000000000000",
): Promise<TxRef> {
  const cmd = [
    "call",
    PUBLIC.contract,
    method,
    JSON.stringify(args),
    "--use-account",
    signer,
    "--network-id",
    "testnet",
    "--gas",
    gas,
  ];
  if (depositYocto > 0n) cmd.push("--deposit-yocto", depositYocto.toString());
  const text = await runNear(cmd);
  return txRef(method, signer, txHash(text));
}

export async function waitForChange(accountId: string, previous: bigint): Promise<bigint> {
  for (let i = 0; i < 20; i += 1) {
    const current = await balance(accountId);
    if (current !== previous) return current;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return balance(accountId);
}
