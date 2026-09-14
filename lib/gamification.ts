import { prisma } from "./prisma";
import { computeStreakUpdate } from "./streak-math";

export { toUTCDateOnly, computeStreakUpdate } from "./streak-math";

export async function recordTradeActivity(userId: string, tradeTime: Date = new Date()): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentStreak: true, longestStreak: true, lastTradeDate: true },
  });
  if (!user) return;

  const update = computeStreakUpdate(user.currentStreak, user.longestStreak, user.lastTradeDate, tradeTime);
  if (!update.changed) return;

  await prisma.user.update({
    where: { id: userId },
    data: {
      currentStreak: update.newCurrentStreak,
      longestStreak: update.newLongestStreak,
      lastTradeDate: tradeTime,
    },
  });
}

export const BADGES = {
  first_trade: { name: "First Trade", description: "Placed your first trade", emoji: "🎯" },
  ten_markets: { name: "Market Explorer", description: "Traded in 10 different markets", emoji: "🗺️" },
  first_win: { name: "First Win", description: "Won your first resolved market", emoji: "🏆" },
  week_streak: { name: "Week Streak", description: "7-day trading streak", emoji: "🔥" },
  month_streak: { name: "Month Streak", description: "30-day trading streak", emoji: "⭐" },
} as const;

export type BadgeKey = keyof typeof BADGES;

export async function checkAndAwardBadges(userId: string): Promise<BadgeKey[]> {
  const [user, tradeCount, distinctMarkets, payoutCount, alreadyHeld] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { longestStreak: true } }),
    prisma.trade.count({ where: { userId } }),
    prisma.trade.findMany({ where: { userId }, select: { marketId: true }, distinct: ["marketId"] }),
    prisma.payout.count({ where: { userId } }),
    prisma.userBadge.findMany({ where: { userId }, select: { badgeKey: true } }),
  ]);
  if (!user) return [];

  const heldKeys = new Set(alreadyHeld.map((b) => b.badgeKey));
  const candidates: BadgeKey[] = [];

  if (tradeCount >= 1) candidates.push("first_trade");
  if (distinctMarkets.length >= 10) candidates.push("ten_markets");
  if (payoutCount >= 1) candidates.push("first_win");
  if (user.longestStreak >= 7) candidates.push("week_streak");
  if (user.longestStreak >= 30) candidates.push("month_streak");

  const newlyAwarded: BadgeKey[] = [];
  for (const key of candidates) {
    if (heldKeys.has(key)) continue;
    try {
      await prisma.userBadge.create({ data: { userId, badgeKey: key } });
      newlyAwarded.push(key);
    } catch {
      // race — someone else already awarded it
    }
  }

  return newlyAwarded;
}
