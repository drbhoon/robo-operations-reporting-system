import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { calculateDailyRecord, materializeCalculatedFields } from "./calculations";
import { CAPTURE_PRODUCTS } from "./types";
import type { AuditEntry, CapturePayload, DailyPlantRecord, DailyRecordStatus } from "./types";
import { validateCaptureRecord } from "./validation";
import { getPrisma } from "../reporting/prisma";

const STORE_PATH = path.join(process.cwd(), "data", "daily-records.json");
const DEFAULT_ACTOR = "operations";
const globalForCapture = globalThis as unknown as {
  captureStore?: LocalStore;
};

type LocalStore = {
  records: DailyPlantRecord[];
  audit: AuditEntry[];
};

export async function listDailyRecords(filter?: {
  plantCode?: string;
  startDate?: string;
  endDate?: string;
  status?: DailyRecordStatus;
}): Promise<DailyPlantRecord[]> {
  const prisma = getPrisma();
  let records: DailyPlantRecord[];

  if (prisma) {
    const rows = await prisma.dailyPlantRecord.findMany({
      where: {
        plantCode: filter?.plantCode,
        status: filter?.status,
        recordDate: {
          gte: filter?.startDate ? new Date(`${filter.startDate}T00:00:00.000Z`) : undefined,
          lte: filter?.endDate ? new Date(`${filter.endDate}T00:00:00.000Z`) : undefined,
        },
      },
      orderBy: [{ recordDate: "asc" }, { updatedAt: "asc" }],
    });
    records = rows.map((row) => row.payload as DailyPlantRecord);
  } else {
    const store = await readLocalStore();
    records = store.records;
  }

  return records.filter((record) => {
    if (filter?.plantCode && record.plantCode !== filter.plantCode) return false;
    if (filter?.status && record.status !== filter.status) return false;
    if (filter?.startDate && record.date < filter.startDate) return false;
    if (filter?.endDate && record.date > filter.endDate) return false;
    return true;
  });
}

export async function getDailyRecord(id: string): Promise<DailyPlantRecord | null> {
  const prisma = getPrisma();
  if (prisma) {
    const row = await prisma.dailyPlantRecord.findUnique({ where: { id } });
    return (row?.payload as DailyPlantRecord | undefined) ?? null;
  }

  const store = await readLocalStore();
  return store.records.find((record) => record.id === id) ?? null;
}

export async function saveDailyRecord(input: {
  payload: CapturePayload;
  action: "DRAFT" | "SUBMIT";
  actor?: string;
  allowFinalEdit?: boolean;
}) {
  const now = new Date().toISOString();
  const payloadWithMonthlyParameters = await applyMonthlyParameters(input.payload);
  const materializedPayload = materializeCalculatedFields(payloadWithMonthlyParameters);
  const id = materializedPayload.id || recordId(materializedPayload.plantCode, materializedPayload.date);
  const before = await getDailyRecord(id);

  if (before?.status === "FINAL" && !input.allowFinalEdit) {
    throw new Error("Final records require edit permission before changes can be saved.");
  }

  const base: DailyPlantRecord = {
    ...materializedPayload,
    id,
    status: input.action === "SUBMIT" ? "FINAL" : "DRAFT",
    reviewStatus: "OPEN",
    calculations: calculateDailyRecord(materializedPayload),
    validation: { valid: false, issues: [] },
    createdAt: before?.createdAt ?? now,
    updatedAt: now,
    submittedAt: input.action === "SUBMIT" ? now : before?.submittedAt,
  };
  const validation = validateCaptureRecord(base);
  const finalRecord: DailyPlantRecord = {
    ...base,
    status: input.action === "SUBMIT" ? "FINAL" : "DRAFT",
    reviewStatus: validation.exceptionWarnings.length ? "REVIEW_REQUIRED" : "OPEN",
    validation: {
      valid: validation.valid,
      issues: validation.issues,
    },
  };

  if (input.action === "SUBMIT" && !validation.valid) {
    return {
      record: finalRecord,
      audit: null,
      accepted: false,
      validation,
    };
  }

  const audit: AuditEntry = {
    id: crypto.randomUUID(),
    recordId: id,
    action: input.action === "SUBMIT" ? (before?.status === "FINAL" ? "FINAL_EDITED" : "FINAL_SUBMITTED") : "DRAFT_SAVED",
    actor: input.actor || DEFAULT_ACTOR,
    summary:
      input.action === "SUBMIT"
        ? `Submitted final record for ${finalRecord.plantCode} on ${finalRecord.date}.`
        : `Saved draft record for ${finalRecord.plantCode} on ${finalRecord.date}.`,
    before: before ?? undefined,
    after: finalRecord,
    createdAt: now,
  };

  await persistRecord(finalRecord, audit);

  return {
    record: finalRecord,
    audit,
    accepted: true,
    validation,
  };
}

async function applyMonthlyParameters(payload: CapturePayload): Promise<CapturePayload> {
  const monthStart = `${payload.date.slice(0, 7)}-01`;
  const monthEnd = `${payload.date.slice(0, 7)}-31`;
  const monthRecords = await listDailyRecords({
    plantCode: payload.plantCode,
    startDate: monthStart,
    endDate: monthEnd,
  });
  const sourceWithBookStock = monthRecords.find((record) => hasAnyProductValue(record.bookStock?.monthlyOpening));
  const sourceWithDieselRate = monthRecords.find((record) => (record.loader?.dieselRate ?? 0) > 0);
  const sourceWithFixedCost = monthRecords.find((record) => (record.cop?.fixedCostMonthly ?? 0) > 0);

  return {
    ...payload,
    bookStock: {
      ...payload.bookStock,
      monthlyOpening: hasAnyProductValue(payload.bookStock.monthlyOpening)
        ? payload.bookStock.monthlyOpening
        : sourceWithBookStock?.bookStock?.monthlyOpening ?? payload.bookStock.monthlyOpening,
    },
    loader: {
      ...payload.loader,
      dieselRate: payload.loader.dieselRate || sourceWithDieselRate?.loader?.dieselRate || 0,
    },
    cop: {
      ...payload.cop,
      fixedCostMonthly: payload.cop.fixedCostMonthly || sourceWithFixedCost?.cop?.fixedCostMonthly || 0,
    },
  };
}

function hasAnyProductValue(values: Partial<Record<(typeof CAPTURE_PRODUCTS)[number], number>> | undefined) {
  return CAPTURE_PRODUCTS.some((product) => (values?.[product] ?? 0) > 0);
}

async function persistRecord(record: DailyPlantRecord, audit: AuditEntry) {
  const prisma = getPrisma();
  if (prisma) {
    const plant = await prisma.plant.upsert({
      where: { code: record.plantCode },
      update: { name: record.plantName },
      create: { code: record.plantCode, name: record.plantName },
    });

    await prisma.dailyPlantRecord.upsert({
      where: {
        plantCode_recordDate: {
          plantCode: record.plantCode,
          recordDate: new Date(`${record.date}T00:00:00.000Z`),
        },
      },
      update: {
        status: record.status,
        reviewStatus: record.reviewStatus,
        validationStatus: record.validation.valid ? "VALID" : "INVALID",
        payload: record as unknown as Prisma.InputJsonValue,
        submittedAt: record.submittedAt ? new Date(record.submittedAt) : null,
        submittedBy: record.submittedBy ?? null,
      },
      create: {
        id: record.id,
        plantId: plant.id,
        plantCode: record.plantCode,
        recordDate: new Date(`${record.date}T00:00:00.000Z`),
        status: record.status,
        reviewStatus: record.reviewStatus,
        validationStatus: record.validation.valid ? "VALID" : "INVALID",
        payload: record as unknown as Prisma.InputJsonValue,
        submittedAt: record.submittedAt ? new Date(record.submittedAt) : null,
        submittedBy: record.submittedBy ?? null,
      },
    });

    await prisma.auditLog.create({
      data: {
        recordId: record.id,
        action: audit.action,
        actor: audit.actor,
        summary: audit.summary,
        before: audit.before ? (audit.before as unknown as Prisma.InputJsonValue) : undefined,
        after: audit.after as unknown as Prisma.InputJsonValue,
      },
    });
    return;
  }

  const store = await readLocalStore();
  const index = store.records.findIndex((existing) => existing.id === record.id);
  if (index >= 0) {
    store.records[index] = record;
  } else {
    store.records.push(record);
  }
  store.records.sort((a, b) => a.date.localeCompare(b.date));
  store.audit.push(audit);
  await writeLocalStore(store);
}

async function readLocalStore(): Promise<LocalStore> {
  if (globalForCapture.captureStore) return globalForCapture.captureStore;
  try {
    globalForCapture.captureStore = JSON.parse(await readFile(STORE_PATH, "utf8")) as LocalStore;
    return globalForCapture.captureStore;
  } catch {
    globalForCapture.captureStore = { records: [], audit: [] };
    return globalForCapture.captureStore;
  }
}

async function writeLocalStore(store: LocalStore) {
  globalForCapture.captureStore = store;
  try {
    await mkdir(path.dirname(STORE_PATH), { recursive: true });
    await writeFile(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`);
  } catch {
    // Local vinext worker runtimes can disallow filesystem writes; memory still supports pilot testing.
  }
}

function recordId(plantCode: string, date: string) {
  return crypto.createHash("sha1").update(`${plantCode}:${date}`).digest("hex").slice(0, 24);
}
