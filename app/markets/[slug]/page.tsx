import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { price } from "@/lib/lmsr";
import { TradeForm } from "./TradeForm";
import { PriceChart } from "./PriceChart";

export default async function MarketDetailPage({ params }: { params: { slug: string } }) {
  const market = await prisma.market.findUnique({ where: { slug: params.slug } });
  if (!market) {
    notFound();
  }

  const session = await auth();
  const position = session?.user?.id
    ? await prisma.position.findMany({
        where: { userId: session.user.id, marketId: market.id },
      })
    : [];

  const pYes = price(market.qYes, market.qNo, market.liquidityB, "YES");
  const pNo = price(market.qYes, market.qNo, market.liquidityB, "NO");

  return (
    <main style={{ maxWidth: 700, margin: "0 auto", padding: "2rem 1rem", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "1.4rem", marginBottom: "0.25rem" }}>{market.question}</h1>
      <p style={{ color: "#666", fontSize: "0.9rem", marginBottom: "1.5rem" }}>{market.description}</p>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
        <div style={{ flex: 1, border: "1px solid #ddd", borderRadius: 8, padding: "1rem", textAlign: "center" }}>
          <div style={{ fontSize: "0.75rem", color: "#888" }}>YES</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>{(pYes * 100).toFixed(1)}%</div>
        </div>
        <div style={{ flex: 1, border: "1px solid #ddd", borderRadius: 8, padding: "1rem", textAlign: "center" }}>
          <div style={{ fontSize: "0.75rem", color: "#888" }}>NO</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>{(pNo * 100).toFixed(1)}%</div>
        </div>
      </div>

      {market.status !== "OPEN" && (
        <p style={{ color: "#a00", fontSize: "0.875rem", marginBottom: "1rem" }}>
          This market is {market.status.toLowerCase()} — trading is closed.
        </p>
      )}

      <div style={{ marginBottom: "1.5rem" }}>
        <PriceChart marketId={market.id} />
      </div>

      {session?.user ? (
        market.status === "OPEN" && (
          <TradeForm
            marketId={market.id}
            currentPositions={position.map((p) => ({ outcome: p.outcome, shares: p.shares.toString() }))}
          />
        )
      ) : (
        <p>
          <a href="/login">Log in</a> to trade in this market.
        </p>
      )}

      <p style={{ fontSize: "0.75rem", color: "#999", marginTop: "2rem" }}>
        Xenos Predictions uses virtual points only. Nothing on this page is real money and points are never
        convertible to or from real currency.
      </p>
    </main>
  );
}
