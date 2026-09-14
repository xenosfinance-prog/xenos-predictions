import { MarketStatus, Outcome as PrismaOutcome, Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export class SettlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettlementError";
  }
}

const BATCH_SIZE = 500;

export async function settleMarket(marketId: string) {
  const market = await prisma.market.findUnique({ where: { id: marketId } });
  if (!market) {
    throw new SettlementError(`market ${marketId} not found`);
  }
  if (market.status !== MarketStatus.RESOLVED) {
    throw new SettlementError(`market is not resolved yet (status: ${market.status})`);
  }
  if (market.settledAt) {
    return { alreadySettled: true, payoutsIssued: 0 };
  }
  if (!market.resolvedOutcome) {
    throw new SettlementError("market is RESOLVED but has no resolvedOutcome set — data inconsistency");
  }

  const winningOutcome = market.resolvedOutcome;
  let totalPayouts = 0;
  let cursor: string | undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const positions = await prisma.position.findMany({
      where: { marketId, outcome: winningOutcome as PrismaOutcome, shares: { gt: 0n } },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });

    if (positions.length === 0) break;

    const updates: Prisma.PrismaPromise<unknown>[] = [
      ...positions.map((pos) =>
        prisma.user.update({
          where: { id: pos.userId },
          data: { pointsBalance: { increment: pos.shares } },
        })
      ),
      ...positions.map((pos) =>
        prisma.position.update({
          where: { id: pos.id },
          data: { shares: 0n },
        })
      ),
      ...positions.map((pos) =>
        prisma.payout.create({
          data: { userId: pos.userId, marketId, amount: pos.shares },
        })
      ),
    ];

    await prisma.$transaction(updates);

    totalPayouts += positions.length;
    cursor = positions[positions.length - 1].id;

    if (positions.length < BATCH_SIZE) break;
  }

  await prisma.market.update({
    where: { id: marketId },
    data: { settledAt: new Date() },
  });

  return { alreadySettled: false, payoutsIssued: totalPayouts };
}
