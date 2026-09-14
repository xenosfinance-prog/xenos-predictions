import { Prisma, MarketStatus, Outcome as PrismaOutcome } from "@prisma/client";
import { prisma } from "./prisma";
import { costToBuy, proceedsFromSell, sharesForSpend, type Outcome } from "./lmsr";
import { recordTradeActivity, checkAndAwardBadges } from "./gamification";

export class TradeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TradeError";
  }
}

type MarketRow = {
  id: string;
  status: MarketStatus;
  liquidityB: bigint;
  qYes: bigint;
  qNo: bigint;
  closesAt: Date;
};

type UserRow = {
  id: string;
  pointsBalance: bigint;
};

async function lockMarketRow(tx: Prisma.TransactionClient, marketId: string): Promise<MarketRow> {
  const rows = await tx.$queryRaw<MarketRow[]>`
    SELECT id, status, "liquidityB", "qYes", "qNo", "closesAt"
    FROM "Market"
    WHERE id = ${marketId}
    FOR UPDATE
  `;
  if (rows.length === 0) {
    throw new TradeError(`market ${marketId} not found`);
  }
  return rows[0];
}

async function lockUserRow(tx: Prisma.TransactionClient, userId: string): Promise<UserRow> {
  const rows = await tx.$queryRaw<UserRow[]>`
    SELECT id, "pointsBalance"
    FROM "User"
    WHERE id = ${userId}
    FOR UPDATE
  `;
  if (rows.length === 0) {
    throw new TradeError(`user ${userId} not found`);
  }
  return rows[0];
}

function assertMarketTradeable(market: MarketRow) {
  if (market.status !== MarketStatus.OPEN) {
    throw new TradeError(`market is not open (status: ${market.status})`);
  }
  if (new Date() >= market.closesAt) {
    throw new TradeError("market's trading window has closed");
  }
}

async function findExistingTrade(idempotencyKey: string) {
  return prisma.trade.findUnique({ where: { idempotencyKey } });
}

async function applyGamification(userId: string): Promise<void> {
  try {
    await recordTradeActivity(userId);
    await checkAndAwardBadges(userId);
  } catch (e) {
    console.error("[gamification] failed to update streak/badges", e);
  }
}

export interface BuyParams {
  userId: string;
  marketId: string;
  outcome: Outcome;
  pointsToSpend: bigint;
  idempotencyKey: string;
}

export async function executeBuy(params: BuyParams) {
  const { userId, marketId, outcome, pointsToSpend, idempotencyKey } = params;

  if (pointsToSpend <= 0n) {
    throw new TradeError("pointsToSpend must be positive");
  }

  const existing = await findExistingTrade(idempotencyKey);
  if (existing) {
    return existing;
  }

  try {
    const trade = await prisma.$transaction(async (tx) => {
      const market = await lockMarketRow(tx, marketId);
      const user = await lockUserRow(tx, userId);

      assertMarketTradeable(market);

      const shares = sharesForSpend(market.qYes, market.qNo, market.liquidityB, outcome, pointsToSpend);
      if (shares <= 0n) {
        throw new TradeError("budget too small to buy any shares at the current price");
      }

      const realCost = costToBuy(market.qYes, market.qNo, market.liquidityB, outcome, shares);
      if (realCost > user.pointsBalance) {
        throw new TradeError("insufficient points balance");
      }

      const qYesAfter = outcome === "YES" ? market.qYes + shares : market.qYes;
      const qNoAfter = outcome === "NO" ? market.qNo + shares : market.qNo;

      await tx.market.update({
        where: { id: marketId },
        data: { qYes: qYesAfter, qNo: qNoAfter },
      });

      await tx.user.update({
        where: { id: userId },
        data: { pointsBalance: user.pointsBalance - realCost },
      });

      await tx.position.upsert({
        where: { userId_marketId_outcome: { userId, marketId, outcome: outcome as PrismaOutcome } },
        create: { userId, marketId, outcome: outcome as PrismaOutcome, shares },
        update: { shares: { increment: shares } },
      });

      const trade = await tx.trade.create({
        data: {
          userId,
          marketId,
          outcome: outcome as PrismaOutcome,
          side: "BUY",
          sharesDelta: shares,
          pointsDelta: realCost,
          qYesBefore: market.qYes,
          qNoBefore: market.qNo,
          qYesAfter,
          qNoAfter,
          idempotencyKey,
        },
      });

      return trade;
    });

    await applyGamification(userId);
    return trade;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const winner = await findExistingTrade(idempotencyKey);
      if (winner) return winner;
    }
    throw e;
  }
}

export interface SellParams {
  userId: string;
  marketId: string;
  outcome: Outcome;
  shares: bigint;
  idempotencyKey: string;
}

export async function executeSell(params: SellParams) {
  const { userId, marketId, outcome, shares, idempotencyKey } = params;

  if (shares <= 0n) {
    throw new TradeError("shares must be positive");
  }

  const existing = await findExistingTrade(idempotencyKey);
  if (existing) {
    return existing;
  }

  try {
    const trade = await prisma.$transaction(async (tx) => {
      const market = await lockMarketRow(tx, marketId);
      const user = await lockUserRow(tx, userId);

      assertMarketTradeable(market);

      const position = await tx.position.findUnique({
        where: { userId_marketId_outcome: { userId, marketId, outcome: outcome as PrismaOutcome } },
      });
      if (!position || position.shares < shares) {
        throw new TradeError("insufficient shares to sell");
      }

      const proceeds = proceedsFromSell(market.qYes, market.qNo, market.liquidityB, outcome, shares);

      const qYesAfter = outcome === "YES" ? market.qYes - shares : market.qYes;
      const qNoAfter = outcome === "NO" ? market.qNo - shares : market.qNo;

      await tx.market.update({
        where: { id: marketId },
        data: { qYes: qYesAfter, qNo: qNoAfter },
      });

      await tx.user.update({
        where: { id: userId },
        data: { pointsBalance: user.pointsBalance + proceeds },
      });

      await tx.position.update({
        where: { userId_marketId_outcome: { userId, marketId, outcome: outcome as PrismaOutcome } },
        data: { shares: { decrement: shares } },
      });

      const trade = await tx.trade.create({
        data: {
          userId,
          marketId,
          outcome: outcome as PrismaOutcome,
          side: "SELL",
          sharesDelta: -shares,
          pointsDelta: -proceeds,
          qYesBefore: market.qYes,
          qNoBefore: market.qNo,
          qYesAfter,
          qNoAfter,
          idempotencyKey,
        },
      });

      return trade;
    });

    await applyGamification(userId);
    return trade;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const winner = await findExistingTrade(idempotencyKey);
      if (winner) return winner;
    }
    throw e;
  }
}
