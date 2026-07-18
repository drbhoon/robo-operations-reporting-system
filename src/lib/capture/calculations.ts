import type { CapturePayload, DailyPlantRecord } from "./types";
import {
  CAPTURE_PRODUCTS,
  PLANT_CONFIGS,
  PLANT_LOSS_REASONS,
  type LossCategory,
  type LossReason,
} from "./types";
import { ratio, round, sum } from "../reporting/calculations";

type CalculationInput = Pick<
  DailyPlantRecord,
  | "plantCode"
  | "date"
  | "productMix"
  | "dispatch"
  | "openingStock"
  | "stockAdjustments"
  | "bookStock"
  | "productionMt"
  | "targetMt"
  | "electrical"
  | "loader"
  | "cop"
  | "equipmentHourMeters"
>;

export function calculateDailyRecord(input: CalculationInput): DailyPlantRecord["calculations"] {
  const productMixTotal = sum(CAPTURE_PRODUCTS.map((product) => input.productMix[product]));
  const dispatchTotal = sum(CAPTURE_PRODUCTS.map((product) => input.dispatch[product]));
  const calculatedClosingStock = Object.fromEntries(
    CAPTURE_PRODUCTS.map((product) => [
      product,
      round(input.openingStock[product] + input.productMix[product] - input.dispatch[product] + input.stockAdjustments[product]),
    ]),
  ) as DailyPlantRecord["calculations"]["calculatedClosingStock"];
  const calculatedBookStock = Object.fromEntries(
    CAPTURE_PRODUCTS.map((product) => [
      product,
      round(input.bookStock.monthlyOpening[product] + input.productMix[product] - input.dispatch[product] + input.stockAdjustments[product]),
    ]),
  ) as DailyPlantRecord["calculations"]["calculatedBookStock"];
  const equipmentRunningHours = Object.fromEntries(
    Object.entries(input.equipmentHourMeters).map(([equipment, reading]) => [
      equipment,
      round(Math.max(0, reading.closing - reading.opening), 2),
    ]),
  ) as DailyPlantRecord["calculations"]["equipmentRunningHours"];
  const equipmentTph = {
    jaw: round(ratio(productMixTotal, equipmentRunningHours.jaw), 2),
    cone: round(ratio(productMixTotal, equipmentRunningHours.cone), 2),
    vsi: round(ratio(input.productMix["R Sand"] + input.productMix["P Sand"] + input.productMix["Plaster Pro"], equipmentRunningHours.vsi), 2),
  };
  const plantMf = plantElectricalMf(input.plantCode);
  const kwhMultiplyingFactor = plantMf || input.electrical.kwhMultiplyingFactor || 1;
  const kvahMultiplyingFactor = plantMf || input.electrical.kvahMultiplyingFactor || 1;
  const domesticMultiplyingFactor = plantMf || input.electrical.domestic.multiplyingFactor || 1;
  const electricalUnitsConsumed = round(
    Math.max(0, input.electrical.closingKwh - input.electrical.openingKwh) *
      kwhMultiplyingFactor,
  );
  const kvahUnitsConsumed = round(
    Math.max(0, input.electrical.closingKvah - input.electrical.openingKvah) *
      kvahMultiplyingFactor,
  );
  const domesticPowerUnits = round(
    Math.max(0, input.electrical.domestic.closingKwh - input.electrical.domestic.openingKwh) *
      domesticMultiplyingFactor,
  );
  const productionPowerUnits = round(Math.max(0, electricalUnitsConsumed - domesticPowerUnits));
  const combinedPowerUnits = round(electricalUnitsConsumed);
  const powerFactor = round(ratio(electricalUnitsConsumed, kvahUnitsConsumed), 4);
  const loaderRunningHours = round(Math.max(0, input.loader.hourMeter.closing - input.loader.hourMeter.opening), 2);
  const loaderProductionHours = round(Math.max(0, loaderRunningHours - input.loader.otherWorksHours), 2);
  const loaderTph = round(ratio(input.loader.dispatchMt, loaderProductionHours), 2);
  const loaderDieselCost = round(input.loader.dieselLitres * input.loader.dieselRate, 2);
  const electricalCost = round(electricalUnitsConsumed * 7.71, 2);
  const fixedCostDaily = dailyFixedCost(input.cop.fixedCostMonthly, input.date);
  const totalCost =
    fixedCostDaily +
    input.cop.quarryObCost +
    input.cop.quarryBlastingCost +
    input.cop.quarryLtCost +
    input.cop.plantCost +
    electricalCost +
    loaderDieselCost +
    input.cop.consumablesCost +
    input.cop.maintenanceCost;

  return {
    productMixTotal: round(productMixTotal),
    dispatchTotal: round(dispatchTotal),
    calculatedClosingStock,
    calculatedBookStock,
    equipmentRunningHours,
    equipmentTph,
    electricalUnitsConsumed,
    kvahUnitsConsumed,
    productionPowerUnits,
    domesticPowerUnits,
    combinedPowerUnits,
    unitsPerMt: round(ratio(productionPowerUnits, input.productionMt), 3),
    domesticUnitsPerMt: round(ratio(domesticPowerUnits, input.productionMt), 3),
    combinedUnitsPerMt: round(ratio(combinedPowerUnits, input.productionMt), 3),
    powerFactor,
    loaderRunningHours,
    loaderProductionHours,
    loaderTph,
    loaderDieselCost,
    electricalCost,
    fixedCostDaily,
    totalCopCost: round(totalCost, 2),
    loaderLitresPerMt: round(ratio(input.loader.dieselLitres, input.loader.dispatchMt), 3),
    copPerMt: round(ratio(totalCost, input.productionMt), 2),
    achievementPct: round(ratio(input.productionMt, input.targetMt) * 100),
  };
}

export function materializeCalculatedFields(payload: CapturePayload): CapturePayload {
  const calculations = calculateDailyRecord(payload);
  const plantMf = plantElectricalMf(payload.plantCode) || payload.electrical.kwhMultiplyingFactor;
  const lossCategory = lossCategoryForReason(payload.lossEvent.reason);
  const lossHours = Object.fromEntries(
    Object.keys(payload.lossHours).map((category) => [
      category,
      category === lossCategory ? payload.lossEvent.hours : 0,
    ]),
  ) as CapturePayload["lossHours"];

  return {
    ...payload,
    plantName: plantConfigFor(payload.plantCode)?.name ?? payload.plantName,
    plantHours: {
      ...payload.plantHours,
      loss: payload.lossEvent.hours,
    },
    lossHours,
    closingStock: calculations.calculatedClosingStock,
    bookStock: {
      ...payload.bookStock,
      calculatedClosing: calculations.calculatedBookStock,
    },
    machineHours: calculations.equipmentRunningHours,
    tph: calculations.equipmentTph,
    electrical: {
      ...payload.electrical,
      kwhMultiplyingFactor: plantMf,
      kvahMultiplyingFactor: plantMf,
      unitsConsumed: calculations.electricalUnitsConsumed,
      kvahUnitsConsumed: calculations.kvahUnitsConsumed,
      domesticUnits: calculations.domesticPowerUnits,
      domestic: {
        ...payload.electrical.domestic,
        multiplyingFactor: plantMf,
        unitsConsumed: calculations.domesticPowerUnits,
      },
      powerFactor: calculations.powerFactor,
    },
    loader: {
      ...payload.loader,
      hours: calculations.loaderRunningHours,
      productionHours: calculations.loaderProductionHours,
      tph: calculations.loaderTph,
      dieselCost: calculations.loaderDieselCost,
    },
    cop: {
      ...payload.cop,
      fixedCostDaily: calculations.fixedCostDaily,
      electricalCost: calculations.electricalCost,
      loaderCost: calculations.loaderDieselCost,
      powerCost: calculations.electricalCost,
      dieselCost: calculations.loaderDieselCost,
    },
  };
}

export function plantConfigFor(codeOrName: string) {
  const normalized = normalizePlant(codeOrName);
  return PLANT_CONFIGS.find((plant) => {
    if (normalizePlant(plant.code) === normalized || normalizePlant(plant.name) === normalized) return true;
    return plant.aliases.some((alias) => normalizePlant(alias) === normalized);
  });
}

export function plantElectricalMf(codeOrName: string) {
  return plantConfigFor(codeOrName)?.electricalMf ?? 0;
}

export function lossCategoryForReason(reason: LossReason | ""): LossCategory | "" {
  switch (reason) {
    case "Oversize Jams":
      return "quarryOversizeJams";
    case "No Feed due to Non-Availability of Tippers":
      return "quarryNoTippers";
    case "No Material Available in Quarry":
      return "quarryNoMaterial";
    case "Breakdown Hours":
      return "plantBreakdown";
    case "Other Reasons":
      return "plantOther";
    case "Scheduled Maintenance":
      return "plantScheduledMaintenance";
    case "Idle Hours":
      return "plantIdle";
    default:
      return "";
  }
}

export function isPlantLossReason(reason: string) {
  return (PLANT_LOSS_REASONS as readonly string[]).some((option) => option === reason);
}

export function dailyFixedCost(monthlyFixedCost: number, date: string) {
  if (!monthlyFixedCost) return 0;
  const [year, month] = date.split("-").map(Number);
  if (!year || !month) return 0;
  return round(monthlyFixedCost / new Date(year, month, 0).getDate(), 2);
}

function normalizePlant(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "").replace(/_/g, "-");
}
