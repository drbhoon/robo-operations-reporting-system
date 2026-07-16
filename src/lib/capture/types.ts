import type { ProductName, ValidationIssue, ValidationResult } from "../reporting/types";

export type CaptureProductName = Exclude<ProductName, "Natural Fines">;

export const CAPTURE_PRODUCTS: CaptureProductName[] = [
  "R Sand",
  "20 MM",
  "10 MM",
  "P Sand",
  "Plaster Pro",
  "WMM",
];

export const LOSS_CATEGORIES = [
  "local",
  "preventive",
  "scheduled",
  "shiftChange",
  "lunchDinner",
  "idle",
  "breakdown",
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
export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number];

export type MetricByProduct = Record<CaptureProductName, number>;
export type LossByCategory = Record<LossCategory, number>;

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
  machineHours: {
    jaw: number;
    cone: number;
    vsi: number;
  };
  tph: {
    jaw: number;
    cone: number;
    vsi: number;
  };
  plantHours: {
    available: number;
    production: number;
    scheduledStoppage: number;
    loss: number;
  };
  lossHours: LossByCategory;
  electrical: {
    openingKwh: number;
    closingKwh: number;
    unitsConsumed: number;
    powerFactor: number;
  };
  loader: {
    hours: number;
    dieselLitres: number;
    dispatchMt: number;
  };
  cop: {
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
    unitsPerMt: number;
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
