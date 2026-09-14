import { PrismaClient } from "@prisma/client";

// Standard Next.js pattern: in dev, hot-reload re-executes this module
// on every save, which would create a new PrismaClient (and a new DB
// connection pool) each time without this global-singleton guard.
// In production there's only ever one module load, so the guard is a
// no-op there.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
