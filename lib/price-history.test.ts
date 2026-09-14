import { describe, it, expect } from "vitest";
import { derivePriceHistory } from "./price-history";
import { MICRO_SCALE } from "./lmsr";

const b = 100n * MICRO_SCALE;

describe("derivePriceHistory", () => {
  it("returns one point per trade, in the same order given", () => {
    const trades = [
      { createdAt: new Date("2027-01-01T00:00:00Z"), qYesAfter: 0n, qNoAfter: 0n },
      { createdAt: new Date("2027-01-02T00:00:00Z"), qYesAfter: 10n * MICRO_SCALE, qNoAfter: 0n },
    ];
    const points = derivePriceHistory(trades, b);
    expect(points).toHaveLength(2);
    expect(points[0].timestamp).toBe("2027-01-01T00:00:00.000Z");
    expect(points[1].timestamp).toBe("2027-01-02T00:00:00.000Z");
  });

  it("shows price rising as qYes rises relative to qNo", () => {
    const trades = [
      { createdAt: new Date("2027-01-01T00:00:00Z"), qYesAfter: 0n, qNoAfter: 0n },
      { createdAt: new Date("2027-01-02T00:00:00Z"), qYesAfter: 20n * MICRO_SCALE, qNoAfter: 0n },
      { createdAt: new Date("2027-01-03T00:00:00Z"), qYesAfter: 50n * MICRO_SCALE, qNoAfter: 0n },
    ];
    const points = derivePriceHistory(trades, b);
    expect(points[0].yesPrice).toBeCloseTo(0.5, 5);
    expect(points[1].yesPrice).toBeGreaterThan(points[0].yesPrice);
    expect(points[2].yesPrice).toBeGreaterThan(points[1].yesPrice);
  });

  it("returns an empty array for an untraded market", () => {
    expect(derivePriceHistory([], b)).toEqual([]);
  });
});
