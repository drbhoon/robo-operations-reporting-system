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
  };
  machine: {
    jawHours: number;
    coneHours: number;
    vsiHours: number;
    jawTph: number;
    coneTph: number;
    vsiTph: number;
  };
  plantHours: {
    scheduledHours: number;
    nonProductiveHours: number;
    productionHours: number;
    lossHours: number;
    idleHours: number;
    breakdownHours: number;
    lossBreakdown: Record<string, number>;
  };
  electrical: {
    kwh: number;
    kvah: number;
    powerFactor: number;
    maxDemand: number;
    unitsPerMt: number;
    lightingUnits: number;
  };
  loader: {
    dispatchMt: number;
    stockToCustomerMt: number;
    hours: number;
    tph: number;
    dieselLitres: number;
    litresPerHour: number;
    litresPerMt: number;
  };
  cop?: {
    costPerMt?: number;
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
