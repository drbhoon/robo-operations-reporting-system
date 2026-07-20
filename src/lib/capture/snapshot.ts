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
  const lossDetails = record.lossDetails ?? Object.fromEntries(
    Object.entries(record.lossHours).map(([category, hours]) => [category, { hours, comments: "" }]),
  );

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
      closing: CAPTURE_PRODUCTS.map((name) => ({ name, mt: round(record.calculations.calculatedClosingStock[name]) })),
      bookClosing: CAPTURE_PRODUCTS.map((name) => ({ name, mt: round(record.calculations.calculatedBookStock[name]) })),
    },
    machine: {
      jawHours: round(record.calculations.equipmentRunningHours.jaw, 2),
      coneHours: round(record.calculations.equipmentRunningHours.cone, 2),
      vsiHours: round(record.calculations.equipmentRunningHours.vsi, 2),
      jawTph: round(record.calculations.equipmentTph.jaw, 2),
      coneTph: round(record.calculations.equipmentTph.cone, 2),
      vsiTph: round(record.calculations.equipmentTph.vsi, 2),
      hourMeters: record.equipmentHourMeters,
    },
    plantHours: {
      scheduledHours: round(record.plantHours.available, 2),
      nonProductiveHours: round(record.plantHours.scheduledStoppage, 2),
      productionHours: round(record.plantHours.production, 2),
      lossHours: round(record.plantHours.loss, 2),
      idleHours: round(record.lossHours.plantIdle, 2),
      breakdownHours: round(record.lossHours.plantBreakdown, 2),
      lossBreakdown: record.lossHours,
      lossDetails,
      lossReason: record.lossEvent?.reason,
      lossComments: record.lossEvent?.comments,
    },
    electrical: {
      kwh: round(record.calculations.electricalUnitsConsumed),
      kvah: round(record.calculations.kvahUnitsConsumed),
      powerFactor: round(record.calculations.powerFactor, 4),
      maxDemand: round(record.electrical.cmd),
      unitsPerMt: record.calculations.unitsPerMt,
      lightingUnits: round(record.electrical.domesticUnits),
      productionUnits: round(record.calculations.productionPowerUnits),
      domesticUnits: round(record.calculations.domesticPowerUnits),
      domesticUnitsPerMt: round(record.calculations.domesticUnitsPerMt, 3),
      combinedUnits: round(record.calculations.combinedPowerUnits),
      combinedUnitsPerMt: round(record.calculations.combinedUnitsPerMt, 3),
      cmd: round(record.electrical.cmd),
      kwhMultiplyingFactor: round(record.electrical.kwhMultiplyingFactor, 4),
      kvahMultiplyingFactor: round(record.electrical.kvahMultiplyingFactor, 4),
      domesticMultiplyingFactor: round(record.electrical.domestic.multiplyingFactor, 4),
      electricityCost: round(record.calculations.electricalCost, 2),
    },
    loader: {
      dispatchMt: round(record.loader.dispatchMt),
      stockToCustomerMt: round(record.loader.dispatchMt),
      hours: round(record.calculations.loaderRunningHours, 2),
      productionHours: round(record.calculations.loaderProductionHours, 2),
      otherWorksHours: round(record.loader.otherWorksHours, 2),
      tph: round(record.calculations.loaderTph, 2),
      dieselLitres: round(record.loader.dieselLitres),
      dieselRate: round(record.loader.dieselRate, 2),
      dieselCost: round(record.calculations.loaderDieselCost, 2),
      litresPerHour: round(record.loader.dieselLitres / (record.calculations.loaderRunningHours || 1), 2),
      litresPerMt: record.calculations.loaderLitresPerMt,
    },
    cop: {
      costPerMt: record.calculations.copPerMt,
      totalCost: record.calculations.totalCopCost,
      fixedCostMonthly: round(record.cop.fixedCostMonthly, 2),
      fixedCostDaily: round(record.calculations.fixedCostDaily, 2),
      fixedCost: round(record.cop.fixedCost || record.cop.fixedCostMonthly, 2),
      quarryObCost: round(record.cop.quarryObCost, 2),
      quarryBlastingCost: round(record.cop.quarryBlastingCost, 2),
      quarryLtCost: round(record.cop.quarryLtCost, 2),
      drillingBlastingCost: round(record.cop.drillingBlastingCost || record.cop.quarryBlastingCost, 2),
      internalTransportationCost: round(record.cop.internalTransportationCost, 2),
      overburdenRemovalCost: round(record.cop.overburdenRemovalCost || record.cop.quarryObCost, 2),
      rawMaterialCost: round(record.cop.rawMaterialCost, 2),
      rentPlantCost: round(record.cop.rentPlantCost, 2),
      plantCost: round(record.cop.plantCost, 2),
      plantMaintenanceCost: round(record.cop.plantMaintenanceCost || record.cop.plantCost, 2),
      electricalCost: round(record.calculations.electricalCost, 2),
      loaderCost: round(record.calculations.loaderDieselCost, 2),
      sparesConsumablesCost: round(record.cop.sparesConsumablesCost || record.cop.consumablesCost, 2),
      wearPartsCost: round(record.cop.wearPartsCost, 2),
      intercartingExpenses: round(record.cop.intercartingExpenses, 2),
      powerCostPerMt: round(record.calculations.electricalCost / (record.productionMt || 1), 2),
      dieselCostPerMt: round(record.calculations.loaderDieselCost / (record.productionMt || 1), 2),
    },
    sourceRows: {
      dailyRecord: 0,
    },
  };
}

function snapshotChecksum(records: DailyPlantRecord[]) {
  return crypto.createHash("sha256").update(JSON.stringify(records)).digest("hex");
}
