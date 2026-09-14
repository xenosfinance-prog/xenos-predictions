import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { price } from "@/lib/lmsr";

// This page intentionally stays a server component with no client
// JS — it's a read-only list, no interactivity needed here. The
// trade form (on the market detail page) is where client-side state
// actually lives.
export default async function MarketsListPage() {
  const markets = await prisma.market.findMany({
    where: { status: "OPEN" },
    orderBy: { closesAt: "asc" },
  });

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "2rem 1rem", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>Xenos Predictions</h1>
      <p style={{ color: "#666", marginBottom: "1.5rem", fontSize: "0.875rem" }}>
        Virtual points only — nothing here is ever convertible to money.
      </p>

      {markets.length === 0 && <p>No open markets right now.</p>}

      <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {markets.map((m) => {
          const pYes = price(m.qYes, m.qNo, m.liquidityB, "YES");
          return (
            <li key={m.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem" }}>
              <Link href={`/markets/${m.slug}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem" }}>
                  <span style={{ fontWeight: 600 }}>{m.question}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                    {(pYes * 100).toFixed(0)}% YES
                  </span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "#888", marginTop: "0.25rem" }}>
                  {m.category} &middot; closes {m.closesAt.toLocaleDateString()}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
