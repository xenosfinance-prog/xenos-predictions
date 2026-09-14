import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { price } from "@/lib/lmsr";
import { ResolveButton } from "./ResolveButton";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (!session.user.isAdmin) {
    redirect("/");
  }

  const markets = await prisma.market.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1rem", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.4rem" }}>Admin — Markets</h1>
        <Link
          href="/admin/markets/new"
          style={{ padding: "0.5rem 1rem", borderRadius: 6, background: "#111", color: "white", textDecoration: "none", fontSize: "0.875rem" }}
        >
          + New market
        </Link>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
            <th style={{ padding: "0.5rem" }}>Question</th>
            <th style={{ padding: "0.5rem" }}>Status</th>
            <th style={{ padding: "0.5rem" }}>YES price</th>
            <th style={{ padding: "0.5rem" }}>Closes</th>
            <th style={{ padding: "0.5rem" }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {markets.map((m) => {
            const pYes = price(m.qYes, m.qNo, m.liquidityB, "YES");
            return (
              <tr key={m.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "0.5rem" }}>
                  <Link href={`/markets/${m.slug}`}>{m.question}</Link>
                </td>
                <td style={{ padding: "0.5rem" }}>{m.status}</td>
                <td style={{ padding: "0.5rem" }}>{(pYes * 100).toFixed(0)}%</td>
                <td style={{ padding: "0.5rem" }}>{m.closesAt.toLocaleDateString()}</td>
                <td style={{ padding: "0.5rem" }}>
                  {(m.status === "OPEN" || m.status === "CLOSED") && (
                    <ResolveButton marketId={m.id} question={m.question} />
                  )}
                  {m.status === "RESOLVED" && <span style={{ color: "#888" }}>Resolved: {m.resolvedOutcome}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
