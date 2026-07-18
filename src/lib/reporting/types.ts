export type ProductName =
  | "R Sand"
  | "20 MM"
  | "10 MM"
  | "P Sand"
  | "Plaster Pro"
  | "WMM"
  | "Natural Fines";

export type ValidationSeverity = "ERROR" | "WARNING";

export type ValidationIssue = {
  severity: ValidationSeverity;
  code: string;
  message: string;
  date?: string;
  field?: string;
};

export type ValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
};

export type DailySnapshot = {
  date: string;
  label: string;
  targetMt: number;
  production: {
    mt: number;
    rawMaterialMt: number;
    products: Array<{ name: ProductName; mt: number }>;
  };
  dispatch: {
    totalMt: number;
    products: Array<{ name: ProductName; mt: number }>;
  };
  stock: {
    opening: Array<{ name: ProductName; mt: number }>;
    closing: Array<{ name: ProductName; mt: number }>;
    bookClosing?: Array<{ name: ProductName; mt: number }>;
  };
  machine: {
    jawHours: number;
    coneHours: number;
    vsiHours: number;
    jawTph: number;
    coneTph: number;
    vsiTph: number;
    hourMeters?: {
      jaw: { opening: number; closing: number };
      cone: { opening: number; closing: number };
      vsi: { opening: number; closing: number };
    };
  };
  plantHours: {
    scheduledHours: number;
    nonProductiveHours: number;
    productionHours: number;
    lossHours: number;
    idleHours: number;
    breakdownHours: number;
    lossBreakdown: Record<string, number>;
    lossReason?: string;
    lossComments?: string;
  };
  electrical: {
    kwh: number;
    kvah: number;
    powerFactor: number;
    maxDemand: number;
    unitsPerMt: number;
    lightingUnits: number;
    productionUnits?: number;
    domesticUnits?: number;
    domesticUnitsPerMt?: number;
    combinedUnits?: number;
    combinedUnitsPerMt?: number;
    cmd?: number;
    kwhMultiplyingFactor?: number;
    kvahMultiplyingFactor?: number;
    domesticMultiplyingFactor?: number;
    electricityCost?: number;
  };
  loader: {
    dispatchMt: number;
    stockToCustomerMt: number;
    hours: number;
    productionHours?: number;
    otherWorksHours?: number;
    tph: number;
    dieselLitres: number;
    dieselRate?: number;
    dieselCost?: number;
    litresPerHour: number;
    litresPerMt: number;
  };
  cop?: {
    costPerMt?: number;
    totalCost?: number;
    fixedCostMonthly?: number;
    fixedCostDaily?: number;
    quarryObCost?: number;
    quarryBlastingCost?: number;
    quarryLtCost?: number;
    plantCost?: number;
    electricalCost?: number;
    loaderCost?: number;
    powerCostPerMt?: number;
    dieselCostPerMt?: number;
  };
  sourceRows: Record<string, number>;
};

export type ReportSnapshot = {
  id: string;
  plantCode: string;
  plantName: string;
  version: string;
  status: "LOCKED";
  period: {
    start: string;
    end: string;
  };
  source: {
    fileName: string;
    checksum: string;
    importedAt: string;
  };
  daily: DailySnapshot[];
  totals: {
    targetMt: number;
    productionMt: number;
    dispatchMt: number;
    achievementPct: number;
    dispatchToProductionPct: number;
    avgJawTph: number;
    avgConeTph: number;
    avgVsiTph: number;
    avgUnitsPerMt: number;
    dieselLitres: number;
    loaderLitresPerMt: number;
    plantRunningHours: number;
    stoppageHours: number;
  };
  commentary: {
    summary: string;
    actionPoints: string[];
  };
  validation: ValidationResult;
  createdAt: string;
};
