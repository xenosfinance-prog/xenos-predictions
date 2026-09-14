/**
 * lib/lmsr.ts
 *
 * Logarithmic Market Scoring Rule engine for Xenos Predictions.
 * Pure functions only — no Prisma, no I/O. Everything here is
 * synchronous and side-effect free so it can be unit tested in
 * isolation and reused identically on the client (for live price
 * previews) and server (for actual settlement).
 *
 * SCALE CONVENTION
 * -----------------
 * The database stores qYes, qNo, shares, and points as BigInt
 * "micro-units" (1 point = MICRO_SCALE micro-points, 1 share =
 * MICRO_SCALE micro-shares). This module accepts and returns BigInt
 * at its public boundary, but does the actual exp()/ln() math in
 * JS `number` (float64) after converting down to whole units —
 * float64 has 53 bits of exact integer precision, comfortably more
 * than this market size ever needs, and the LMSR cost function is
 * inherently transcendental (there is no exact-integer formulation),
 * so *some* floating point is unavoidable. What we guarantee is that
 * floating point never leaks into a PERSISTED value uncontrolled —
 * every function here rounds its final result back to an integer
 * number of micro-points/micro-shares before returning, using
 * round-half-away-from-zero so cost/proceeds never silently favor
 * the house or the trader by a rounding direction.
 */

export const MICRO_SCALE = 1_000_000n;

export type Outcome = "YES" | "NO";

/** Convert a BigInt micro-unit value to a float64 whole-unit value for math. */
function toFloat(microUnits: bigint): number {
  return Number(microUnits) / Number(MICRO_SCALE);
}

/** Convert a float64 whole-unit value back to a rounded BigInt micro-unit value. */
function toMicroBigInt(units: number): bigint {
  const micro = units * Number(MICRO_SCALE);
  // round-half-away-from-zero, not banker's rounding — see module
  // docstring: we don't want a rounding-direction bias either way.
  const rounded = micro >= 0 ? Math.floor(micro + 0.5) : Math.ceil(micro - 0.5);
  return BigInt(rounded);
}

/**
 * LMSR cost function: C(qYes, qNo) = b * ln(exp(qYes/b) + exp(qNo/b))
 *
 * Computed with the standard log-sum-exp shift (subtract the max
 * exponent before exponentiating, add it back after taking the log)
 * to avoid overflow for large q/b ratios — without this, exp() of a
 * moderately large share count blows past float64 range and the
 * function silently returns Infinity instead of a real cost.
 */
function costFn(qYes: number, qNo: number, b: number): number {
  const eY = qYes / b;
  const eN = qNo / b;
  const m = Math.max(eY, eN);
  return b * (m + Math.log(Math.exp(eY - m) + Math.exp(eN - m)));
}

/**
 * Current price (implied probability) of an outcome, in [0, 1].
 * price(YES) + price(NO) always sums to exactly 1 by construction —
 * that's the defining property of LMSR.
 */
export function price(qYes: bigint, qNo: bigint, b: bigint, outcome: Outcome): number {
  const fYes = toFloat(qYes);
  const fNo = toFloat(qNo);
  const fB = toFloat(b);
  const eY = fYes / fB;
  const eN = fNo / fB;
  const m = Math.max(eY, eN);
  const expY = Math.exp(eY - m);
  const expN = Math.exp(eN - m);
  return outcome === "YES" ? expY / (expY + expN) : expN / (expY + expN);
}

/**
 * Cost in points to buy `deltaShares` (must be > 0) of `outcome`,
 * given the market's current qYes/qNo/b. This is C(q_after) -
 * C(q_before) — always positive for a positive deltaShares, since
 * the cost function is strictly increasing in the outcome you're
 * buying.
 *
 * Use this when the user specifies "buy exactly N shares" and you
 * need to know what that costs. For the inverse — "I have N points
 * to spend, how many shares do I get" — see sharesForSpend below.
 */
export function costToBuy(
  qYes: bigint,
  qNo: bigint,
  b: bigint,
  outcome: Outcome,
  deltaShares: bigint
): bigint {
  if (deltaShares <= 0n) {
    throw new Error("costToBuy: deltaShares must be positive — use costToSell for exits");
  }
  const fB = toFloat(b);
  const fYesBefore = toFloat(qYes);
  const fNoBefore = toFloat(qNo);
  const fDelta = toFloat(deltaShares);

  const costBefore = costFn(fYesBefore, fNoBefore, fB);
  const fYesAfter = outcome === "YES" ? fYesBefore + fDelta : fYesBefore;
  const fNoAfter = outcome === "NO" ? fNoBefore + fDelta : fNoBefore;
  const costAfter = costFn(fYesAfter, fNoAfter, fB);

  return toMicroBigInt(costAfter - costBefore);
}

/**
 * Proceeds in points from selling `deltaShares` (must be > 0) of
 * `outcome` back into the market. Symmetric to costToBuy — this is
 * C(q_before) - C(q_after), i.e. how much the cost function drops
 * when you remove shares.
 *
 * Caller is responsible for checking the seller actually holds at
 * least deltaShares before calling this — this function only does
 * the pricing math, not the position check.
 */
export function proceedsFromSell(
  qYes: bigint,
  qNo: bigint,
  b: bigint,
  outcome: Outcome,
  deltaShares: bigint
): bigint {
  if (deltaShares <= 0n) {
    throw new Error("proceedsFromSell: deltaShares must be positive");
  }
  const fB = toFloat(b);
  const fYesBefore = toFloat(qYes);
  const fNoBefore = toFloat(qNo);
  const fDelta = toFloat(deltaShares);

  const costBefore = costFn(fYesBefore, fNoBefore, fB);
  const fYesAfter = outcome === "YES" ? fYesBefore - fDelta : fYesBefore;
  const fNoAfter = outcome === "NO" ? fNoBefore - fDelta : fNoBefore;
  const costAfter = costFn(fYesAfter, fNoAfter, fB);

  return toMicroBigInt(costBefore - costAfter);
}

/**
 * Binary-search solver: given a fixed points budget, find the
 * largest deltaShares such that costToBuy(...) <= pointsToSpend.
 *
 * This is the function the "Buy" UI actually calls in the common
 * case — a user types "I want to spend 50 points" (not "I want 83.4
 * shares"), and we need to invert a transcendental cost function
 * with no closed-form inverse. costFn is strictly monotonic in
 * deltaShares, so binary search converges reliably; we run it in
 * float64 space (mirroring costToBuy's own precision) and only
 * round to a BigInt micro-share count at the very end.
 *
 * The result is guaranteed to cost <= pointsToSpend when re-priced
 * through costToBuy (never over-spend due to rounding) — we verify
 * this with one final check-and-step-down after the search.
 */
export function sharesForSpend(
  qYes: bigint,
  qNo: bigint,
  b: bigint,
  outcome: Outcome,
  pointsToSpend: bigint
): bigint {
  if (pointsToSpend <= 0n) {
    throw new Error("sharesForSpend: pointsToSpend must be positive");
  }

  const fB = toFloat(b);
  const fYesBefore = toFloat(qYes);
  const fNoBefore = toFloat(qNo);
  const budget = toFloat(pointsToSpend);
  const costBefore = costFn(fYesBefore, fNoBefore, fB);

  const costOfDelta = (delta: number): number => {
    const fYesAfter = outcome === "YES" ? fYesBefore + delta : fYesBefore;
    const fNoAfter = outcome === "NO" ? fNoBefore + delta : fNoBefore;
    return costFn(fYesAfter, fNoAfter, fB) - costBefore;
  };

  // Establish a search upper bound by doubling until cost exceeds
  // budget — cheaper than guessing a fixed bound that might be wrong
  // for very large or very small b.
  let hi = 1;
  while (costOfDelta(hi) < budget) {
    hi *= 2;
    if (hi > 1e15) break; // pathological input guard — shouldn't happen with real b/budget
  }
  let lo = 0;

  // 100 iterations is far more than needed for float64 convergence
  // on any realistic range, but the loop is cheap and this keeps the
  // function correct even for extreme b values without tuning.
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (costOfDelta(mid) <= budget) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  let sharesMicro = toMicroBigInt(lo);

  // Final safety: rounding toMicroBigInt could, in principle, round
  // UP past the budget by a fraction of a micro-point. Step down by
  // one micro-share at a time (bounded, cheap) until re-pricing
  // through the real costToBuy confirms we're within budget — this
  // is the guarantee callers rely on to never overspend a user's
  // exact balance.
  while (sharesMicro > 0n && costToBuy(qYes, qNo, b, outcome, sharesMicro) > pointsToSpend) {
    sharesMicro -= 1n;
  }

  return sharesMicro;
}
