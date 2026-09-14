import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { price } from "@/lib/lmsr";
import { BADGES, type BadgeKey } from "@/lib/gamification";

export default async function PortfolioPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const positions = await prisma.position.findMany({
    where: { userId: session.user.id, shares: { gt: 0n } },
    include: { market: true },
    orderBy: { updatedAt: "desc" },
  });

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  const earnedBadges = await prisma.userBadge.findMany({
    where: { userId: session.user.id },
    orderBy: { earnedAt: "asc" },
  });

  let estimatedTotal = 0;

  return (
    <main style={{ maxWidth: 700, margin: "0 auto", padding: "2rem 1rem", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "1.4rem", marginBottom: "0.25rem" }}>Your portfolio</h1>
      <p style={{ color: "#666", fontSize: "0.9rem", marginBottom: "1rem" }}>
        Balance: <strong>{(Number(user?.pointsBalance ?? 0n) / 1_000_000).toLocaleString()} pts</strong>
      </p>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: "0.75rem 1rem", flex: 1 }}>
          <div style={{ fontSize: "0.7rem", color: "#888" }}>CURRENT STREAK</div>
          <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>
            {user?.currentStreak ?? 0} {(user?.currentStreak ?? 0) === 1 ? "day" : "days"}
            {(user?.currentStreak ?? 0) > 0 ? " 🔥" : ""}
          </div>
        </div>
        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: "0.75rem 1rem", flex: 1 }}>
          <div style={{ fontSize: "0.7rem", color: "#888" }}>LONGEST STREAK</div>
          <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{user?.longestStreak ?? 0} days</div>
        </div>
      </div>

      {earnedBadges.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontSize: "0.7rem", color: "#888", marginBottom: "0.4rem" }}>BADGES</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {earnedBadges.map((b) => {
              const info = BADGES[b.badgeKey as BadgeKey];
              if (!info) return null;
              return (
                <div
                  key={b.id}
                  title={info.description}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 20,
                    padding: "0.3rem 0.7rem",
                    fontSize: "0.8rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    background: "#fafafa",
                  }}
                >
                  <span>{info.emoji}</span>
                  <span>{info.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {positions.length === 0 && <p style={{ color: "#888" }}>No open positions yet.</p>}

      <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {positions.map((pos) => {
          const currentPrice = price(pos.market.qYes, pos.market.qNo, pos.market.liquidityB, pos.outcome);
          const sharesFloat = Number(pos.shares) / 1_000_000;
          const estimatedValue = sharesFloat * currentPrice;
          estimatedTotal += estimatedValue;

          return (
            <li key={pos.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: "0.75rem 1rem" }}>
              <Link href={`/markets/${pos.market.slug}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontWeight: 600 }}>{pos.market.question}</span>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      padding: "0.1rem 0.4rem",
                      borderRadius: 4,
                      background: pos.outcome === "YES" ? "#f0fdf4" : "#fef2f2",
                      color: pos.outcome === "YES" ? "#16a34a" : "#dc2626",
                    }}
                  >
                    {pos.outcome}
                  </span>
                </div>
                <div style={{ fontSize: "0.8rem", color: "#666", marginTop: "0.25rem" }}>
                  {sharesFloat.toFixed(2)} shares &middot; ~{estimatedValue.toFixed(1)} pts at current price (
                  {(currentPrice * 100).toFixed(0)}%)
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {positions.length > 0 && (
        <p style={{ fontSize: "0.8rem", color: "#888", marginTop: "1rem" }}>
          Estimated open positions value: ~{estimatedTotal.toFixed(1)} pts. This is shares × current price, an
          approximation — actually selling a large position would move the price via the LMSR curve, so real
          proceeds from selling everything right now would be slightly less than this estimate.
        </p>
      )}
    </main>
  );
}
