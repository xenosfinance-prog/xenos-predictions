/**
 * prisma/seed.ts
 *
 * Phase 1 spec called for 15 seed markets. These are realistic
 * shapes and categories, but the specific questions/dates are
 * placeholders — review and edit before this ever runs against a
 * real deployment. Run with: npx prisma db seed
 */

import { PrismaClient, MarketCategory, MarketStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const MICRO_SCALE = 1_000_000n;
const DEFAULT_LIQUIDITY_B = 200n * MICRO_SCALE; // moderate liquidity — adjust per market later if needed

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

const seedMarkets: Array<{
  slug: string;
  question: string;
  description: string;
  category: MarketCategory;
  closesInDays: number;
}> = [
  {
    slug: "fed-cut-march-2027",
    question: "Will the Fed cut rates at its March 2027 meeting?",
    description: "Resolves YES if the FOMC announces a rate cut of any size at the scheduled March 2027 meeting.",
    category: "CENTRAL_BANKS",
    closesInDays: 60,
  },
  {
    slug: "ecb-hold-q2-2027",
    question: "Will the ECB hold rates steady through Q2 2027?",
    description: "Resolves YES if the ECB makes no rate change across all scheduled meetings in Q2 2027.",
    category: "CENTRAL_BANKS",
    closesInDays: 90,
  },
  {
    slug: "eurusd-above-1-10",
    question: "Will EUR/USD close above 1.10 by end of this quarter?",
    description: "Resolves YES if the EUR/USD daily close on the last trading day of the quarter is above 1.10.",
    category: "FX",
    closesInDays: 75,
  },
  {
    slug: "gbpusd-below-1-20",
    question: "Will GBP/USD trade below 1.20 at any point this month?",
    description: "Resolves YES if GBP/USD touches 1.20 or lower intraday at any point before market close on the last trading day of the month.",
    category: "FX",
    closesInDays: 25,
  },
  {
    slug: "wti-above-90",
    question: "Will WTI crude close above $90/barrel this month?",
    description: "Resolves YES if the WTI front-month contract closes above $90 on any trading day this month.",
    category: "COMMODITIES",
    closesInDays: 25,
  },
  {
    slug: "gold-new-ath",
    question: "Will gold set a new all-time high this quarter?",
    description: "Resolves YES if spot gold trades above its prior all-time high at any point during the quarter.",
    category: "COMMODITIES",
    closesInDays: 75,
  },
  {
    slug: "us-cpi-above-3pct",
    question: "Will US headline CPI YoY print above 3.0% next release?",
    description: "Resolves based on the next scheduled US CPI release from the BLS.",
    category: "MACRO",
    closesInDays: 20,
  },
  {
    slug: "us-nfp-above-200k",
    question: "Will the next US Non-Farm Payrolls print exceed 200,000?",
    description: "Resolves based on the headline NFP figure from the next scheduled BLS jobs report.",
    category: "MACRO",
    closesInDays: 15,
  },
  {
    slug: "opec-production-cut",
    question: "Will OPEC+ announce a production cut at its next meeting?",
    description: "Resolves YES if OPEC+ announces any net production cut at its next scheduled meeting.",
    category: "GEOPOLITICS",
    closesInDays: 40,
  },
  {
    slug: "boj-rate-hike-2027",
    question: "Will the Bank of Japan hike rates before mid-2027?",
    description: "Resolves YES if the BoJ raises its policy rate at any meeting before June 30, 2027.",
    category: "CENTRAL_BANKS",
    closesInDays: 180,
  },
  {
    slug: "us-recession-2027",
    question: "Will the NBER declare a US recession started in 2027?",
    description: "Resolves based on an official NBER recession dating announcement covering any part of 2027. Long-dated — resolution may lag the actual event by months, as NBER dating always does.",
    category: "MACRO",
    closesInDays: 300,
  },
  {
    slug: "usdjpy-above-160",
    question: "Will USD/JPY trade above 160 this quarter?",
    description: "Resolves YES if USD/JPY touches 160 or higher intraday at any point during the quarter.",
    category: "FX",
    closesInDays: 75,
  },
  {
    slug: "natgas-winter-spike",
    question: "Will Henry Hub natural gas exceed $5/MMBtu this winter?",
    description: "Resolves YES if the Henry Hub spot price closes above $5 on any day in the Dec-Feb window.",
    category: "COMMODITIES",
    closesInDays: 100,
  },
  {
    slug: "eu-russia-sanctions-expand",
    question: "Will the EU expand sanctions on Russia this quarter?",
    description: "Resolves YES if the EU Council formally adopts a new sanctions package targeting Russia during the quarter.",
    category: "GEOPOLITICS",
    closesInDays: 75,
  },
  {
    slug: "china-gdp-above-5pct",
    question: "Will China's next quarterly GDP growth print above 5.0% YoY?",
    description: "Resolves based on the next official NBS quarterly GDP release.",
    category: "MACRO",
    closesInDays: 45,
  },
];

async function main() {
  console.log("Seeding Xenos Predictions...");

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@xenosfinance.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error(
      "SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD not set — refusing to seed with a hardcoded default admin password. Set SEED_ADMIN_PASSWORD before running the seed."
    );
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      displayName: "Xenos Admin",
      isAdmin: true,
    },
  });

  for (const m of seedMarkets) {
    await prisma.market.upsert({
      where: { slug: m.slug },
      update: {},
      create: {
        slug: m.slug,
        question: m.question,
        description: m.description,
        category: m.category,
        status: MarketStatus.OPEN,
        liquidityB: DEFAULT_LIQUIDITY_B,
        qYes: 0n,
        qNo: 0n,
        closesAt: daysFromNow(m.closesInDays),
        creatorId: admin.id,
      },
    });
  }

  console.log(`Seeded ${seedMarkets.length} markets and admin user (${adminEmail}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
