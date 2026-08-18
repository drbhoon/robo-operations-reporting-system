import type { CapturePayload, DailyPlantRecord } from "./types";
import { defaultCostRatesFor, mergeCostRates, plantRateGroup as costRateGroup, type PlantCostRates } from "./plant-config-client";
import {
  CAPTURE_PRODUCTS,
  LOSS_CATEGORIES,
  PLANT_CONFIGS,
  PLANT_LOSS_REASONS,
  QUARRY_LOSS_REASONS,
  type LossCategory,
  type LossReason,
} from "./types";
import { ratio, round, sum } from "../reporting/calculations";

type CalculationInput = Pick<
  DailyPlantRecord,
  | "plantCode"
  | "date"
  | "plantName"
  | "productMixPercentages"
  | "productMix"
  | "overburden"
  | "interCartingQuantityMt"
  | "dispatch"
  | "openingStock"
  | "stockAdjustments"
  | "bookStock"
  | "productionMt"
  | "targetMt"
  | "electrical"
  | "loader"
  | "electricLoader"
  | "cop"
  | "equipmentHourMeters"
>;

const DOMESTIC_MF = 50;

type FrozenCostRates = {
  drillingBlasting: number;
  electricityUnit: number;
  interCarting: number;
  loadingTransport: number;
  diesel: number;
  dieselVariance: number;
  obSoftRock: number;
  obHardRock: number;
};

export function calculateDailyRecord(input: CalculationInput): DailyPlantRecord["calculations"] {
  const rates = frozenCostRatesFromPayload(input);
  const electricLoader = input.electricLoader ?? emptyElectricLoader();
  const openingStock = normalizeOptionalProductQuantities(input.openingStock);
  const productMix = normalizeOptionalProductQuantities(input.productMix);
  const dispatch = normalizeOptionalProductQuantities(input.dispatch);
  const stockAdjustments = input.stockAdjustments;
  const productMixTotal = sum(CAPTURE_PRODUCTS.map((product) => productMix[product]));
  const productMixPercentageTotal = sum(CAPTURE_PRODUCTS.map((product) => input.productMixPercentages[product]));
  const dispatchTotal = sum(CAPTURE_PRODUCTS.map((product) => dispatch[product]));
  const calculatedClosingStock = Object.fromEntries(
    CAPTURE_PRODUCTS.map((product) => [
      product,
      roundOptionalProductQuantity(product, openingStock[product] + productMix[product] - dispatch[product] + stockAdjustments[product]),
    ]),
  ) as DailyPlantRecord["calculations"]["calculatedClosingStock"];
  const monthlyOpeningBookStock = normalizeOptionalProductQuantities(input.bookStock.monthlyOpening);
  const bookOpeningStock = input.date.endsWith("-01") && hasAnyProductValue(monthlyOpeningBookStock)
    ? monthlyOpeningBookStock
    : openingStock;
  const calculatedBookStock = Object.fromEntries(
    CAPTURE_PRODUCTS.map((product) => [
      product,
      roundOptionalProductQuantity(product, bookOpeningStock[product] + productMix[product] - dispatch[product] + stockAdjustments[product]),
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
    vsi: round(ratio(productMixTotal, equipmentRunningHours.vsi), 2),
  };
  const plantMf = plantElectricalMf(input.plantCode);
  const kwhMultiplyingFactor = plantMf || input.electrical.kwhMultiplyingFactor || 1;
  const kvahMultiplyingFactor = plantMf || input.electrical.kvahMultiplyingFactor || 1;
  const domesticMultiplyingFactor = domesticMeterMfFor(input.plantCode || input.plantName);
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
  const combinedPowerUnits = round(kvahUnitsConsumed);
  const productionPowerUnits = round(
    Math.max(0, input.electrical.excludeDomesticFromUnitsPerMt ? kvahUnitsConsumed - domesticPowerUnits : kvahUnitsConsumed),
  );
  const powerFactor = round(ratio(electricalUnitsConsumed, kvahUnitsConsumed), 4);
  const loaderRunningHours = round(Math.max(0, input.loader.hourMeter.closing - input.loader.hourMeter.opening), 2);
  const loaderProductionHours = round(Math.max(0, loaderRunningHours - input.loader.otherWorksHours), 2);
  const loaderDispatchMt = mirroredLoaderDispatchPlant(input.plantCode || input.plantName) ? dispatchTotal : input.loader.dispatchMt;
  const loaderTph = round(ratio(loaderDispatchMt, loaderProductionHours), 2);
  const electricLoaderRunningHours = round(Math.max(0, electricLoader.meter.closing - electricLoader.meter.opening), 2);
  const electricLoaderKwhUnits = round(Math.max(0, electricLoader.kwh.closing - electricLoader.kwh.opening), 2);
  const electricLoaderKvahUnits = round(Math.max(0, electricLoader.kvah.closing - electricLoader.kvah.opening), 2);
  const electricLoaderUnitsPerMt = round(ratio(electricLoaderKvahUnits, electricLoader.dispatchMt), 3);
  const electricLoaderTph = round(ratio(electricLoader.dispatchMt, electricLoaderRunningHours), 2);
  const loaderDieselCost = round(input.loader.dieselLitres * rates.diesel, 2);
  const loaderDieselVarianceCost = round(input.loader.includeDieselVariance ? input.loader.dieselLitres * rates.dieselVariance : 0, 2);
  const drillingBlastingCost = round(input.productionMt * rates.drillingBlasting, 2);
  const loadingTransportCost = round(input.productionMt * rates.loadingTransport, 2);
  const overburdenCost = round((input.overburden.softRockMt * rates.obSoftRock) + (input.overburden.hardRockMt * rates.obHardRock), 2);
  const electricalCost = round(kvahUnitsConsumed * rates.electricityUnit, 2);
  const interCartingCost = round(Math.max(0, input.interCartingQuantityMt ?? 0) * rates.interCarting, 2);
  const fixedCost = input.cop.fixedCost || input.cop.fixedCostMonthly;
  const overburdenRemovalCost = overburdenCost;
  const plantMaintenanceCost = input.cop.plantMaintenanceCost || input.cop.plantCost;
  const sparesConsumablesCost = input.cop.sparesConsumablesCost || input.cop.consumablesCost;
  const loaderHandlingCost = loaderDieselCost + loaderDieselVarianceCost + interCartingCost;
  const totalCost =
    drillingBlastingCost +
    loadingTransportCost +
    overburdenRemovalCost +
    input.cop.rawMaterialCost +
    input.cop.rentPlantCost +
    electricalCost +
    plantMaintenanceCost +
    sparesConsumablesCost +
    input.cop.wearPartsCost +
    loaderHandlingCost +
    fixedCost +
    input.cop.maintenanceCost;

  return {
    productMixTotal: round(productMixTotal),
    productMixPercentageTotal: round(productMixPercentageTotal),
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
    loaderDispatchMt: round(loaderDispatchMt),
    loaderTph,
    electricLoaderRunningHours,
    electricLoaderKwhUnits,
    electricLoaderKvahUnits,
    electricLoaderUnitsPerMt,
    electricLoaderTph,
    loaderDieselCost,
    loaderDieselVarianceCost,
    interCartingCost,
    drillingBlastingCost,
    loadingTransportCost,
    overburdenCost,
    electricalCost,
    fixedCostDaily: 0,
    totalCopCost: round(totalCost, 2),
    loaderLitresPerMt: round(ratio(input.loader.dieselLitres, loaderDispatchMt), 3),
    copPerMt: round(ratio(totalCost, input.productionMt), 2),
    achievementPct: round(ratio(input.productionMt, input.targetMt) * 100),
  };
}

export function materializeCalculatedFields(payload: CapturePayload): CapturePayload {
  const payloadWithProductMix = materializeProductMix(payload);
  const payloadWithLossDetails = ensureLossDetails(payloadWithProductMix);
  const payloadWithFrozenRates = materializeFrozenRates(payloadWithLossDetails);
  const calculations = calculateDailyRecord(payloadWithFrozenRates);
  const plantMf = plantElectricalMf(payload.plantCode) || payload.electrical.kwhMultiplyingFactor;
  const lossHours = Object.fromEntries(
    Object.entries(payloadWithLossDetails.lossDetails).map(([category, detail]) => [category, detail.hours]),
  ) as CapturePayload["lossHours"];
  const totalLossHours = round(sum(Object.values(lossHours)), 2);
  const firstLoss = Object.entries(payloadWithLossDetails.lossDetails).find(([, detail]) => detail.hours > 0);

  return {
    ...payloadWithFrozenRates,
    plantName: plantConfigFor(payload.plantCode)?.name ?? payload.plantName,
    plantHours: {
      ...payload.plantHours,
      loss: calculatedLossHours(payload.plantHours),
    },
    lossHours,
    lossEvent: {
      reason: firstLoss ? reasonForLossCategory(firstLoss[0] as LossCategory) : "",
      hours: totalLossHours,
      comments: firstLoss?.[1].comments ?? "",
    },
    closingStock: calculations.calculatedClosingStock,
    bookStock: {
      ...payload.bookStock,
      monthlyOpening: normalizeOptionalProductQuantities(payloadWithFrozenRates.bookStock.monthlyOpening),
      calculatedClosing: calculations.calculatedBookStock,
    },
    machineHours: calculations.equipmentRunningHours,
    tph: calculations.equipmentTph,
    electrical: {
      ...payloadWithFrozenRates.electrical,
      kwhMultiplyingFactor: plantMf,
      kvahMultiplyingFactor: plantMf,
      unitsConsumed: calculations.electricalUnitsConsumed,
      kvahUnitsConsumed: calculations.kvahUnitsConsumed,
      domesticUnits: calculations.domesticPowerUnits,
      domestic: {
        ...payloadWithFrozenRates.electrical.domestic,
        multiplyingFactor: domesticMeterMfFor(payload.plantCode || payload.plantName),
        unitsConsumed: calculations.domesticPowerUnits,
      },
      powerFactor: calculations.powerFactor,
    },
    loader: {
      ...payloadWithFrozenRates.loader,
      hours: calculations.loaderRunningHours,
      productionHours: calculations.loaderProductionHours,
      dispatchMt: calculations.loaderDispatchMt,
      tph: calculations.loaderTph,
      dieselCost: calculations.loaderDieselCost,
      dieselVarianceCost: calculations.loaderDieselVarianceCost,
    },
    electricLoader: {
      ...payloadWithFrozenRates.electricLoader,
      runningHours: calculations.electricLoaderRunningHours,
      kwhUnits: calculations.electricLoaderKwhUnits,
      kvahUnits: calculations.electricLoaderKvahUnits,
      unitsPerMt: calculations.electricLoaderUnitsPerMt,
      tph: calculations.electricLoaderTph,
    },
    cop: {
      ...payloadWithFrozenRates.cop,
      fixedCostDaily: calculations.fixedCostDaily,
      frozenDrillingBlastingRate: payloadWithFrozenRates.cop.frozenDrillingBlastingRate,
      frozenLoadingTransportRate: payloadWithFrozenRates.cop.frozenLoadingTransportRate,
      frozenObSoftRockRate: payloadWithFrozenRates.cop.frozenObSoftRockRate,
      frozenObHardRockRate: payloadWithFrozenRates.cop.frozenObHardRockRate,
      frozenDieselRate: payloadWithFrozenRates.cop.frozenDieselRate,
      frozenDieselVarianceRate: payloadWithFrozenRates.cop.frozenDieselVarianceRate,
      frozenElectricityUnitRate: payloadWithFrozenRates.cop.frozenElectricityUnitRate,
      frozenInterCartingRate: payloadWithFrozenRates.cop.frozenInterCartingRate,
      electricalCost: calculations.electricalCost,
      loaderCost: calculations.loaderDieselCost + calculations.loaderDieselVarianceCost,
      powerCost: calculations.electricalCost,
      dieselCost: calculations.loaderDieselCost,
      fixedCost: payloadWithFrozenRates.cop.fixedCost || payloadWithFrozenRates.cop.fixedCostMonthly,
      drillingBlastingCost: calculations.drillingBlastingCost,
      internalTransportationCost: calculations.loadingTransportCost,
      overburdenRemovalCost: calculations.overburdenCost,
      intercartingExpenses: calculations.interCartingCost,
      plantMaintenanceCost: payloadWithFrozenRates.cop.plantMaintenanceCost || payloadWithFrozenRates.cop.plantCost,
      sparesConsumablesCost: payloadWithFrozenRates.cop.sparesConsumablesCost || payloadWithFrozenRates.cop.consumablesCost,
    },
  };
}

export function calculatedLossHours(plantHours: Pick<DailyPlantRecord["plantHours"], "available" | "production" | "scheduledStoppage">) {
  return round(Math.max(0, plantHours.available - plantHours.production - plantHours.scheduledStoppage), 2);
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
    case "Blasting":
      return "quarryBlasting";
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

export function isQuarryLossReason(reason: string) {
  return (QUARRY_LOSS_REASONS as readonly string[]).some((option) => option === reason);
}

export function domesticMeterMf() {
  return DOMESTIC_MF;
}

export function domesticMeterMfFor(codeOrName: string) {
  return plantRateGroup(codeOrName) === "Keesara" ? 30 : DOMESTIC_MF;
}

export function frozenCostRatesFor(codeOrName: string) {
  const rates = defaultCostRatesFor(codeOrName);
  return {
    diesel: rates.diesel,
    dieselVariance: rates.dieselVariance,
    drillingBlasting: rates.drillingBlasting,
    electricityUnit: rates.electricityUnit,
    interCarting: rates.interCarting,
    loadingTransport: rates.loadingTransport,
    obHardRock: rates.obHardRock,
    obSoftRock: rates.obSoftRock,
  };
}

export function plantRateGroup(codeOrName: string) {
  return costRateGroup(codeOrName);
}

export function mirroredLoaderDispatchPlant(codeOrName: string) {
  const group = plantRateGroup(codeOrName);
  return group === "Keesara" || group === "Lakadaram";
}

function materializeProductMix(payload: CapturePayload): CapturePayload {
  const percentages = hasAnyProductValue(payload.productMixPercentages)
    ? payload.productMixPercentages
    : percentagesFromProductMix(payload.productMix, payload.productionMt);
  return {
    ...payload,
    productMixPercentages: percentages,
    productMix: Object.fromEntries(
      CAPTURE_PRODUCTS.map((product) => [product, round((payload.productionMt * percentages[product]) / 100, 2)]),
    ) as CapturePayload["productMix"],
  };
}

function materializeFrozenRates(payload: CapturePayload): CapturePayload {
  const withRates = payloadWithCostRates(payload, frozenCostRatesFromPayload(payload));
  return {
    ...withRates,
    electrical: {
      ...withRates.electrical,
      domestic: {
        ...withRates.electrical.domestic,
        multiplyingFactor: domesticMeterMfFor(payload.plantCode || payload.plantName),
      },
    },
  };
}

export function payloadWithCostRates(payload: CapturePayload, rates: Partial<PlantCostRates>): CapturePayload {
  const merged = mergeCostRates(payload.plantCode || payload.plantName, rates);
  return {
    ...payload,
    loader: {
      ...payload.loader,
      dieselRate: merged.diesel,
      dieselVarianceRate: merged.dieselVariance,
    },
    cop: {
      ...payload.cop,
      frozenDieselRate: merged.diesel,
      frozenDieselVarianceRate: merged.dieselVariance,
      frozenDrillingBlastingRate: merged.drillingBlasting,
      frozenElectricityUnitRate: merged.electricityUnit,
      frozenInterCartingRate: merged.interCarting,
      frozenLoadingTransportRate: merged.loadingTransport,
      frozenObHardRockRate: merged.obHardRock,
      frozenObSoftRockRate: merged.obSoftRock,
    },
  };
}

export function ensureLossDetails(payload: CapturePayload): CapturePayload {
  const details = Object.fromEntries(
    LOSS_CATEGORIES.map((typedCategory) => {
      return [
        typedCategory,
        {
          hours: payload.lossDetails?.[typedCategory]?.hours ?? payload.lossHours[typedCategory] ?? 0,
          comments: payload.lossDetails?.[typedCategory]?.comments ?? "",
        },
      ];
    }),
  ) as CapturePayload["lossDetails"];
  if (Object.values(details).some((detail) => detail.hours > 0 || detail.comments.trim())) {
    return { ...payload, lossDetails: details };
  }
  const category = lossCategoryForReason(payload.lossEvent.reason);
  if (category) {
    details[category] = { hours: payload.lossEvent.hours, comments: payload.lossEvent.comments };
  }
  return { ...payload, lossDetails: details };
}

function percentagesFromProductMix(productMix: CapturePayload["productMix"], productionMt: number) {
  return Object.fromEntries(
    CAPTURE_PRODUCTS.map((product) => [product, round(productionMt ? (productMix[product] / productionMt) * 100 : 0, 2)]),
  ) as CapturePayload["productMixPercentages"];
}

function hasAnyProductValue(values: Partial<Record<(typeof CAPTURE_PRODUCTS)[number], number>> | undefined) {
  return CAPTURE_PRODUCTS.some((product) => (values?.[product] ?? 0) > 0);
}

function normalizeOptionalProductQuantities<T extends Partial<Record<(typeof CAPTURE_PRODUCTS)[number], number>>>(values: T): T {
  return Object.fromEntries(
    CAPTURE_PRODUCTS.map((product) => [product, roundOptionalProductQuantity(product, values[product] ?? 0)]),
  ) as T;
}

function roundOptionalProductQuantity(product: (typeof CAPTURE_PRODUCTS)[number], value: number) {
  const rounded = round(value);
  return product === "40 MM" && rounded < 0 ? 0 : rounded;
}

function reasonForLossCategory(category: LossCategory): LossReason {
  switch (category) {
    case "quarryOversizeJams":
      return "Oversize Jams";
    case "quarryNoTippers":
      return "No Feed due to Non-Availability of Tippers";
    case "quarryNoMaterial":
      return "No Material Available in Quarry";
    case "quarryBlasting":
      return "Blasting";
    case "plantBreakdown":
      return "Breakdown Hours";
    case "plantOther":
      return "Other Reasons";
    case "plantScheduledMaintenance":
      return "Scheduled Maintenance";
    case "plantIdle":
      return "Idle Hours";
  }
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

export function frozenCostRatesFromPayload(input: Pick<DailyPlantRecord, "cop" | "plantCode" | "plantName">): FrozenCostRates {
  const defaults = frozenCostRatesFor(input.plantCode || input.plantName);
  return {
    diesel: input.cop.frozenDieselRate || defaults.diesel,
    dieselVariance: input.cop.frozenDieselVarianceRate || defaults.dieselVariance,
    drillingBlasting: input.cop.frozenDrillingBlastingRate || defaults.drillingBlasting,
    electricityUnit: input.cop.frozenElectricityUnitRate || defaults.electricityUnit,
    interCarting: input.cop.frozenInterCartingRate || defaults.interCarting,
    loadingTransport: input.cop.frozenLoadingTransportRate || defaults.loadingTransport,
    obHardRock: input.cop.frozenObHardRockRate || defaults.obHardRock,
    obSoftRock: input.cop.frozenObSoftRockRate || defaults.obSoftRock,
  };
}

function emptyElectricLoader(): DailyPlantRecord["electricLoader"] {
  return {
    dispatchMt: 0,
    enabled: false,
    kwh: { opening: 0, closing: 0 },
    kwhUnits: 0,
    kvah: { opening: 0, closing: 0 },
    kvahUnits: 0,
    meter: { opening: 0, closing: 0 },
    runningHours: 0,
    tph: 0,
    unitsPerMt: 0,
  };
}
