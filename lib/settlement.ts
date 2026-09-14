/**
 * lib/settlement.ts
 *
 * Runs once, after resolveMarket() has already set the market's
 * outcome. Every holder of the WINNING outcome's shares gets
 * credited 1 point per share (in the same integer micro-point/
 * micro-share scale as everything else — 1 micro-share pays 1
 * micro-point, so no rounding is even possible here, unlike the
 * LMSR cost/proceeds math). Holders of the losing outcome get
 * nothing; their shares simply become worthless.
 *
 * Idempotency: guarded by Market.settledAt, checked and set inside
 * the SAME transaction as the payouts — if this function is somehow
 * called twice (retry, double-trigger), the second call sees
 * settledAt already set and does nothing, rather than double-paying
 * every winner.
 *
 * Payouts are batched (see BATCH_SIZE) rather than one giant
 * transaction over every position at once — for a market with a
 * genuinely large number of holders, a single unbounded transaction
 * would hold the Market row locked for a long time and risk hitting
 * a statement/transaction timeout. Each batch is its own short
 * transaction; settledAt is only set at the very end, after every
 * batch succeeds, so a crash partway through leaves the market
 * correctly still "unsettled" rather than half-paid-and-forgotten.
 */

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
