import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/app/generated/prisma/client";

// v7's new client connects via a driver adapter (or Accelerate), not a datasource
// URL. prisma.config.ts's url is for the CLI/migrations only; the runtime client
// needs the pg adapter pointed at DATABASE_URL.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

// Factory so the singleton's type is the FULL client (with model delegates),
// inferred via ReturnType. Annotating the global with the bare `PrismaClient`
// type drops `.book`/`.chapter`.
const createPrismaClient = () =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// Reuse one client across Next dev hot-reloads. Without this, every reload makes
// a fresh PrismaClient and leaks DB connections until Postgres refuses new ones.
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
