import type {
  CaptureValidationResult,
  DailyPlantRecord,
  PhotoCategory,
} from "./types";
import { CAPTURE_PRODUCTS, LOSS_CATEGORIES } from "./types";
import { round, sum } from "../reporting/calculations";
import type { ValidationIssue } from "../reporting/types";

export function validateCaptureRecord(record: DailyPlantRecord): CaptureValidationResult {
  const issues: ValidationIssue[] = [];
  const requiredPhotoCategories = requiredPhotos(record);
  const productMixTotal = record.calculations.productMixTotal;
  const dispatchTotal = record.calculations.dispatchTotal;
  const lossCategoryTotal = sum(LOSS_CATEGORIES.map((category) => record.lossHours[category]));
  const expectedUnits = record.calculations.electricalUnitsConsumed;
  const expectedKvahUnits = record.calculations.kvahUnitsConsumed;

  requireText(issues, record.date, "plantCode", record.plantCode, "Plant is mandatory.");
  requireText(issues, record.date, "date", record.date, "Date is mandatory.");
  requirePositive(issues, record.date, "targetMt", record.targetMt);
  requirePositive(issues, record.date, "productionMt", record.productionMt);
  requireNonNegative(issues, record.date, "plantHours.available", record.plantHours.available);
  requireNonNegative(issues, record.date, "plantHours.production", record.plantHours.production);
  requireNonNegative(issues, record.date, "plantHours.scheduledStoppage", record.plantHours.scheduledStoppage);
  requireNonNegative(issues, record.date, "plantHours.loss", record.plantHours.loss);

  for (const product of CAPTURE_PRODUCTS) {
    requireNonNegative(issues, record.date, `productMix.${product}`, record.productMix[product]);
    requireNonNegative(issues, record.date, `dispatch.${product}`, record.dispatch[product]);
    requireNonNegative(issues, record.date, `openingStock.${product}`, record.openingStock[product]);
    requireNonNegative(issues, record.date, `closingStock.${product}`, record.closingStock[product]);
    requireNonNegative(issues, record.date, `stockAdjustments.${product}`, record.stockAdjustments[product]);
    requireNonNegative(issues, record.date, `bookStock.monthlyOpening.${product}`, record.bookStock.monthlyOpening[product]);
    requireNonNegative(issues, record.date, `bookStock.calculatedClosing.${product}`, record.bookStock.calculatedClosing[product]);

    const expectedClosing = record.calculations.calculatedClosingStock[product];
    if (Math.abs(record.closingStock[product] - expectedClosing) > 1) {
      issues.push({
        severity: "ERROR",
        code: "STOCK_RECONCILIATION",
        date: record.date,
        field: `closingStock.${product}`,
        message: `${product} closing stock should be ${round(expectedClosing)} MT based on opening + production - dispatch + stock adjustment.`,
      });
    }

    const expectedBookClosing = record.calculations.calculatedBookStock[product];
    if (Math.abs(record.bookStock.calculatedClosing[product] - expectedBookClosing) > 1) {
      issues.push({
        severity: "ERROR",
        code: "BOOK_STOCK_RECONCILIATION",
        date: record.date,
        field: `bookStock.calculatedClosing.${product}`,
        message: `${product} book stock should be ${round(expectedBookClosing)} MT based on monthly opening book stock, production, dispatch and stock movements.`,
      });
    }
  }

  for (const [field, value] of Object.entries(record.machineHours)) {
    requireNonNegative(issues, record.date, `machineHours.${field}`, value);
    const expectedHours = record.calculations.equipmentRunningHours[field as keyof typeof record.machineHours];
    if (Math.abs(value - expectedHours) > 0.25) {
      issues.push({
        severity: "ERROR",
        code: "EQUIPMENT_HOURS_RECONCILIATION",
        date: record.date,
        field: `machineHours.${field}`,
        message: `${field.toUpperCase()} running hours should be ${round(expectedHours, 2)} based on closing - opening hour meter reading.`,
      });
    }
    if (record.plantHours.available > 0 && value > record.plantHours.available + 0.25) {
      issues.push({
        severity: "ERROR",
        code: "MACHINE_HOURS_EXCEED_AVAILABLE",
        date: record.date,
        field: `machineHours.${field}`,
        message: `${field.toUpperCase()} machine hours cannot exceed available plant hours.`,
      });
    }
  }

  for (const [field, value] of Object.entries(record.tph)) {
    requireNonNegative(issues, record.date, `tph.${field}`, value);
    const expectedTph = record.calculations.equipmentTph[field as keyof typeof record.tph];
    if (Math.abs(value - expectedTph) > 0.25) {
      issues.push({
        severity: "ERROR",
        code: "EQUIPMENT_TPH_RECONCILIATION",
        date: record.date,
        field: `tph.${field}`,
        message: `${field.toUpperCase()} TPH should be ${round(expectedTph, 2)} based on product mix and running hours.`,
      });
    }
  }

  for (const [equipment, readings] of Object.entries(record.equipmentHourMeters)) {
    requireNonNegative(issues, record.date, `equipmentHourMeters.${equipment}.opening`, readings.opening);
    requireNonNegative(issues, record.date, `equipmentHourMeters.${equipment}.closing`, readings.closing);
    if (readings.closing < readings.opening) {
      issues.push({
        severity: "ERROR",
        code: "EQUIPMENT_CLOSING_BELOW_OPENING",
        date: record.date,
        field: `equipmentHourMeters.${equipment}.closing`,
        message: `${equipment.toUpperCase()} closing hour meter cannot be below opening hour meter.`,
      });
    }
  }

  for (const category of LOSS_CATEGORIES) {
    requireNonNegative(issues, record.date, `lossHours.${category}`, record.lossHours[category]);
  }

  if (Math.abs(record.productionMt - productMixTotal) > 1) {
    issues.push({
      severity: "ERROR",
      code: "PRODUCTION_PRODUCT_MIX_RECONCILIATION",
      date: record.date,
      field: "productionMt",
      message: `Production ${round(record.productionMt)} MT must equal product mix total ${round(productMixTotal)} MT.`,
    });
  }

  if (Math.abs(record.plantHours.loss - lossCategoryTotal) > 0.25) {
    issues.push({
      severity: "ERROR",
      code: "LOSS_HOURS_RECONCILIATION",
      date: record.date,
      field: "lossHours",
      message: `Loss hours ${round(record.plantHours.loss)} must equal category total ${round(lossCategoryTotal)}.`,
    });
  }

  const reconciledPlantHours =
    record.plantHours.production +
    record.plantHours.scheduledStoppage +
    record.plantHours.loss;
  if (Math.abs(record.plantHours.available - reconciledPlantHours) > 0.25) {
    issues.push({
      severity: "ERROR",
      code: "PLANT_HOURS_RECONCILIATION",
      date: record.date,
      field: "plantHours.available",
      message: `Available hours ${round(record.plantHours.available)} must equal production + scheduled stoppage + loss hours ${round(reconciledPlantHours)}.`,
    });
  }

  if (Math.abs(record.electrical.unitsConsumed - expectedUnits) > 1) {
    issues.push({
      severity: "ERROR",
      code: "ELECTRICAL_UNITS_RECONCILIATION",
      date: record.date,
      field: "electrical.unitsConsumed",
      message: `Units consumed should be ${round(expectedUnits)} based on opening/closing KWH readings and multiplying factor.`,
    });
  }

  if (Math.abs(record.electrical.kvahUnitsConsumed - expectedKvahUnits) > 1) {
    issues.push({
      severity: "ERROR",
      code: "KVAH_UNITS_RECONCILIATION",
      date: record.date,
      field: "electrical.kvahUnitsConsumed",
      message: `KVAH units consumed should be ${round(expectedKvahUnits)} based on opening/closing KVAH readings and multiplying factor.`,
    });
  }

  requireNonNegative(issues, record.date, "electrical.kwhMultiplyingFactor", record.electrical.kwhMultiplyingFactor);
  requireNonNegative(issues, record.date, "electrical.kvahMultiplyingFactor", record.electrical.kvahMultiplyingFactor);
  requireNonNegative(issues, record.date, "electrical.domesticUnits", record.electrical.domesticUnits);
  requireNonNegative(issues, record.date, "electrical.cmd", record.electrical.cmd);

  if (record.electrical.powerFactor <= 0 || record.electrical.powerFactor > 1.05) {
    issues.push({
      severity: "WARNING",
      code: "POWER_FACTOR_OUT_OF_RANGE",
      date: record.date,
      field: "electrical.powerFactor",
      message: "Power factor is outside the expected operating range.",
    });
  }

  if (dispatchTotal > record.productionMt * 1.25 && record.productionMt > 0) {
    issues.push({
      severity: "WARNING",
      code: "DISPATCH_ABOVE_PRODUCTION",
      date: record.date,
      field: "dispatch",
      message: "Dispatch is materially higher than production; confirm stock drawdown is intentional.",
    });
  }

  if (record.calculations.achievementPct < 80) {
    issues.push({
      severity: "WARNING",
      code: "LOW_TARGET_ACHIEVEMENT",
      date: record.date,
      field: "productionMt",
      message: "Production is below 80% of target and requires management remarks.",
    });
  }

  if (record.calculations.unitsPerMt > 5) {
    issues.push({
      severity: "WARNING",
      code: "HIGH_UNITS_PER_MT",
      date: record.date,
      field: "electrical.unitsPerMt",
      message: "Units/MT is above the configured review threshold.",
    });
  }

  if (record.calculations.loaderLitresPerMt > 0.12) {
    issues.push({
      severity: "WARNING",
      code: "HIGH_LOADER_DIESEL",
      date: record.date,
      field: "loader.litresPerMt",
      message: "Loader litres/MT is above the configured review threshold.",
    });
  }

  const hasDeviation = issues.some((issue) => issue.severity === "WARNING");
  if (hasDeviation && record.remarks.trim().length < 12) {
    issues.push({
      severity: "ERROR",
      code: "REMARKS_REQUIRED",
      date: record.date,
      field: "remarks",
      message: "Major deviations require a meaningful remark before final submission.",
    });
  }

  for (const category of requiredPhotoCategories) {
    const uploaded = record.evidencePhotos.some((photo) => photo.category === category && photo.fileName);
    if (!uploaded) {
      issues.push({
        severity: "ERROR",
        code: "PHOTO_EVIDENCE_REQUIRED",
        date: record.date,
        field: `evidencePhotos.${category}`,
        message: `${category} photo evidence is required for this exception.`,
      });
    }
  }

  return {
    valid: !issues.some((issue) => issue.severity === "ERROR"),
    issues,
    requiredPhotoCategories,
    exceptionWarnings: issues.filter((issue) => issue.severity === "WARNING"),
  };
}

function requiredPhotos(record: DailyPlantRecord): PhotoCategory[] {
  const categories = new Set<PhotoCategory>();
  if (record.calculations.achievementPct < 80) categories.add("equipment");
  if (record.plantHours.loss >= 4 || record.lossHours.breakdown > 0) categories.add("breakdown");
  if (record.calculations.unitsPerMt > 5) categories.add("electricalMeter");
  if (record.calculations.loaderLitresPerMt > 0.12) categories.add("loaderDiesel");
  return [...categories];
}

function requireText(
  issues: ValidationIssue[],
  date: string,
  field: string,
  value: string,
  message: string,
) {
  if (value.trim()) return;
  issues.push({ severity: "ERROR", code: "MANDATORY_FIELD", date, field, message });
}

function requirePositive(issues: ValidationIssue[], date: string, field: string, value: number) {
  if (value > 0) return;
  issues.push({
    severity: "ERROR",
    code: "MANDATORY_POSITIVE_VALUE",
    date,
    field,
    message: `${field} must be greater than zero.`,
  });
}

function requireNonNegative(issues: ValidationIssue[], date: string, field: string, value: number) {
  if (value >= 0) return;
  issues.push({
    severity: "ERROR",
    code: "NEGATIVE_VALUE",
    date,
    field,
    message: `${field} cannot be negative.`,
  });
}
