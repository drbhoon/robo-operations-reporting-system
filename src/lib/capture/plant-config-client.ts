export type PlantCostRates = {
  diesel: number;
  dieselVariance: number;
  drillingBlasting: number;
  electricityUnit: number;
  interCarting: number;
  loadingTransport: number;
  obHardRock: number;
  obSoftRock: number;
};

export const DEFAULT_COST_RATES_BY_GROUP: Record<"Girmapur" | "Keesara" | "Lakadaram", PlantCostRates> = {
  Girmapur: {
    diesel: 97,
    dieselVariance: 6.32,
    drillingBlasting: 53,
    electricityUnit: 7.71,
    interCarting: 18,
    loadingTransport: 70,
    obHardRock: 117,
    obSoftRock: 0,
  },
  Keesara: {
    diesel: 97,
    dieselVariance: 6.32,
    drillingBlasting: 55,
    electricityUnit: 7.71,
    interCarting: 18,
    loadingTransport: 65,
    obHardRock: 55,
    obSoftRock: 35,
  },
  Lakadaram: {
    diesel: 97,
    dieselVariance: 6.32,
    drillingBlasting: 125,
    electricityUnit: 7.71,
    interCarting: 18,
    loadingTransport: 0,
    obHardRock: 133,
    obSoftRock: 0,
  },
};

export type PlantOperationalConfig = {
  code: string;
  costRates: PlantCostRates;
  electricLoaderEnabled: boolean;
  name: string;
};

export function electricLoaderEnabledFor(configs: PlantOperationalConfig[], plantCode: string) {
  return configs.find((config) => config.code === plantCode)?.electricLoaderEnabled ?? false;
}

export function defaultCostRatesFor(codeOrName: string): PlantCostRates {
  return DEFAULT_COST_RATES_BY_GROUP[plantRateGroup(codeOrName)];
}

export function mergeCostRates(codeOrName: string, rates: Partial<PlantCostRates> | null | undefined): PlantCostRates {
  return { ...defaultCostRatesFor(codeOrName), ...numberCostRates(rates) };
}

export function plantRateGroup(codeOrName: string): keyof typeof DEFAULT_COST_RATES_BY_GROUP {
  const normalized = codeOrName.trim().toUpperCase().replace(/\s+/g, "").replace(/_/g, "-");
  if (normalized.includes("KEESARA") || normalized.includes("KEESRA")) return "Keesara";
  if (normalized.includes("LAKADARAM") || normalized.includes("LAK-")) return "Lakadaram";
  return "Girmapur";
}

function numberCostRates(rates: Partial<PlantCostRates> | null | undefined): Partial<PlantCostRates> {
  if (!rates) return {};
  return Object.fromEntries(
    Object.entries(rates).map(([key, value]) => [key, Number.isFinite(Number(value)) ? Number(value) : undefined]).filter(([, value]) => value !== undefined),
  ) as Partial<PlantCostRates>;
}
