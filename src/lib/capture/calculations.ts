import type { CapturePayload, DailyPlantRecord } from "./types";
import { CAPTURE_PRODUCTS } from "./types";
import { ratio, round, sum } from "../reporting/calculations";

type CalculationInput = Pick<
  DailyPlantRecord,
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
  const electricalUnitsConsumed = round(
    Math.max(0, input.electrical.closingKwh - input.electrical.openingKwh) *
      (input.electrical.kwhMultiplyingFactor || 1),
  );
  const kvahUnitsConsumed = round(
    Math.max(0, input.electrical.closingKvah - input.electrical.openingKvah) *
      (input.electrical.kvahMultiplyingFactor || 1),
  );
  const productionPowerUnits = round(
    Math.max(0, electricalUnitsConsumed - (input.electrical.excludeDomesticFromUnitsPerMt ? input.electrical.domesticUnits : 0)),
  );
  const totalCost =
    input.cop.powerCost +
    input.cop.dieselCost +
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
    unitsPerMt: round(ratio(productionPowerUnits, input.productionMt), 3),
    loaderLitresPerMt: round(ratio(input.loader.dieselLitres, input.loader.dispatchMt), 3),
    copPerMt: round(ratio(totalCost, input.productionMt), 2),
    achievementPct: round(ratio(input.productionMt, input.targetMt) * 100),
  };
}

export function materializeCalculatedFields(payload: CapturePayload): CapturePayload {
  const calculations = calculateDailyRecord(payload);

  return {
    ...payload,
    closingStock: calculations.calculatedClosingStock,
    bookStock: {
      ...payload.bookStock,
      calculatedClosing: calculations.calculatedBookStock,
    },
    machineHours: calculations.equipmentRunningHours,
    tph: calculations.equipmentTph,
    electrical: {
      ...payload.electrical,
      unitsConsumed: calculations.electricalUnitsConsumed,
      kvahUnitsConsumed: calculations.kvahUnitsConsumed,
    },
  };
}
