import crypto from "node:crypto";
import type { DailyPlantRecord } from "./types";
import { CAPTURE_PRODUCTS } from "./types";
import type { DailySnapshot, ReportSnapshot } from "../reporting/types";
import { buildTotals, round } from "../reporting/calculations";
import { generateManagementCommentary } from "../reporting/commentary";
import { validateDailySnapshots } from "../reporting/validation";

export async function buildSnapshotFromDailyRecords(input: {
  records: DailyPlantRecord[];
  plantCode: string;
  reportType: "DAILY" | "WEEKLY" | "MONTHLY";
  requiredPhotoCategories?: string[];
}): Promise<ReportSnapshot> {
  const finalRecords = input.records
    .filter((record) => record.status === "FINAL" && record.validation.valid)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!finalRecords.length) {
    throw new Error("No validated final daily records are available for the selected period.");
  }

  const daily = finalRecords.map(recordToDailySnapshot);
  const period = {
    start: daily[0].date,
    end: daily[daily.length - 1].date,
  };
  const checksum = snapshotChecksum(finalRecords);
  const now = new Date().toISOString();
  const totals = buildTotals(daily);
  const validation = validateDailySnapshots(daily);
  const base = {
    id: crypto
      .createHash("sha1")
      .update(`${input.plantCode}:${input.reportType}:${period.start}:${period.end}:${checksum}`)
      .digest("hex")
      .slice(0, 24),
    plantCode: input.plantCode,
    plantName: finalRecords[0].plantName,
    version: `${input.plantCode}-${input.reportType}-${period.start}-${period.end}-${checksum.slice(0, 8)}`,
    status: "LOCKED" as const,
    period,
    source: {
      fileName: `daily-capture-${input.reportType.toLowerCase()}`,
      checksum,
      importedAt: now,
    },
    daily,
    totals,
    validation,
    createdAt: now,
  };

  return {
    ...base,
    commentary: await generateManagementCommentary(base),
  };
}

function recordToDailySnapshot(record: DailyPlantRecord): DailySnapshot {
  const dispatchTotal = record.calculations.dispatchTotal;

  return {
    date: record.date,
    label: record.date.slice(8, 10),
    targetMt: record.targetMt,
    production: {
      mt: record.productionMt,
      rawMaterialMt: record.productionMt,
      products: CAPTURE_PRODUCTS.map((name) => ({ name, mt: round(record.productMix[name]) })),
    },
    dispatch: {
      totalMt: dispatchTotal,
      products: CAPTURE_PRODUCTS.map((name) => ({ name, mt: round(record.dispatch[name]) })),
    },
    stock: {
      opening: CAPTURE_PRODUCTS.map((name) => ({ name, mt: round(record.openingStock[name]) })),
      closing: CAPTURE_PRODUCTS.map((name) => ({ name, mt: round(record.closingStock[name]) })),
    },
    machine: {
      jawHours: round(record.machineHours.jaw, 2),
      coneHours: round(record.machineHours.cone, 2),
      vsiHours: round(record.machineHours.vsi, 2),
      jawTph: round(record.tph.jaw, 2),
      coneTph: round(record.tph.cone, 2),
      vsiTph: round(record.tph.vsi, 2),
    },
    plantHours: {
      scheduledHours: round(record.plantHours.available, 2),
      nonProductiveHours: round(record.plantHours.scheduledStoppage, 2),
      productionHours: round(record.plantHours.production, 2),
      lossHours: round(record.plantHours.loss, 2),
      idleHours: round(record.lossHours.idle, 2),
      breakdownHours: round(record.lossHours.breakdown, 2),
      lossBreakdown: record.lossHours,
    },
    electrical: {
      kwh: round(record.electrical.unitsConsumed),
      kvah: 0,
      powerFactor: round(record.electrical.powerFactor, 4),
      maxDemand: 0,
      unitsPerMt: record.calculations.unitsPerMt,
      lightingUnits: 0,
    },
    loader: {
      dispatchMt: round(record.loader.dispatchMt),
      stockToCustomerMt: round(record.loader.dispatchMt),
      hours: round(record.loader.hours, 2),
      tph: round(record.loader.dispatchMt / (record.loader.hours || 1), 2),
      dieselLitres: round(record.loader.dieselLitres),
      litresPerHour: round(record.loader.dieselLitres / (record.loader.hours || 1), 2),
      litresPerMt: record.calculations.loaderLitresPerMt,
    },
    cop: {
      costPerMt: record.calculations.copPerMt,
      powerCostPerMt: round(record.cop.powerCost / (record.productionMt || 1), 2),
      dieselCostPerMt: round(record.cop.dieselCost / (record.productionMt || 1), 2),
    },
    sourceRows: {
      dailyRecord: 0,
    },
  };
}

function snapshotChecksum(records: DailyPlantRecord[]) {
  return crypto.createHash("sha256").update(JSON.stringify(records)).digest("hex");
}
