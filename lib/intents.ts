/**
 * NEAR Intents 1Click API (https://1click.chaindefuser.com). Mainnet only:
 * there is no Intents testnet. Every quote here is `dry: true`, which prices
 * the swap and returns no deposit address, so nothing can be settled.
 */
export const ONECLICK = "https://1click.chaindefuser.com/v0";
export const WNEAR = "nep141:wrap.near";

export type IntentsToken = { assetId: string; decimals: number; blockchain: string; symbol: string; price: number | null; priceUpdatedAt?: string };

export const CHAIN_NAMES: Record<string, string> = {
  near: "NEAR", eth: "Ethereum", sol: "Solana", base: "Base", arb: "Arbitrum", btc: "Bitcoin", bsc: "BNB Chain", op: "Optimism", pol: "Polygon",
  avax: "Avalanche", tron: "Tron", ton: "TON", sui: "Sui", aptos: "Aptos", doge: "Dogecoin", xrp: "XRP Ledger", zec: "Zcash", ltc: "Litecoin",
  bch: "Bitcoin Cash", gnosis: "Gnosis", stellar: "Stellar", cardano: "Cardano", starknet: "Starknet", bera: "Berachain", monad: "Monad", scroll: "Scroll",
  plasma: "Plasma", hypercore: "Hyperliquid", xlayer: "X Layer", dash: "Dash", movement: "Movement", aleo: "Aleo", miden: "Miden", hood: "Robinhood Chain",
};

export function chainName(id: string) {
  return CHAIN_NAMES[id] ?? id.toUpperCase();
}

/** Normalize conventional tickers at the provider boundary, not with CSS.
 * Branded mixed-case assets (wNEAR, stNEAR, USDe, etc.) keep their spelling.
 */
const STANDARD_SYMBOLS = new Set([
  "NEAR", "SOL", "ETH", "BTC", "USDC", "USDT", "ZEC", "BNB", "AVAX",
  "TRX", "TON", "SUI", "APT", "DOGE", "XRP", "LTC", "BCH", "XLM",
  "ADA", "STRK", "MON", "POL", "DAI", "LINK", "UNI", "AAVE",
]);

export function normalizeAssetSymbol(symbol: string): string {
  const trimmed = symbol.trim();
  const upper = trimmed.toUpperCase();
  return STANDARD_SYMBOLS.has(upper) ? upper : trimmed;
}

/** Schema example is `2019-08-24T14:15:22Z`: seconds, no milliseconds. */
export function quoteDeadline(now = new Date()): string {
  return new Date(now.getTime() + 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export type DryQuoteRequest = {
  dry: true;
  swapType: "EXACT_OUTPUT";
  slippageTolerance: number;
  originAsset: string;
  destinationAsset: string;
  amount: string;
  depositType: "ORIGIN_CHAIN";
  recipient: string;
  recipientType: "INTENTS";
  refundTo: string;
  refundType: "INTENTS";
  deadline: string;
  quoteWaitingTimeMs: 0;
};

/**
 * "Fund this job from any chain": EXACT_OUTPUT of wNEAR equal to the job's
 * escrow, paid from the chosen origin asset. Recipient/refund are Intents
 * accounts on mainnet NEAR (refundType INTENTS works for every origin chain
 * without needing a chain-specific refund address).
 */
export function buildDryQuoteRequest(originAsset: string, yoctoOut: string, recipient: string, now = new Date()): DryQuoteRequest {
  if (!/^[a-z0-9._-]{2,64}$/.test(recipient)) throw new Error("recipient must be a NEAR mainnet account id");
  if (!/^[a-zA-Z0-9:._\-]{4,200}$/.test(originAsset)) throw new Error("bad origin asset");
  if (!/^\d{1,40}$/.test(yoctoOut) || BigInt(yoctoOut) <= 0n) throw new Error("bad amount");
  return {
    dry: true,
    swapType: "EXACT_OUTPUT",
    slippageTolerance: 100,
    originAsset,
    destinationAsset: WNEAR,
    amount: yoctoOut,
    depositType: "ORIGIN_CHAIN",
    recipient,
    recipientType: "INTENTS",
    refundTo: recipient,
    refundType: "INTENTS",
    deadline: quoteDeadline(now),
    quoteWaitingTimeMs: 0,
  };
}

export function stripSettlementFields(quote: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...quote };
  delete copy.depositAddress;
  delete copy.depositMemo;
  delete copy.deadline;
  delete copy.timeWhenInactive;
  delete copy.chainDepositAddresses;
  return copy;
}

export type QuotePreview = {
  ok: true;
  dry: true;
  settlement: "not-performed";
  originAsset: string;
  amountIn: string;
  amountInFormatted: string | null;
  amountInUsd: string | null;
  minAmountIn: string | null;
  amountOut: string;
  amountOutFormatted: string | null;
  amountOutUsd: string | null;
  timeEstimate: number | null;
  correlationId: string | null;
  depositAddressDiscarded: boolean;
  requestedAt: string;
};

export type QuoteFailure = { ok: false; dry: true; settlement: "not-performed"; error: string };

export async function dryQuote(originAsset: string, yoctoOut: string, recipient: string, fetchImpl: typeof fetch = fetch): Promise<QuotePreview | QuoteFailure> {
  let request: DryQuoteRequest;
  try {
    request = buildDryQuoteRequest(originAsset, yoctoOut, recipient);
  } catch (e) {
    return { ok: false, dry: true, settlement: "not-performed", error: e instanceof Error ? e.message : "bad request" };
  }
  if (request.dry !== true) return { ok: false, dry: true, settlement: "not-performed", error: "refusing a quote that is not dry" };
  let response: Response;
  try {
    response = await fetchImpl(`${ONECLICK}/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "Taskbond/2.0 (dry quote)" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    return { ok: false, dry: true, settlement: "not-performed", error: error instanceof Error ? error.message : "quote failed" };
  }
  const text = await response.text();
  let body: { quote?: Record<string, unknown>; message?: string; correlationId?: string } = {};
  try {
    body = JSON.parse(text);
  } catch {
    /* keep text */
  }
  if (!response.ok) return { ok: false, dry: true, settlement: "not-performed", error: body.message ? String(body.message).slice(0, 240) : `1Click ${response.status}` };
  const raw = body.quote ?? {};
  const discarded = raw.depositAddress != null || raw.timeWhenInactive != null;
  const q = stripSettlementFields(raw);
  const s = (v: unknown) => (v == null ? null : String(v));
  return {
    ok: true,
    dry: true,
    settlement: "not-performed",
    originAsset,
    amountIn: String(q.amountIn ?? ""),
    amountInFormatted: s(q.amountInFormatted),
    amountInUsd: s(q.amountInUsd),
    minAmountIn: s(q.minAmountIn),
    amountOut: String(q.amountOut ?? yoctoOut),
    amountOutFormatted: s(q.amountOutFormatted),
    amountOutUsd: s(q.amountOutUsd),
    timeEstimate: typeof q.timeEstimate === "number" ? q.timeEstimate : null,
    correlationId: s(body.correlationId),
    depositAddressDiscarded: discarded,
    requestedAt: new Date().toISOString(),
  };
}

export async function listTokens(fetchImpl: typeof fetch = fetch): Promise<IntentsToken[]> {
  const res = await fetchImpl(`${ONECLICK}/tokens`, { signal: AbortSignal.timeout(15_000), headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`1Click tokens ${res.status}`);
  const all = (await res.json()) as IntentsToken[];
  return all.filter((t) => t.assetId !== WNEAR && typeof t.symbol === "string").map((t) => ({ ...t, symbol: normalizeAssetSymbol(t.symbol) }));
}
