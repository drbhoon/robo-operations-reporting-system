import assert from "node:assert/strict";
import { calculateDailyRecord, materializeCalculatedFields } from "../src/lib/capture/calculations";
import { validateCaptureRecord } from "../src/lib/capture/validation";
import { buildTotals } from "../src/lib/reporting/calculations";
import type { CapturePayload, DailyPlantRecord, LossCategory } from "../src/lib/capture/types";
import { CAPTURE_PRODUCTS, LOSS_CATEGORIES } from "../src/lib/capture/types";
import type { DailySnapshot } from "../src/lib/reporting/types";

const zeroProducts = () => Object.fromEntries(CAPTURE_PRODUCTS.map((product) => [product, 0])) as CapturePayload["productMix"];
const lossDetails = (overrides: Partial<Record<LossCategory, { hours: number; comments: string }>> = {}) =>
  Object.fromEntries(
    LOSS_CATEGORIES.map((category) => [
      category,
      overrides[category] ?? { hours: 0, comments: "" },
    ]),
  ) as CapturePayload["lossDetails"];

function payload(overrides: Partial<CapturePayload> = {}): CapturePayload {
  const products = zeroProducts();
  return {
    date: "2026-08-01",
    plantCode: "KEESARA",
    plantName: "Keesara",
    targetMt: 1000,
    productionMt: 0,
    interCartingQuantityMt: 0,
    productMixPercentages: products,
    productMix: products,
    overburden: { softRockMt: 0, hardRockMt: 0 },
    dispatch: products,
    openingStock: products,
    closingStock: products,
    stockAdjustments: products,
    stockAdjustmentComment: "",
    bookStock: {
      monthlyOpening: products,
      calculatedClosing: products,
    },
    machineHours: { jaw: 0, cone: 0, vsi: 0 },
    equipmentHourMeters: {
      jaw: { opening: 10, closing: 10 },
      cone: { opening: 20, closing: 20 },
      vsi: { opening: 30, closing: 30 },
    },
    tph: { jaw: 0, cone: 0, vsi: 0 },
    plantHours: { available: 24, production: 0, scheduledStoppage: 8, loss: 16 },
    lossHours: { ...Object.fromEntries(LOSS_CATEGORIES.map((category) => [category, 0])), plantIdle: 16 } as CapturePayload["lossHours"],
    lossDetails: lossDetails({ plantIdle: { hours: 16, comments: "Maintenance shutdown" } }),
    lossEvent: { reason: "Idle Hours", hours: 16, comments: "Maintenance shutdown" },
    electrical: {
      openingKwh: 100,
      closingKwh: 100,
      kwhMultiplyingFactor: 2,
      openingKvah: 200,
      closingKvah: 200,
      kvahMultiplyingFactor: 2,
      unitsConsumed: 0,
      kvahUnitsConsumed: 0,
      domesticUnits: 0,
      domestic: { openingKwh: 0, closingKwh: 0, multiplyingFactor: 30, unitsConsumed: 0 },
      excludeDomesticFromUnitsPerMt: true,
      powerFactor: 0,
      cmd: 0,
    },
    loader: {
      hours: 0,
      hourMeter: { opening: 50, closing: 50 },
      productionHours: 0,
      otherWorksHours: 0,
      tph: 0,
      dieselLitres: 0,
      dieselRate: 97,
      dieselVarianceRate: 6.32,
      includeDieselVariance: false,
      dieselCost: 0,
      dieselVarianceCost: 0,
      dispatchMt: 0,
    },
    electricLoader: {
      enabled: false,
      meter: { opening: 0, closing: 0 },
      kwh: { opening: 0, closing: 0 },
      kvah: { opening: 0, closing: 0 },
      dispatchMt: 0,
      runningHours: 0,
      kwhUnits: 0,
      kvahUnits: 0,
      unitsPerMt: 0,
      tph: 0,
    },
    cop: {
      forecastProductionMt: 0,
      fixedCostMonthly: 0,
      fixedCostDaily: 0,
      fixedCost: 0,
      frozenDrillingBlastingRate: 55,
      frozenLoadingTransportRate: 65,
      frozenObSoftRockRate: 35,
      frozenObHardRockRate: 55,
      frozenDieselRate: 97,
      frozenDieselVarianceRate: 6.32,
      frozenElectricityUnitRate: 7.71,
      frozenInterCartingRate: 18,
      quarryObCost: 0,
      quarryBlastingCost: 0,
      quarryLtCost: 0,
      drillingBlastingCost: 0,
      internalTransportationCost: 0,
      overburdenRemovalCost: 0,
      rawMaterialCost: 0,
      rentPlantCost: 0,
      plantCost: 0,
      plantMaintenanceCost: 0,
      electricalCost: 0,
      loaderCost: 0,
      sparesConsumablesCost: 0,
      wearPartsCost: 0,
      intercartingExpenses: 0,
      powerCost: 0,
      dieselCost: 0,
      consumablesCost: 0,
      maintenanceCost: 0,
    },
    remarks: "Maintenance day entered with no production or dispatch.",
    variationReasons: {
      units: "No production power during maintenance.",
      diesel: "",
      production: "Plant was under planned maintenance.",
      dispatch: "",
    },
    evidencePhotos: [],
    submittedBy: "regression",
    ...overrides,
  };
}

function recordFromPayload(input: CapturePayload): DailyPlantRecord {
  const materialized = materializeCalculatedFields(input);
  return {
    ...materialized,
    id: "regression-record",
    status: "FINAL",
    reviewStatus: "OPEN",
    calculations: calculateDailyRecord(materialized),
    validation: { valid: false, issues: [] },
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

const zeroProductionRecord = recordFromPayload(payload());
const zeroProductionValidation = validateCaptureRecord(zeroProductionRecord);
assert.equal(
  zeroProductionValidation.valid,
  true,
  `zero-production maintenance day should be valid: ${zeroProductionValidation.issues.map((issue) => `${issue.code}:${issue.message}`).join(" | ")}`,
);

const kvahPayload = payload({
  productionMt: 100,
  productMixPercentages: { ...zeroProducts(), "R Sand": 100 },
  plantHours: { available: 24, production: 10, scheduledStoppage: 14, loss: 0 },
  lossHours: Object.fromEntries(LOSS_CATEGORIES.map((category) => [category, 0])) as CapturePayload["lossHours"],
  lossDetails: lossDetails(),
  electrical: {
    ...payload().electrical,
    openingKwh: 100,
    closingKwh: 109,
    openingKvah: 200,
    closingKvah: 210,
  },
  variationReasons: {
    units: "Low unit per MT checked against KVAH readings.",
    diesel: "",
    production: "Short controlled production test run.",
    dispatch: "",
  },
});
const kvahRecord = recordFromPayload(kvahPayload);
assert.equal(kvahRecord.calculations.kvahUnitsConsumed, 20, "Keesara KVAH units should apply plant MF 2.");
assert.equal(kvahRecord.calculations.unitsPerMt, 0.2, "Unit/MT should be calculated from production KVAH units.");

const totals = buildTotals([
  {
    production: { mt: 100 },
    dispatch: { totalMt: 80 },
    electrical: { productionUnits: 20, kvah: 20 },
    loader: { dieselLitres: 10, dispatchMt: 80 },
    machine: { jawHours: 5, coneHours: 4, vsiHours: 2, jawTph: 10, coneTph: 10, vsiTph: 10 },
    plantHours: { productionHours: 5, lossHours: 0 },
    targetMt: 100,
  },
  {
    production: { mt: 300 },
    dispatch: { totalMt: 250 },
    electrical: { productionUnits: 90, kvah: 90 },
    loader: { dieselLitres: 30, dispatchMt: 250 },
    machine: { jawHours: 5, coneHours: 6, vsiHours: 3, jawTph: 60, coneTph: 50, vsiTph: 100 },
    plantHours: { productionHours: 5, lossHours: 1 },
    targetMt: 300,
  },
] as DailySnapshot[]);
assert.equal(totals.avgJawTph, 40, "Jaw average TPH should be cumulative production / cumulative jaw hours.");
assert.equal(totals.avgVsiTph, 80, "VSI average TPH should be cumulative production / cumulative VSI hours.");

console.log("Regression checks passed.");
