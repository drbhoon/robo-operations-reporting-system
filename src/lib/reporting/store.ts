import type { ReportSnapshot } from "./types";
import { getPrisma } from "./prisma";

const globalForSnapshots = globalThis as unknown as {
  reportSnapshots?: ReportSnapshot[];
};

export async function getLatestSnapshot(): Promise<ReportSnapshot | null> {
  const prisma = getPrisma();
  if (!prisma) {
    return getLocalSnapshots().at(-1) ?? null;
  }

  const row = await prisma.reportSnapshot.findFirst({
    orderBy: { createdAt: "desc" },
  });

  return (row?.payload as ReportSnapshot | undefined) ?? null;
}

export async function getSnapshot(id: string): Promise<ReportSnapshot | null> {
  const prisma = getPrisma();
  if (!prisma) {
    return getLocalSnapshots().find((snapshot) => snapshot.id === id) ?? null;
  }

  const row = await prisma.reportSnapshot.findUnique({
    where: { id },
  });

  return (row?.payload as ReportSnapshot | undefined) ?? null;
}

export async function saveSnapshot(snapshot: ReportSnapshot) {
  const prisma = getPrisma();
  if (!prisma) {
    const snapshots = getLocalSnapshots().filter((existing) => existing.id !== snapshot.id);
    snapshots.push(snapshot);
    globalForSnapshots.reportSnapshots = snapshots.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return snapshot;
  }

  const plant = await prisma.plant.upsert({
    where: { code: snapshot.plantCode },
    update: { name: snapshot.plantName },
    create: { code: snapshot.plantCode, name: snapshot.plantName },
  });

  await prisma.reportSnapshot.upsert({
    where: { id: snapshot.id },
    update: {
      payload: snapshot,
      validationStatus: snapshot.validation.valid ? "VALID" : "INVALID",
      lockedAt: new Date(snapshot.createdAt),
    },
    create: {
      id: snapshot.id,
      plantId: plant.id,
      version: snapshot.version,
      periodStart: new Date(`${snapshot.period.start}T00:00:00.000Z`),
      periodEnd: new Date(`${snapshot.period.end}T00:00:00.000Z`),
      sourceFileName: snapshot.source.fileName,
      sourceChecksum: snapshot.source.checksum,
      validationStatus: snapshot.validation.valid ? "VALID" : "INVALID",
      payload: snapshot,
      lockedAt: new Date(snapshot.createdAt),
    },
  });

  await prisma.validationIssue.deleteMany({
    where: { snapshotId: snapshot.id },
  });

  if (snapshot.validation.issues.length) {
    await prisma.validationIssue.createMany({
      data: snapshot.validation.issues.map((issue) => ({
        snapshotId: snapshot.id,
        severity: issue.severity,
        code: issue.code,
        message: issue.message,
        date: issue.date ? new Date(`${issue.date}T00:00:00.000Z`) : null,
        field: issue.field ?? null,
      })),
    });
  }

  return snapshot;
}

function getLocalSnapshots() {
  globalForSnapshots.reportSnapshots ??= [];
  return globalForSnapshots.reportSnapshots;
}
