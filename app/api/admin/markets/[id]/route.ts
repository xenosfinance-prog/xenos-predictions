import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const editSchema = z.object({
  question: z.string().min(10).max(300).optional(),
  description: z.string().min(10).max(2000).optional(),
  closesAt: z.string().datetime().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }
  if (!session.user.isAdmin) {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = editSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const data: { question?: string; description?: string; closesAt?: Date } = {};
  if (parsed.data.question !== undefined) data.question = parsed.data.question;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.closesAt !== undefined) data.closesAt = new Date(parsed.data.closesAt);

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const market = await prisma.market.findUnique({ where: { id: params.id } });
  if (!market) {
    return NextResponse.json({ error: "market not found" }, { status: 404 });
  }

  const updated = await prisma.market.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json({
    ...updated,
    liquidityB: updated.liquidityB.toString(),
    qYes: updated.qYes.toString(),
    qNo: updated.qNo.toString(),
  });
}
