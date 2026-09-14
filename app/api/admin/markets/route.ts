import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MICRO_SCALE } from "@/lib/lmsr";

const createSchema = z.object({
  question: z.string().min(10).max(300),
  description: z.string().min(10).max(2000),
  category: z.enum(["MACRO", "CENTRAL_BANKS", "FX", "COMMODITIES", "RATES", "GEOPOLITICS"]),
  closesAt: z.string().datetime(),
  liquidityB: z.number().positive().default(200),
});

function slugify(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }
  if (!session.user.isAdmin) {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const { question, description, category, closesAt, liquidityB } = parsed.data;

  const closesAtDate = new Date(closesAt);
  if (closesAtDate <= new Date()) {
    return NextResponse.json({ error: "closesAt must be in the future" }, { status: 400 });
  }

  const baseSlug = slugify(question);
  let slug = baseSlug;
  let suffix = 1;
  while (await prisma.market.findUnique({ where: { slug } })) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  const market = await prisma.market.create({
    data: {
      slug,
      question,
      description,
      category,
      status: "OPEN",
      liquidityB: BigInt(Math.round(liquidityB * Number(MICRO_SCALE))),
      qYes: 0n,
      qNo: 0n,
      closesAt: closesAtDate,
      creatorId: session.user.id,
    },
  });

  return NextResponse.json({ ...market, liquidityB: market.liquidityB.toString(), qYes: "0", qNo: "0" });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }

  const markets = await prisma.market.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(
    markets.map((m) => ({
      ...m,
      liquidityB: m.liquidityB.toString(),
      qYes: m.qYes.toString(),
      qNo: m.qNo.toString(),
    }))
  );
}
