/** Integer reimbursement math. Must match `taskbond-billing` in the contract. */

const U128_MAX = (1n << 128n) - 1n;

export function costYocto(
  inputPrice: bigint,
  outputPrice: bigint,
  inputTokens: bigint,
  outputTokens: bigint,
  yoctoPerNano: bigint,
): bigint {
  if (yoctoPerNano <= 0n) throw new Error("rate unset");
  const nano = inputTokens * inputPrice + outputTokens * outputPrice;
  const yocto = nano * yoctoPerNano;
  if (yocto > U128_MAX) throw new Error("yocto overflow");
  return yocto;
}

export function worstCaseYocto(model: {
  inputAmount: bigint;
  outputAmount: bigint;
  contextLength: bigint;
  maxOutput: bigint;
  yoctoPerNano: bigint;
}): bigint {
  return costYocto(
    model.inputAmount,
    model.outputAmount,
    model.contextLength,
    model.maxOutput,
    model.yoctoPerNano,
  );
}

/** Tokenizer is not verified. The contract therefore reserves the frozen context window. */
export const TOKENIZER_STATUS = "unverified-full-context-ceiling" as const;
