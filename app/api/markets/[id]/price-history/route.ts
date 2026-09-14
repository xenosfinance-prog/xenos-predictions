import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { derivePriceHistory } from "@/lib/price-history";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const market = await prisma.market.findUnique({ where: { id: params.id } });
  if (!market) {
    return NextResponse.json({ error: "market not found" }, { status: 404 });
  }

  const trades = await prisma.trade.findMany({
    where: { marketId: params.id },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true, qYesAfter: true, qNoAfter: true },
  });

  const points = derivePriceHistory(trades, market.liquidityB);
  return NextResponse.json(points);
}
