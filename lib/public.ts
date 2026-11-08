import config from "@/config/testnet-public.json";

export const PUBLIC = config;

export function yocto(near: string): string {
  const [whole, frac = ""] = near.split(".");
  const padded = (frac + "0".repeat(24)).slice(0, 24);
  return (BigInt(whole || "0") * 10n ** 24n + BigInt(padded)).toString();
}

export function formatNear(yocto: string | number | bigint): string {
  const value = BigInt(yocto);
  const whole = value / 10n ** 24n;
  const frac = (value % 10n ** 24n).toString().padStart(24, "0").slice(0, 4);
  return `${whole}.${frac}`;
}

export const EXPLORER = "https://explorer.testnet.near.org/transactions";
