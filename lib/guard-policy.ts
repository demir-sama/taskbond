/**
 * Deterministic prefilter. It is not a security boundary. The contract cap is.
 * Quoted attack text is not treated as an instruction. Operative text is.
 */

export type GuardDecision = { decision: "approve" | "reject"; reason: string; layer: "deterministic" };

const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g;

function normalize(value: string): string {
  return value.normalize("NFKC").replace(ZERO_WIDTH, "").toLowerCase();
}

function decodeBlobs(value: string): string {
  const chunks: string[] = [];
  for (const match of value.match(/[A-Za-z0-9+/]{16,}={0,2}/g) ?? []) {
    try {
      const decoded = Buffer.from(match, "base64").toString("utf8");
      if (/^[\x09\x0a\x0d\x20-\x7e]+$/.test(decoded)) chunks.push(decoded);
    } catch {
      /* ignore */
    }
  }
  for (const match of value.match(/\b(?:0x)?[0-9a-fA-F]{16,}\b/g) ?? []) {
    const hex = match.replace(/^0x/, "");
    if (hex.length % 2) continue;
    const decoded = Buffer.from(hex, "hex").toString("utf8");
    if (/^[\x09\x0a\x0d\x20-\x7e]+$/.test(decoded)) chunks.push(decoded);
  }
  return chunks.join("\n");
}

function splitQuotes(value: string): { quoted: string; operative: string } {
  const quoted: string[] = [];
  const operative = value.replace(/"([^"]*)"|'([^']*)'|“([^”]*)”/g, (_all, a, b, c) => {
    quoted.push(a ?? b ?? c ?? "");
    return " ";
  });
  return { quoted: quoted.join("\n"), operative };
}

const ATTACK =
  /ignore\s+(?:all\s+|any\s+|the\s+)?previous\s+instructions|you\s+are\s+now\b|new\s+system\s+prompt|jailbreak|reveal\s+(?:the\s+)?(?:api\s+key|private\s+key|system\s+prompt)|(?:transfer|send|drain|withdraw)\b[\s\S]{0,80}\b(?:escrow|deposit|funds|budget|near)\b|do\s+not\s+(?:summarize|cite)|write\s+(?:me\s+)?a\s+poem|ignore\s+the\s+(?:research\s+)?job/;

export function decideGuard(prompt: string): GuardDecision {
  if (!prompt.trim()) return { decision: "reject", reason: "Empty prompt.", layer: "deterministic" };
  const decoded = decodeBlobs(prompt);
  const combined = `${prompt}\n${decoded}`;
  const { quoted, operative } = splitQuotes(combined);
  const operativeNorm = normalize(operative);
  const quotedNorm = normalize(quoted);
  const operativeHit = operativeNorm.match(ATTACK);
  if (operativeHit) {
    return {
      decision: "reject",
      reason: `Operative instruction looks like ${operativeHit[0].slice(0, 80)}.`,
      layer: "deterministic",
    };
  }
  const research = /summar|cite|source|research|quote/.test(operativeNorm);
  if (!research) {
    return { decision: "reject", reason: "Prompt does not ask for the sourced research job.", layer: "deterministic" };
  }
  if (ATTACK.test(quotedNorm)) {
    return {
      decision: "approve",
      reason: "Attack text is only quoted. The operative instruction stays on the research job.",
      layer: "deterministic",
    };
  }
  return { decision: "approve", reason: "Operative instruction stays on the sourced research job.", layer: "deterministic" };
}
