import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export const SOURCE_INDEX = [
  {
    id: "account-model",
    url: "https://docs.near.org/protocol/accounts-contracts/account-model.md",
    file: "account-model.txt",
  },
  {
    id: "access-keys",
    url: "https://docs.near.org/protocol/accounts-contracts/access-keys.md",
    file: "access-keys.txt",
  },
  {
    id: "faucet",
    url: "https://docs.near.org/getting-started/faucet.md",
    file: "faucet.txt",
  },
] as const;

export type SourceRecord = { id: string; url: string; sha256: string; body: string };

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function loadPack(root = process.cwd()): { sources: SourceRecord[]; packHash: string } {
  const sources = SOURCE_INDEX.map((entry) => {
    const body = readFileSync(path.join(root, "sources", entry.file), "utf8");
    return { id: entry.id, url: entry.url, sha256: sha256(body), body };
  });
  const material = sources.map((source) => `${source.id}\n${source.sha256}\n`).join("");
  return { sources, packHash: sha256(material) };
}
