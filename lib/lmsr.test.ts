import { describe, it, expect } from "vitest";
import { price, costToBuy, proceedsFromSell, sharesForSpend, MICRO_SCALE } from "./lmsr";

const b = 100n * MICRO_SCALE; // liquidity parameter, 100 points

describe("price", () => {
  it("is exactly 0.5/0.5 at an untouched market (qYes = qNo = 0)", () => {
    expect(price(0n, 0n, b, "YES")).toBeCloseTo(0.5, 10);
    expect(price(0n, 0n, b, "NO")).toBeCloseTo(0.5, 10);
  });

  it("YES and NO prices always sum to 1", () => {
    const qYes = 37n * MICRO_SCALE;
    const qNo = 12n * MICRO_SCALE;
    const pYes = price(qYes, qNo, b, "YES");
    const pNo = price(qYes, qNo, b, "NO");
    expect(pYes + pNo).toBeCloseTo(1.0, 10);
  });

  it("price of an outcome rises as its own share quantity rises", () => {
    const p1 = price(0n, 0n, b, "YES");
    const p2 = price(10n * MICRO_SCALE, 0n, b, "YES");
    const p3 = price(50n * MICRO_SCALE, 0n, b, "YES");
    expect(p2).toBeGreaterThan(p1);
    expect(p3).toBeGreaterThan(p2);
    expect(p3).toBeLessThan(1.0);
  });
});

describe("costToBuy", () => {
  it("is always positive for a positive share purchase", () => {
    const cost = costToBuy(0n, 0n, b, "YES", 5n * MICRO_SCALE);
    expect(cost).toBeGreaterThan(0n);
  });

  it("costs more per share as the market moves against you (convexity)", () => {
    // Buying the first 10 shares should cost less than buying the
    // NEXT 10 shares once the price has already moved up.
    const costFirst10 = costToBuy(0n, 0n, b, "YES", 10n * MICRO_SCALE);
    const costSecond10 = costToBuy(10n * MICRO_SCALE, 0n, b, "YES", 10n * MICRO_SCALE);
    expect(costSecond10).toBeGreaterThan(costFirst10);
  });

  it("throws on non-positive deltaShares", () => {
    expect(() => costToBuy(0n, 0n, b, "YES", 0n)).toThrow();
    expect(() => costToBuy(0n, 0n, b, "YES", -1n)).toThrow();
  });

  it("matches the known closed-form cost for an untouched market", () => {
    // C(q,0) - C(0,0) for qYes = b, qNo = 0, starting from (0,0):
    // C(0,0) = b*ln(2). C(b,0) = b*ln(e^1 + e^0) = b*ln(e + 1).
    // cost = b*ln(e+1) - b*ln(2) = b * ln((e+1)/2)
    const bFloat = 100;
    const expected = bFloat * Math.log((Math.E + 1) / 2);
    const got = costToBuy(0n, 0n, b, "YES", b); // deltaShares == b, i.e. 100 shares
    const gotFloat = Number(got) / Number(MICRO_SCALE);
    expect(gotFloat).toBeCloseTo(expected, 4);
  });
});

describe("proceedsFromSell", () => {
  it("selling back everything you just bought returns very close to what you paid", () => {
    // Not EXACTLY equal — LMSR cost is convex, so buy-then-immediately
    // -sell of the same size in a market nobody else traded in should
    // net to ~0 slippage (no bid/ask spread is modeled in this MVP),
    // modulo integer rounding at the micro-point level.
    const qYesStart = 0n;
    const qNoStart = 0n;
    const delta = 8n * MICRO_SCALE;

    const cost = costToBuy(qYesStart, qNoStart, b, "YES", delta);
    const qYesAfterBuy = qYesStart + delta;
    const proceeds = proceedsFromSell(qYesAfterBuy, qNoStart, b, "YES", delta);

    const diff = cost > proceeds ? cost - proceeds : proceeds - cost;
    // within a few micro-points of rounding error, not points
    expect(diff).toBeLessThan(10n);
  });

  it("throws on non-positive deltaShares", () => {
    expect(() => proceedsFromSell(10n * MICRO_SCALE, 0n, b, "YES", 0n)).toThrow();
  });
});

describe("sharesForSpend", () => {
  it("never returns a share count whose real cost exceeds the budget", () => {
    const budget = 25n * MICRO_SCALE;
    const shares = sharesForSpend(0n, 0n, b, "YES", budget);
    const realCost = costToBuy(0n, 0n, b, "YES", shares);
    expect(realCost).toBeLessThanOrEqual(budget);
  });

  it("gets close to spending the full budget (doesn't leave much on the table)", () => {
    const budget = 25n * MICRO_SCALE;
    const shares = sharesForSpend(0n, 0n, b, "YES", budget);
    const realCost = costToBuy(0n, 0n, b, "YES", shares);
    const oneMoreShareCost = costToBuy(0n, 0n, b, "YES", shares + 1n);
    // buying just one more micro-share should have pushed us over budget —
    // otherwise the solver stopped too early
    expect(oneMoreShareCost).toBeGreaterThan(budget);
    // and the shortfall itself should be tiny relative to the budget
    expect(budget - realCost).toBeLessThan(budget / 1000n + 10n);
  });

  it("is the inverse of costToBuy: spend(cost(N shares)) ≈ N shares", () => {
    const originalShares = 15n * MICRO_SCALE;
    const cost = costToBuy(0n, 0n, b, "YES", originalShares);
    const recoveredShares = sharesForSpend(0n, 0n, b, "YES", cost);
    const diff =
      recoveredShares > originalShares
        ? recoveredShares - originalShares
        : originalShares - recoveredShares;
    // within rounding tolerance, not a meaningful share count
    expect(diff).toBeLessThan(100n);
  });

  it("throws on non-positive pointsToSpend", () => {
    expect(() => sharesForSpend(0n, 0n, b, "YES", 0n)).toThrow();
  });
});
