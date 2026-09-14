import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EditMarketForm } from "./EditMarketForm";

export default async function EditMarketPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (!session.user.isAdmin) {
    redirect("/");
  }

  const market = await prisma.market.findUnique({ where: { id: params.id } });
  if (!market) {
    notFound();
  }

  const closesAtLocal = market.closesAt.toISOString().slice(0, 16);

  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: "2rem 1rem", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "1.3rem", marginBottom: "1.5rem" }}>Edit market</h1>
      <EditMarketForm
        marketId={market.id}
        initialQuestion={market.question}
        initialDescription={market.description}
        initialClosesAt={closesAtLocal}
      />
      <p style={{ fontSize: "0.75rem", color: "#999", marginTop: "1.5rem" }}>
        Category and liquidity can&apos;t be changed here — liquidity is fixed at creation because changing it
        after trades exist would silently alter the pricing math for anyone who already holds a position.
      </p>
    </main>
  );
}
