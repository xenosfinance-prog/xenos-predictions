import { prisma } from "@/lib/prisma";

export default async function LeaderboardPage() {
  const users = await prisma.user.findMany({
    orderBy: { pointsBalance: "desc" },
    take: 100,
    select: { id: true, displayName: true, pointsBalance: true },
  });

  return (
    <main style={{ maxWidth: 500, margin: "0 auto", padding: "2rem 1rem", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "1.4rem", marginBottom: "1.5rem" }}>Leaderboard</h1>

      <ol style={{ padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {users.map((u, i) => (
          <li
            key={u.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "0.6rem 0.75rem",
              borderRadius: 6,
              background: i < 3 ? "#fffbeb" : "#fafafa",
            }}
          >
            <span>
              <strong style={{ display: "inline-block", width: "2rem", color: "#888" }}>#{i + 1}</strong>
              {u.displayName}
            </span>
            <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
              {(Number(u.pointsBalance) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 0 })} pts
            </span>
          </li>
        ))}
      </ol>

      <p style={{ fontSize: "0.75rem", color: "#999", marginTop: "1.5rem" }}>
        Ranked by current points balance, including unsettled open positions' original stake (not mark-to-market
        value — an open position's current worth isn't reflected here until the market resolves). Points are
        virtual and never convertible to real money.
      </p>
    </main>
  );
}
