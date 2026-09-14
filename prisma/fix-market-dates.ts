/**
 * prisma/fix-market-dates.ts
 *
 * ONE-OFF script — run once to shorten the seed markets' closesAt
 * dates. Matches markets by slug, only touches closesAt.
 *
 * Run with: npx tsx prisma/fix-market-dates.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

const NEW_DEADLINES: Record<string, number> = {
  "fed-cut-march-2027": 14,
  "ecb-hold-q2-2027": 21,
  "eurusd-above-1-10": 14,
  "gbpusd-below-1-20": 10,
  "wti-above-90": 10,
  "gold-new-ath": 14,
  "us-cpi-above-3pct": 10,
  "us-nfp-above-200k": 7,
  "opec-production-cut": 14,
  "boj-rate-hike-2027": 21,
  "us-recession-2027": 21,
  "usdjpy-above-160": 14,
  "natgas-winter-spike": 21,
  "eu-russia-sanctions-expand": 14,
  "china-gdp-above-5pct": 14,
};

async function main() {
  console.log("Shortening market deadlines...");
  let updated = 0;
  let skipped = 0;

  for (const [slug, days] of Object.entries(NEW_DEADLINES)) {
    const market = await prisma.market.findUnique({ where: { slug } });
    if (!market) {
      console.log(`  skip (not found): ${slug}`);
      skipped++;
      continue;
    }
    await prisma.market.update({
      where: { slug },
      data: { closesAt: daysFromNow(days) },
    });
    console.log(`  updated: ${slug} -> closes in ${days} days`);
    updated++;
  }

  console.log(`Done. Updated ${updated}, skipped ${skipped}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
