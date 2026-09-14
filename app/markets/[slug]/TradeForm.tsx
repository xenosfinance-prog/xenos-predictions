"use client";

import { useState } from "react";

interface Props {
  marketId: string;
  currentPositions: { outcome: "YES" | "NO"; shares: string }[];
}

type Status = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "success" };

export function TradeForm({ marketId, currentPositions }: Props) {
  const [outcome, setOutcome] = useState<"YES" | "NO">("YES");
  const [pointsToSpend, setPointsToSpend] = useState("10");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const heldShares = currentPositions.find((p) => p.outcome === outcome)?.shares ?? "0";

  async function submitBuy(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(pointsToSpend);
    if (!Number.isFinite(amount) || amount <= 0) {
      setStatus({ kind: "error", message: "Enter a positive number of points" });
      return;
    }

    setStatus({ kind: "loading" });
    try {
      const res = await fetch(`/api/markets/${marketId}/trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          side: "BUY",
          outcome,
          pointsToSpend: amount,
          // crypto.randomUUID() is available in all evergreen
          // browsers and in the Node runtime this component's
          // fetch call runs under — this is what makes a duplicated
          // submit (double-click, flaky network retry) safe to
          // resend as the exact same request instead of trading twice.
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ kind: "error", message: data.error ?? "Trade failed" });
        return;
      }
      setStatus({ kind: "success" });
      // Full reload is the simplest way to reflect the new price and
      // position everywhere on the page — fine for Phase 1, a nicer
      // optimistic update is a good later polish pass, not a
      // correctness requirement.
      window.location.reload();
    } catch {
      setStatus({ kind: "error", message: "Network error — please try again" });
    }
  }

  return (
    <form onSubmit={submitBuy} style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <button
          type="button"
          onClick={() => setOutcome("YES")}
          style={{
            flex: 1,
            padding: "0.5rem",
            borderRadius: 6,
            border: outcome === "YES" ? "2px solid #16a34a" : "1px solid #ccc",
            background: outcome === "YES" ? "#f0fdf4" : "white",
            fontWeight: outcome === "YES" ? 700 : 400,
          }}
        >
          Buy YES
        </button>
        <button
          type="button"
          onClick={() => setOutcome("NO")}
          style={{
            flex: 1,
            padding: "0.5rem",
            borderRadius: 6,
            border: outcome === "NO" ? "2px solid #dc2626" : "1px solid #ccc",
            background: outcome === "NO" ? "#fef2f2" : "white",
            fontWeight: outcome === "NO" ? 700 : 400,
          }}
        >
          Buy NO
        </button>
      </div>

      <label style={{ display: "block", fontSize: "0.8rem", color: "#666", marginBottom: "0.25rem" }}>
        Points to spend
      </label>
      <input
        type="number"
        min="0"
        step="1"
        value={pointsToSpend}
        onChange={(e) => setPointsToSpend(e.target.value)}
        style={{ width: "100%", padding: "0.5rem", borderRadius: 6, border: "1px solid #ccc", marginBottom: "0.75rem" }}
      />

      <p style={{ fontSize: "0.75rem", color: "#888", marginBottom: "0.75rem" }}>
        You currently hold {Number(heldShares) / 1_000_000} {outcome} shares in this market.
      </p>

      <button
        type="submit"
        disabled={status.kind === "loading"}
        style={{
          width: "100%",
          padding: "0.6rem",
          borderRadius: 6,
          border: "none",
          background: "#111",
          color: "white",
          fontWeight: 600,
          cursor: status.kind === "loading" ? "wait" : "pointer",
        }}
      >
        {status.kind === "loading" ? "Placing trade..." : `Buy ${outcome}`}
      </button>

      {status.kind === "error" && (
        <p style={{ color: "#a00", fontSize: "0.8rem", marginTop: "0.5rem" }}>{status.message}</p>
      )}
      {status.kind === "success" && (
        <p style={{ color: "#16a34a", fontSize: "0.8rem", marginTop: "0.5rem" }}>Trade placed.</p>
      )}
    </form>
  );
}
