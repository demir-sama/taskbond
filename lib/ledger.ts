/**
 * Gates NEAR AI calls on a reservation acknowledgement.
 * Unknown billing is retained. A finished reservation cannot be replayed into another call.
 */

export type LedgerPhase = "reserved" | "api_started" | "settled" | "released_unbilled" | "unknown";

export type LedgerEntry = {
  id: string;
  phase: LedgerPhase;
  purpose: string;
};

export type ChainMeter = {
  reserve(id: string, agentId: number | null, purpose: "Guard" | "Worker" | "Reviewer"): Promise<void>;
  settle(id: string, inputTokens: number, outputTokens: number): Promise<void>;
};

export class Meter {
  private entries: Map<string, LedgerEntry>;
  private chain: ChainMeter;

  constructor(entries: Map<string, LedgerEntry>, chain: ChainMeter) {
    this.entries = entries;
    this.chain = chain;
  }

  get(id: string): LedgerEntry | undefined {
    return this.entries.get(id);
  }

  /** Reserve and release without ever permitting an API call. */
  async reserveAndReleaseUnbilled(id: string, agentId: number | null, purpose: "Guard" | "Worker" | "Reviewer") {
    const existing = this.entries.get(id);
    if (existing && existing.phase !== "reserved") {
      throw new Error(`cannot release ${id} from ${existing.phase}`);
    }
    if (!existing) {
      await this.chain.reserve(id, agentId, purpose);
      this.entries.set(id, { id, phase: "reserved", purpose });
    }
    await this.chain.settle(id, 0, 0);
    this.entries.set(id, { id, phase: "released_unbilled", purpose });
  }

  /** Persist api_started before the caller is allowed to contact NEAR AI. */
  async authorize(id: string, agentId: number | null, purpose: "Guard" | "Worker" | "Reviewer"): Promise<LedgerEntry> {
    const existing = this.entries.get(id);
    if (existing?.phase === "api_started" || existing?.phase === "unknown") {
      throw new Error("reservation is unresolved; refusing another API call");
    }
    if (existing && existing.phase !== "reserved") {
      throw new Error(`reservation ${id} is ${existing.phase}`);
    }
    if (!existing) {
      await this.chain.reserve(id, agentId, purpose);
    }
    const entry: LedgerEntry = { id, phase: "api_started", purpose };
    this.entries.set(id, entry);
    return entry;
  }

  async settleUsage(id: string, inputTokens: number, outputTokens: number) {
    const entry = this.require(id, "api_started");
    await this.chain.settle(id, inputTokens, outputTokens);
    entry.phase = "settled";
  }

  async markUnknown(id: string) {
    const entry = this.require(id, "api_started");
    entry.phase = "unknown";
  }

  private require(id: string, phase: LedgerPhase): LedgerEntry {
    const entry = this.entries.get(id);
    if (!entry || entry.phase !== phase) throw new Error(`reservation ${id} is not ${phase}`);
    return entry;
  }
}
