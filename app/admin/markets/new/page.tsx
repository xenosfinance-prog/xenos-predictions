"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CATEGORIES = ["MACRO", "CENTRAL_BANKS", "FX", "COMMODITIES", "RATES", "GEOPOLITICS"] as const;

export default function NewMarketPage() {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("MACRO");
  const [closesAt, setClosesAt] = useState("");
  const [liquidityB, setLiquidityB] = useState("200");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/admin/markets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        description,
        category,
        closesAt: new Date(closesAt).toISOString(),
        liquidityB: Number(liquidityB),
      }),
    });

    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to create market");
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: "2rem 1rem", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "1.3rem", marginBottom: "1.5rem" }}>New market</h1>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div>
          <label style={{ display: "block", fontSize: "0.8rem", color: "#666", marginBottom: "0.25rem" }}>
            Question
          </label>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            required
            minLength={10}
            maxLength={300}
            placeholder="Will the Fed cut rates in March?"
            style={{ width: "100%", padding: "0.5rem", borderRadius: 6, border: "1px solid #ccc" }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: "0.8rem", color: "#666", marginBottom: "0.25rem" }}>
            Description — resolution criteria, be specific
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            minLength={10}
            maxLength={2000}
            rows={4}
            style={{ width: "100%", padding: "0.5rem", borderRadius: 6, border: "1px solid #ccc", fontFamily: "inherit" }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: "0.8rem", color: "#666", marginBottom: "0.25rem" }}>
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}
            style={{ width: "100%", padding: "0.5rem", borderRadius: 6, border: "1px solid #ccc" }}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: "block", fontSize: "0.8rem", color: "#666", marginBottom: "0.25rem" }}>
            Closes at
          </label>
          <input
            type="datetime-local"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
            required
            style={{ width: "100%", padding: "0.5rem", borderRadius: 6, border: "1px solid #ccc" }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: "0.8rem", color: "#666", marginBottom: "0.25rem" }}>
            Liquidity (b) — higher means prices move less per trade, default 200 is reasonable to start
          </label>
          <input
            type="number"
            min="1"
            value={liquidityB}
            onChange={(e) => setLiquidityB(e.target.value)}
            style={{ width: "100%", padding: "0.5rem", borderRadius: 6, border: "1px solid #ccc" }}
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: "0.6rem",
            borderRadius: 6,
            border: "none",
            background: "#111",
            color: "white",
            fontWeight: 600,
            cursor: submitting ? "wait" : "pointer",
          }}
        >
          {submitting ? "Creating..." : "Create market"}
        </button>

        {error && <p style={{ color: "#a00", fontSize: "0.85rem" }}>{error}</p>}
      </form>
    </main>
  );
}
