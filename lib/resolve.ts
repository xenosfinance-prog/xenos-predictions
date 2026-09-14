/**
 * lib/resolve.ts
 *
 * Resolving a market is the one action in this whole system that
 * genuinely needs an anti-manipulation rule: whoever decides "YES
 * won" could otherwise just hold a big YES position and resolve
 * their own market YES. The rule is simple and absolute — the
 * resolving admin must hold EXACTLY ZERO shares (both YES and NO)
 * in the market they're resolving. No exceptions, no "unless it's
 * obviously correct" carve-out — that judgment call is exactly what
 * this rule removes from the admin's hands.
 *
 * Same locking discipline as lib/trade.ts: lock the Market row
 * first, do every read/write inside that one transaction.
 */

import { Prisma, MarketStatus, Outcome as PrismaOutcome } from "@prisma/client";
import { prisma } from "./prisma";
import type { Outcome } from "./lmsr";

export class ResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResolutionError";
  }
}

export interface ResolveParams {
  marketId: string;
  outcome: Outcome;
  resolvedById: string;
  note?: string;
}

export async function resolveMarket(params: ResolveParams) {
  const { marketId, outcome, resolvedById, note } = params;

  return prisma.$transaction(async (tx) => {
    const marketRows = await tx.$queryRaw<{ id: string; status: MarketStatus }[]>`
      SELECT id, status FROM "Market" WHERE id = ${marketId} FOR UPDATE
    `;
    if (marketRows.length === 0) {
      throw new ResolutionError(`market ${marketId} not found`);
    }
    const market = marketRows[0];

    if (market.status === MarketStatus.RESOLVED) {
      throw new ResolutionError("market is already resolved");
    }
    if (market.status === MarketStatus.VOID) {
      throw new ResolutionError("market was voided, cannot resolve");
    }

    // THE anti-manipulation check. Read the resolver's own position
    // rows from inside the same locked transaction so there's no
    // window for them to trade in and out between the check and the
    // write.
    const resolverYes = await tx.position.findUnique({
      where: { userId_marketId_outcome: { userId: resolvedById, marketId, outcome: PrismaOutcome.YES } },
    });
    const resolverNo = await tx.position.findUnique({
      where: { userId_marketId_outcome: { userId: resolvedById, marketId, outcome: PrismaOutcome.NO } },
    });
    const resolverYesShares = resolverYes?.shares ?? 0n;
    const resolverNoShares = resolverNo?.shares ?? 0n;

    if (resolverYesShares !== 0n || resolverNoShares !== 0n) {
      throw new ResolutionError(
        "resolver holds a position in this market (YES: " +
          resolverYesShares.toString() +
          ", NO: " +
          resolverNoShares.toString() +
          ") — must be fully exited before resolving"
      );
    }

    await tx.market.update({
      where: { id: marketId },
      data: {
        status: MarketStatus.RESOLVED,
        resolvedOutcome: outcome as PrismaOutcome,
        resolvedAt: new Date(),
      },
    });

    const resolution = await tx.resolution.create({
      data: {
        marketId,
        outcome: outcome as PrismaOutcome,
        resolvedById,
        resolverYesShares,
        resolverNoShares,
        note,
      },
    });

    // NOTE: this does not yet pay out winning positions — settlement
    // (crediting 1 point per winning share, in the same integer
    // micro-point scale as everything else) is the next piece to
    // build, deliberately kept out of this transaction so a large
    // payout fan-out doesn't hold the Market row locked any longer
    // than the resolution decision itself needs.
    return resolution;
  });
}
