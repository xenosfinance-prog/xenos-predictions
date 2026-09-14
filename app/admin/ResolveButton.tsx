"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ResolveButton({ marketId, question }: { marketId: string; question: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolve(outcome: "YES" | "NO") {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/markets/${marketId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      // The most common rejection here is the anti-manipulation rule
      // itself — "resolver holds a position" — surface it verbatim so
      // the admin knows exactly what to exit before retrying, instead
      // of a generic failure message.
      setError(data.error ?? "Failed to resolve");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ padding: "0.25rem 0.6rem", borderRadius: 4, border: "1px solid #ccc", background: "white", fontSize: "0.8rem", cursor: "pointer" }}
      >
        Resolve
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", minWidth: 220 }}>
      <p style={{ fontSize: "0.75rem", color: "#a00", margin: 0 }}>
        Resolving &quot;{question}&quot; is permanent and immediately pays out winners. Confirm outcome:
      </p>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          disabled={submitting}
          onClick={() => resolve("YES")}
          style={{ flex: 1, padding: "0.35rem", borderRadius: 4, border: "1px solid #16a34a", background: "#f0fdf4", cursor: "pointer" }}
        >
          YES won
        </button>
        <button
          disabled={submitting}
          onClick={() => resolve("NO")}
          style={{ flex: 1, padding: "0.35rem", borderRadius: 4, border: "1px solid #dc2626", background: "#fef2f2", cursor: "pointer" }}
        >
          NO won
        </button>
        <button
          disabled={submitting}
          onClick={() => setOpen(false)}
          style={{ padding: "0.35rem 0.5rem", borderRadius: 4, border: "1px solid #ccc", background: "white", cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>
      {error && <p style={{ color: "#a00", fontSize: "0.75rem", margin: 0 }}>{error}</p>}
    </div>
  );
}
