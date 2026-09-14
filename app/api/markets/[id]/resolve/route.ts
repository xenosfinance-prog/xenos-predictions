import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { resolveMarket, ResolutionError } from "@/lib/resolve";
import { settleMarket, SettlementError } from "@/lib/settlement";

const bodySchema = z.object({
  outcome: z.enum(["YES", "NO"]),
  note: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }
  if (!session.user.isAdmin) {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const resolution = await resolveMarket({
      marketId: params.id,
      outcome: parsed.data.outcome,
      resolvedById: session.user.id,
      note: parsed.data.note,
    });

    const settlement = await settleMarket(params.id);

    return NextResponse.json({
      resolution: {
        ...resolution,
        resolverYesShares: resolution.resolverYesShares.toString(),
        resolverNoShares: resolution.resolverNoShares.toString(),
      },
      settlement,
    });
  } catch (e) {
    if (e instanceof ResolutionError || e instanceof SettlementError) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    console.error("[resolve] unexpected error", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
