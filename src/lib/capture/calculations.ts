import type { DailyPlantRecord } from "./types";
import { CAPTURE_PRODUCTS } from "./types";
import { ratio, round, sum } from "../reporting/calculations";

type CalculationInput = Pick<
  DailyPlantRecord,
  "productMix" | "dispatch" | "productionMt" | "targetMt" | "electrical" | "loader" | "cop"
>;

export function calculateDailyRecord(input: CalculationInput): DailyPlantRecord["calculations"] {
  const productMixTotal = sum(CAPTURE_PRODUCTS.map((product) => input.productMix[product]));
  const dispatchTotal = sum(CAPTURE_PRODUCTS.map((product) => input.dispatch[product]));
  const unitsConsumed =
    input.electrical.unitsConsumed ||
    Math.max(0, input.electrical.closingKwh - input.electrical.openingKwh);
  const totalCost =
    input.cop.powerCost +
    input.cop.dieselCost +
    input.cop.consumablesCost +
    input.cop.maintenanceCost;

  return {
    productMixTotal: round(productMixTotal),
    dispatchTotal: round(dispatchTotal),
    unitsPerMt: round(ratio(unitsConsumed, input.productionMt), 3),
    loaderLitresPerMt: round(ratio(input.loader.dieselLitres, input.loader.dispatchMt), 3),
    copPerMt: round(ratio(totalCost, input.productionMt), 2),
    achievementPct: round(ratio(input.productionMt, input.targetMt) * 100),
  };
}
