import { createRequire } from "node:module";
import type { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const runtimeRequire = createRequire(import.meta.url);

function loadPrismaClient() {
  const packageName = ["@prisma", "client"].join("/");
  return runtimeRequire(packageName) as typeof import("@prisma/client");
}

export function getPrisma() {
  if (!process.env.DATABASE_URL) return null;
  const { PrismaClient } = loadPrismaClient();
  globalForPrisma.prisma ??= new PrismaClient();
  return globalForPrisma.prisma;
}
