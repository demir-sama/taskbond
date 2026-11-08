const QUOTE_URL = "https://1click.chaindefuser.com/v0/quote";

export const INTENTS_ASSETS = {
  usdcArb: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near",
  usdcArbDecimals: 6,
  wrapNear: "nep141:wrap.near",
  wrapNearDecimals: 24,
};

/** Schema example is `2019-08-24T14:15:22Z`: seconds, no milliseconds. */
export function quoteDeadline(now = new Date()): string {
  return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export type DryQuoteRequest = {
  dry: true;
  swapType: "EXACT_INPUT";
  slippageTolerance: number;
  originAsset: string;
  destinationAsset: string;
  amount: string;
  depositType: "ORIGIN_CHAIN";
  recipient: string;
  recipientType: "INTENTS";
  refundTo: string;
  refundType: "ORIGIN_CHAIN";
  deadline: string;
  quoteWaitingTimeMs: 0;
};

/**
 * A DESTINATION_CHAIN quote of wNEAR to a `.testnet` account makes 1Click
 * answer 400 `Internal server error`. The solver cannot withdraw mainnet
 * wNEAR onto testnet. INTENTS prices the same swap and, with dry:true,
 * returns no deposit address.
 */
export function buildDryQuoteRequest(recipient: string, now = new Date()): DryQuoteRequest {
  if (!recipient || recipient.includes(" ")) throw new Error("recipient required");
  return {
    dry: true,
    swapType: "EXACT_INPUT",
    slippageTolerance: 100,
    originAsset: INTENTS_ASSETS.usdcArb,
    destinationAsset: INTENTS_ASSETS.wrapNear,
    amount: "5000000",
    depositType: "ORIGIN_CHAIN",
    recipient,
    recipientType: "INTENTS",
    refundTo: "0x2527D02599Ba641c19FEa793cD0F167589a0f10D",
    refundType: "ORIGIN_CHAIN",
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
  settlement: "not-performed";
  recipientType: "INTENTS";
  amountIn: string;
  amountInFormatted: string | null;
  amountOut: string | null;
  amountOutFormatted: string | null;
  amountOutUsd: string | null;
  minAmountOut: string | null;
  timeEstimate: number | null;
  depositAddressDiscarded: boolean;
  note: string;
};

export type QuoteFailure = { ok: false; settlement: "not-performed"; error: string };

export async function dryQuote(recipient: string): Promise<QuotePreview | QuoteFailure> {
  const requestBody = buildDryQuoteRequest(recipient);
  if (requestBody.dry !== true) {
    return { ok: false, settlement: "not-performed", error: "refusing a quote that is not dry" };
  }
  let response: Response;
  try {
    response = await fetch(QUOTE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Taskbond/1.0 (dry quote preview)",
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    return { ok: false, settlement: "not-performed", error: error instanceof Error ? error.message : "quote failed" };
  }
  if (!response.ok) {
    return {
      ok: false,
      settlement: "not-performed",
      error: `1Click ${response.status}: ${(await response.text()).slice(0, 280)}`,
    };
  }
  const body = (await response.json()) as { quote?: Record<string, unknown> };
  const raw = body.quote ?? {};
  const discarded = raw.depositAddress != null || raw.deadline != null || raw.timeWhenInactive != null;
  const quote = stripSettlementFields(raw);
  return {
    ok: true,
    settlement: "not-performed",
    recipientType: "INTENTS",
    amountIn: String(quote.amountIn ?? requestBody.amount),
    amountInFormatted: quote.amountInFormatted == null ? null : String(quote.amountInFormatted),
    amountOut: quote.amountOut == null ? null : String(quote.amountOut),
    amountOutFormatted: quote.amountOutFormatted == null ? null : String(quote.amountOutFormatted),
    amountOutUsd: quote.amountOutUsd == null ? null : String(quote.amountOutUsd),
    minAmountOut: quote.minAmountOut == null ? null : String(quote.minAmountOut),
    timeEstimate: typeof quote.timeEstimate === "number" ? quote.timeEstimate : null,
    depositAddressDiscarded: discarded,
    note: "Dry quote only. recipientType is INTENTS because a testnet account cannot receive a mainnet wNEAR withdrawal (that request 400s). No deposit address is kept. Nothing is settled and the testnet job is not funded.",
  };
}
