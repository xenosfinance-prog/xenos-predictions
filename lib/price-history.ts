/**
 * lib/price-history.ts
 *
 * No separate PricePoint table exists (or needs to) — every Trade
 * row already stores qYesAfter/qNoAfter at the moment it executed,
 * which is exactly the state needed to compute the market's price
 * at that point in time. This function just replays that log
 * through the same price() function the rest of the app uses, so
 * the chart is guaranteed to agree with the live price shown
 * elsewhere — there's no second pricing implementation to drift out
 * of sync.
 */

import { price, type Outcome } from "./lmsr";

export interface TradeSnapshot {
  createdAt: Date;
  qYesAfter: bigint;
  qNoAfter: bigint;
}

export interface PricePoint {
  timestamp: string; // ISO string — serializable straight to JSON, no BigInt/Date issues at the API boundary
  yesPrice: number;
}

/**
 * trades must be pre-sorted ascending by createdAt — this function
 * doesn't sort them itself, to avoid silently masking a caller bug
 * that fetched them in the wrong order.
 */
export function derivePriceHistory(trades: TradeSnapshot[], liquidityB: bigint): PricePoint[] {
  return trades.map((t) => ({
    timestamp: t.createdAt.toISOString(),
    yesPrice: price(t.qYesAfter, t.qNoAfter, liquidityB, "YES" as Outcome),
  }));
}
