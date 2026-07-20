import type { ProductName, ValidationIssue, ValidationResult } from "../reporting/types";

export type CaptureProductName = Exclude<ProductName, "Natural Fines">;

export const CAPTURE_PRODUCTS: CaptureProductName[] = [
  "R Sand",
  "20 MM",
  "10 MM",
  "P Sand",
  "Plaster Pro",
  "Robo Sand Plus",
  "WMM",
];

export const LOSS_CATEGORIES = [
  "quarryOversizeJams",
  "quarryNoTippers",
  "quarryNoMaterial",
  "quarryBlasting",
  "plantBreakdown",
  "plantOther",
  "plantScheduledMaintenance",
  "plantIdle",
] as const;

export const QUARRY_LOSS_REASONS = [
  "Oversize Jams",
  "No Feed due to Non-Availability of Tippers",
  "No Material Available in Quarry",
  "Blasting",
] as const;

export const PLANT_LOSS_REASONS = [
  "Breakdown Hours",
  "Other Reasons",
  "Scheduled Maintenance",
  "Idle Hours",
] as const;

export const PLANT_CONFIGS = [
  { code: "GIRMAPUR-1", name: "Girmapur-1", electricalMf: 4, aliases: ["GIR-1", "GIR 1"] },
  { code: "GIRMAPUR-2", name: "Girmapur-2", electricalMf: 0.667, aliases: ["GIR-2", "GIR 2"] },
  { code: "KEESARA", name: "Keesara", electricalMf: 2, aliases: ["KEESRA"] },
  { code: "LAKADARAM-1", name: "Lakadaram-1", electricalMf: 500, aliases: ["LAK-1"] },
  { code: "LAKADARAM-2", name: "Lakadaram-2", electricalMf: 1, aliases: ["LAK-2"] },
] as const;

export const PHOTO_CATEGORIES = [
  "stockyard",
  "equipment",
  "breakdown",
  "quality",
  "electricalMeter",
  "loaderDiesel",
] as const;

export type DailyRecordStatus = "DRAFT" | "FINAL";
export type ReviewStatus = "OPEN" | "REVIEW_REQUIRED" | "APPROVED";
export type LossCategory = (typeof LOSS_CATEGORIES)[number];
export type QuarryLossReason = (typeof QUARRY_LOSS_REASONS)[number];
export type PlantLossReason = (typeof PLANT_LOSS_REASONS)[number];
export type LossReason = QuarryLossReason | PlantLossReason;
export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number];

export type MetricByProduct = Record<CaptureProductName, number>;
export type LossByCategory = Record<LossCategory, number>;
export type LossDetailByCategory = Record<LossCategory, { hours: number; comments: string }>;
export type EquipmentKey = "jaw" | "cone" | "vsi";

export type EquipmentMetrics = Record<EquipmentKey, number>;

export type EquipmentHourMeters = Record<
  EquipmentKey,
  {
    opening: number;
    closing: number;
  }
>;

export type PlantConfig = (typeof PLANT_CONFIGS)[number];

export type EvidencePhoto = {
  id: string;
  category: PhotoCategory;
  fileName: string;
  required: boolean;
  uploadedAt: string;
};

export type DailyPlantRecord = {
  id: string;
  plantCode: string;
  plantName: string;
  date: string;
  status: DailyRecordStatus;
  reviewStatus: ReviewStatus;
  targetMt: number;
  productionMt: number;
  productMix: MetricByProduct;
  dispatch: MetricByProduct;
  openingStock: MetricByProduct;
  closingStock: MetricByProduct;
  stockAdjustments: MetricByProduct;
  bookStock: {
    monthlyOpening: MetricByProduct;
    calculatedClosing: MetricByProduct;
  };
  machineHours: EquipmentMetrics;
  equipmentHourMeters: EquipmentHourMeters;
  tph: EquipmentMetrics;
  plantHours: {
    available: number;
    production: number;
    scheduledStoppage: number;
    loss: number;
  };
  lossHours: LossByCategory;
  lossDetails: LossDetailByCategory;
  lossEvent: {
    reason: LossReason | "";
    hours: number;
    comments: string;
  };
  electrical: {
    openingKwh: number;
    closingKwh: number;
    kwhMultiplyingFactor: number;
    openingKvah: number;
    closingKvah: number;
    kvahMultiplyingFactor: number;
    unitsConsumed: number;
    kvahUnitsConsumed: number;
    domesticUnits: number;
    domestic: {
      openingKwh: number;
      closingKwh: number;
      multiplyingFactor: number;
      unitsConsumed: number;
    };
    excludeDomesticFromUnitsPerMt: boolean;
    powerFactor: number;
    cmd: number;
  };
  loader: {
    hours: number;
    hourMeter: {
      opening: number;
      closing: number;
    };
    productionHours: number;
    otherWorksHours: number;
    tph: number;
    dieselLitres: number;
    dieselRate: number;
    dieselCost: number;
    dispatchMt: number;
  };
  cop: {
    fixedCostMonthly: number;
    fixedCostDaily: number;
    fixedCost: number;
    quarryObCost: number;
    quarryBlastingCost: number;
    quarryLtCost: number;
    drillingBlastingCost: number;
    internalTransportationCost: number;
    overburdenRemovalCost: number;
    rawMaterialCost: number;
    rentPlantCost: number;
    plantCost: number;
    plantMaintenanceCost: number;
    electricalCost: number;
    loaderCost: number;
    sparesConsumablesCost: number;
    wearPartsCost: number;
    intercartingExpenses: number;
    powerCost: number;
    dieselCost: number;
    consumablesCost: number;
    maintenanceCost: number;
  };
  remarks: string;
  evidencePhotos: EvidencePhoto[];
  calculations: {
    productMixTotal: number;
    dispatchTotal: number;
    calculatedClosingStock: MetricByProduct;
    calculatedBookStock: MetricByProduct;
    equipmentRunningHours: EquipmentMetrics;
    equipmentTph: EquipmentMetrics;
    electricalUnitsConsumed: number;
    kvahUnitsConsumed: number;
    productionPowerUnits: number;
    domesticPowerUnits: number;
    combinedPowerUnits: number;
    unitsPerMt: number;
    domesticUnitsPerMt: number;
    combinedUnitsPerMt: number;
    powerFactor: number;
    loaderRunningHours: number;
    loaderProductionHours: number;
    loaderTph: number;
    loaderDieselCost: number;
    electricalCost: number;
    fixedCostDaily: number;
    totalCopCost: number;
    loaderLitresPerMt: number;
    copPerMt: number;
    achievementPct: number;
  };
  validation: ValidationResult;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  submittedBy?: string;
};

export type CapturePayload = Omit<
  DailyPlantRecord,
  "id" | "status" | "reviewStatus" | "calculations" | "validation" | "createdAt" | "updatedAt" | "submittedAt"
> & {
  id?: string;
};

export type AuditEntry = {
  id: string;
  recordId: string;
  action: "DRAFT_SAVED" | "FINAL_SUBMITTED" | "FINAL_EDITED";
  actor: string;
  summary: string;
  before?: DailyPlantRecord;
  after: DailyPlantRecord;
  createdAt: string;
};

export type CaptureValidationResult = ValidationResult & {
  requiredPhotoCategories: PhotoCategory[];
  exceptionWarnings: ValidationIssue[];
};
