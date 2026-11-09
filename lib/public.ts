import config from "@/config/testnet-public.json";

export const PUBLIC = config;

export function yocto(near: string): string {
  const [whole, frac = ""] = near.split(".");
  const padded = (frac + "0".repeat(24)).slice(0, 24);
  return (BigInt(whole || "0") * 10n ** 24n + BigInt(padded)).toString();
}

export function formatNear(value: string | number | bigint, digits = 4): string {
  const v = BigInt(value);
  const whole = v / 10n ** 24n;
  const frac = (v % 10n ** 24n).toString().padStart(24, "0").slice(0, digits);
  return digits > 0 ? `${whole}.${frac}` : whole.toString();
}

export const EXPLORER_TX = "https://testnet.nearblocks.io/txns";
export const EXPLORER_ACCOUNT = "https://testnet.nearblocks.io/address";
export const txUrl = (hash: string) => `${EXPLORER_TX}/${hash}`;
export const accountUrl = (id: string) => `${EXPLORER_ACCOUNT}/${id}`;

/** Contract constants (contract/src/lib.rs). */
export const JOB_STORAGE = 30_000_000_000_000_000_000_000n;
export const AGENT_STORAGE = 80_000_000_000_000_000_000_000n;
export const GAS_RESERVE = 5_000_000_000_000_000_000_000n;
export const MIN_REWARD = 100_000_000_000_000_000_000_000n;
