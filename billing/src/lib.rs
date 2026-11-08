//! Integer reimbursement math.
//!
//! Prices are per token in nanoUSD (scale 9), matching NEAR AI
//! `amount / 10^scale`. The operator rate is yoctoNEAR per 1 nanoUSD.
//! The product is exact. There is no float and no per-million rounding.

pub fn cost_yocto(
    input_price: u128,
    output_price: u128,
    input_tokens: u64,
    output_tokens: u64,
    yocto_per_nano: u128,
) -> Result<u128, &'static str> {
    if yocto_per_nano == 0 {
        return Err("rate unset");
    }
    let in_cost = (input_tokens as u128)
        .checked_mul(input_price)
        .ok_or("input cost overflow")?;
    let out_cost = (output_tokens as u128)
        .checked_mul(output_price)
        .ok_or("output cost overflow")?;
    let nano = in_cost.checked_add(out_cost).ok_or("cost overflow")?;
    nano.checked_mul(yocto_per_nano).ok_or("yocto overflow")
}

#[cfg(test)]
mod tests {
    use super::cost_yocto;

    const RATE: u128 = 1_000_000_000_000_000; // 10^15: 1 USD = 1 NEAR

    #[test]
    fn qwen_worst_case_matches_hand_calculation() {
        // Qwen/Qwen3.8-27B catalog snapshot used by the deploy script:
        // input 40 nanoUSD, output 1350 nanoUSD, context 262144, max output 65536.
        let yocto = cost_yocto(40, 1350, 262_144, 65_536, RATE).unwrap();
        let nano = 262_144u128 * 40 + 65_536u128 * 1350;
        assert_eq!(nano, 98_959_360);
        assert_eq!(yocto, nano * RATE);
    }

    #[test]
    fn zero_tokens_are_free() {
        assert_eq!(cost_yocto(40, 1350, 0, 0, RATE).unwrap(), 0);
    }

    #[test]
    fn overflow_is_rejected() {
        let err = cost_yocto(u128::MAX, 1, 2, 0, RATE).unwrap_err();
        assert_eq!(err, "input cost overflow");
    }

    #[test]
    fn unset_rate_is_rejected() {
        assert_eq!(cost_yocto(1, 1, 1, 1, 0).unwrap_err(), "rate unset");
    }
}
