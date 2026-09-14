/**
 * lib/streak-math.ts
 *
 * Pure streak date-math, deliberately split out from lib/gamification.ts
 * (which needs prisma) so this half can be unit tested with zero
 * dependencies — a database connection has nothing to do with whether
 * two calendar dates are one day apart.
 */

/** Truncate a Date to its UTC calendar date (midnight UTC), discarding time-of-day. */
export function toUTCDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function daysBetweenUTCDates(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((toUTCDateOnly(b).getTime() - toUTCDateOnly(a).getTime()) / msPerDay);
}

export interface StreakUpdate {
  newCurrentStreak: number;
  newLongestStreak: number;
  changed: boolean;
}

/**
 * Given the user's existing streak state and the time of a new trade,
 * compute the updated streak. Rules:
 *   - No prior trade ever (lastTradeDate null) → streak starts at 1.
 *   - Same UTC calendar day as last trade → no change.
 *   - Exactly the next UTC calendar day → streak extends by 1.
 *   - Any bigger gap (missed a day or more) → streak resets to 1.
 *   - A trade dated BEFORE the last recorded date is a no-op.
 */
export function computeStreakUpdate(
  currentStreak: number,
  longestStreak: number,
  lastTradeDate: Date | null,
  tradeTime: Date
): StreakUpdate {
  if (!lastTradeDate) {
    return { newCurrentStreak: 1, newLongestStreak: Math.max(longestStreak, 1), changed: true };
  }

  const gap = daysBetweenUTCDates(lastTradeDate, tradeTime);

  if (gap === 0) {
    return { newCurrentStreak: currentStreak, newLongestStreak: longestStreak, changed: false };
  }
  if (gap < 0) {
    return { newCurrentStreak: currentStreak, newLongestStreak: longestStreak, changed: false };
  }
  if (gap === 1) {
    const next = currentStreak + 1;
    return { newCurrentStreak: next, newLongestStreak: Math.max(longestStreak, next), changed: true };
  }
  return { newCurrentStreak: 1, newLongestStreak: Math.max(longestStreak, 1), changed: true };
}
