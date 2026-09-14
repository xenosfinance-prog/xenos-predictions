"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  marketId: string;
  initialQuestion: string;
  initialDescription: string;
  initialClosesAt: string;
}

export function EditMarketForm({ marketId, initialQuestion, initialDescription, initialClosesAt }: Props) {
  const router = useRouter();
  const [question, setQuestion] = useState(initialQuestion);
  const [description, setDescription] = useState(initialDescription);
  const [closesAt, setClosesAt] = useState(initialClosesAt);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/admin/markets/${marketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        description,
        closesAt: new Date(closesAt).toISOString(),
      }),
    });

    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to save changes");
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
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
          style={{ width: "100%", padding: "0.5rem", borderRadius: 6, border: "1px solid #ccc" }}
        />
      </div>

      <div>
        <label style={{ display: "block", fontSize: "0.8rem", color: "#666", marginBottom: "0.25rem" }}>
          Description
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
        {submitting ? "Saving..." : "Save changes"}
      </button>

      {error && <p style={{ color: "#a00", fontSize: "0.85rem" }}>{error}</p>}
    </form>
  );
}
