"use client";

import { useEffect, useState } from "react";

interface PricePoint {
  timestamp: string;
  yesPrice: number;
}

const WIDTH = 640;
const HEIGHT = 160;
const PADDING = 8;

export function PriceChart({ marketId }: { marketId: string }) {
  const [points, setPoints] = useState<PricePoint[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/markets/${marketId}/price-history`)
      .then((r) => r.json())
      .then((data: PricePoint[]) => {
        if (!cancelled) setPoints(data);
      })
      .catch(() => {
        if (!cancelled) setPoints([]);
      });
    return () => {
      cancelled = true;
    };
  }, [marketId]);

  if (points === null) {
    return <div style={{ height: HEIGHT, display: "flex", alignItems: "center", color: "#999", fontSize: "0.8rem" }}>Loading chart…</div>;
  }

  if (points.length < 2) {
    return (
      <div style={{ height: HEIGHT, display: "flex", alignItems: "center", color: "#999", fontSize: "0.8rem" }}>
        Not enough trades yet for a price history chart.
      </div>
    );
  }

  // Map each point's yesPrice (always in [0,1]) to an SVG y coordinate,
  // and each point's index to an evenly-spaced x coordinate — a
  // time-proportional x-axis would be more accurate for irregular
  // trade spacing, but even-spacing keeps the chart readable when
  // trades cluster tightly together in time, which is common right
  // after a market opens.
  const xStep = (WIDTH - PADDING * 2) / (points.length - 1);
  const toXY = (p: PricePoint, i: number): [number, number] => {
    const x = PADDING + i * xStep;
    const y = PADDING + (1 - p.yesPrice) * (HEIGHT - PADDING * 2);
    return [x, y];
  };

  const pathD = points
    .map((p, i) => {
      const [x, y] = toXY(p, i);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const lastPrice = points[points.length - 1].yesPrice;

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ display: "block" }}>
        {/* 50% reference line — the "no information" baseline */}
        <line
          x1={PADDING}
          y1={PADDING + 0.5 * (HEIGHT - PADDING * 2)}
          x2={WIDTH - PADDING}
          y2={PADDING + 0.5 * (HEIGHT - PADDING * 2)}
          stroke="#eee"
          strokeWidth={1}
        />
        <path d={pathD} fill="none" stroke={lastPrice >= 0.5 ? "#16a34a" : "#dc2626"} strokeWidth={2} />
      </svg>
      <div style={{ fontSize: "0.7rem", color: "#999", marginTop: "0.25rem" }}>
        {points.length} trades · YES price over time (line only, no dates on axis in this minimal version)
      </div>
    </div>
  );
}
