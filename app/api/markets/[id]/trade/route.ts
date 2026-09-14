import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { executeBuy, executeSell, TradeError } from "@/lib/trade";
import { MICRO_SCALE } from "@/lib/lmsr";

const buySchema = z.object({
  side: z.literal("BUY"),
  outcome: z.enum(["YES", "NO"]),
  pointsToSpend: z.number().positive(),
  idempotencyKey: z.string().uuid(),
});

const sellSchema = z.object({
  side: z.literal("SELL"),
  outcome: z.enum(["YES", "NO"]),
  shares: z.number().positive(),
  idempotencyKey: z.string().uuid(),
});

const bodySchema = z.discriminatedUnion("side", [buySchema, sellSchema]);

function toMicro(units: number): bigint {
  return BigInt(Math.round(units * Number(MICRO_SCALE)));
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request body", details: parsed.error.flatten() }, { status: 400 });
  }

  const marketId = params.id;
  const userId = session.user.id;

  try {
    if (parsed.data.side === "BUY") {
      const trade = await executeBuy({
        userId,
        marketId,
        outcome: parsed.data.outcome,
        pointsToSpend: toMicro(parsed.data.pointsToSpend),
        idempotencyKey: parsed.data.idempotencyKey,
      });
      return NextResponse.json(serializeTrade(trade));
    } else {
      const trade = await executeSell({
        userId,
        marketId,
        outcome: parsed.data.outcome,
        shares: toMicro(parsed.data.shares),
        idempotencyKey: parsed.data.idempotencyKey,
      });
      return NextResponse.json(serializeTrade(trade));
    }
  } catch (e) {
    if (e instanceof TradeError) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    console.error("[trade] unexpected error", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

function serializeTrade(trade: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(trade)) {
    out[k] = typeof v === "bigint" ? v.toString() : v;
  }
  return out;
}
