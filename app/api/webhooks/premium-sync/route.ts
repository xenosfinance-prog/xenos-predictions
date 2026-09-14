import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  email: z.string().email(),
  xenosPremium: z.boolean(),
});

function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const expected = process.env.PREMIUM_SYNC_SECRET;
  if (!expected) {
    console.error("[premium-sync] PREMIUM_SYNC_SECRET is not set");
    return NextResponse.json({ error: "server not configured" }, { status: 500 });
  }

  const provided = req.headers.get("x-webhook-secret");
  if (!secretMatches(provided, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const { email, xenosPremium } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ status: "no matching account, ignored" });
  }

  await prisma.user.update({
    where: { email },
    data: { xenosPremium, premiumSyncedAt: new Date() },
  });

  return NextResponse.json({ status: "synced" });
}
