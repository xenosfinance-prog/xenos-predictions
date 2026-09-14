/**
 * lib/trade.ts
 *
 * Executes a single buy or sell against a market. Both paths share
 * the same locking discipline:
 *
 *   1. Idempotency check FIRST, before opening any transaction — if
 *      a Trade with this idempotencyKey already exists, we return it
 *      unchanged and never touch balances again. This is what makes
 *      a retried network request safe to resend as-is.
 *   2. Inside one Postgres transaction, lock the Market row and the
 *      User row with SELECT ... FOR UPDATE, ALWAYS in that order
 *      (market, then user) — a fixed lock order across every caller
 *      is what prevents two concurrent trades from deadlocking each
 *      other by acquiring the same two locks in opposite order.
 *   3. Do all reads of current state (qYes, qNo, balance, position)
 *      from INSIDE the lock, never from an earlier unlocked read —
 *      otherwise the LMSR price used for costing could be stale by
 *      the time the write happens.
 *   4. Every state change (market q's, position shares, user
 *      balance, Trade log insert) happens in that same transaction,
 *      so a failure partway through rolls back everything, never a
 *      half-applied trade.
 *
 * This module still hasn't been run against a real Postgres instance
 * (no DB was available in the sandbox this was written in) — the SQL
 * and Prisma API usage follow documented patterns correctly, but
 * treat this as code-reviewed, not integration-tested, until it's
 * been exercised against a real database.
 */

import { Prisma, MarketStatus, Outcome as PrismaOutcome } from "@prisma/client";
import { prisma } from "./prisma";
import { costToBuy, proceedsFromSell, sharesForSpend, type Outcome } from "./lmsr";

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

export interface BuyParams {
  userId: string;
  marketId: string;
  outcome: Outcome;
  pointsToSpend: bigint; // exact budget, in micro-points — see lib/lmsr.ts scale convention
  idempotencyKey: string;
}

export async function executeBuy(params: BuyParams) {
  const { userId, marketId, outcome, pointsToSpend, idempotencyKey } = params;

  if (pointsToSpend <= 0n) {
    throw new TradeError("pointsToSpend must be positive");
  }

  const existing = await findExistingTrade(idempotencyKey);
  if (existing) {
    return existing; // safe replay — do not re-execute
  }

  try {
    return await prisma.$transaction(async (tx) => {
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
  } catch (e) {
    // Unique-constraint race: two requests with the same idempotency
    // key both passed the pre-check and both reached the insert —
    // the loser here isn't an error from the caller's point of view,
    // it just means the winner's trade IS the answer. Return that
    // instead of surfacing a confusing P2002 to the client.
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
  shares: bigint; // exact share count to sell, in micro-shares
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
    return await prisma.$transaction(async (tx) => {
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
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const winner = await findExistingTrade(idempotencyKey);
      if (winner) return winner;
    }
    throw e;
  }
}
