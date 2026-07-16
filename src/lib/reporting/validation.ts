import type { DailySnapshot, ValidationIssue, ValidationResult } from "./types";
import { round, sum } from "./calculations";

export function validateDailySnapshots(days: DailySnapshot[]): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!days.length) {
    issues.push({
      severity: "ERROR",
      code: "NO_DAILY_ROWS",
      message: "No dated daily rows were extracted from the workbook.",
    });
  }

  for (const day of days) {
    assertNonNegative(issues, day.date, "targetMt", day.targetMt);
    assertNonNegative(issues, day.date, "production.mt", day.production.mt);
    assertNonNegative(issues, day.date, "production.rawMaterialMt", day.production.rawMaterialMt);
    assertNonNegative(issues, day.date, "dispatch.totalMt", day.dispatch.totalMt);
    assertNonNegative(issues, day.date, "machine.jawHours", day.machine.jawHours);
    assertNonNegative(issues, day.date, "machine.coneHours", day.machine.coneHours);
    assertNonNegative(issues, day.date, "machine.vsiHours", day.machine.vsiHours);
    assertNonNegative(issues, day.date, "machine.jawTph", day.machine.jawTph);
    assertNonNegative(issues, day.date, "machine.coneTph", day.machine.coneTph);
    assertNonNegative(issues, day.date, "machine.vsiTph", day.machine.vsiTph);
    assertNonNegative(issues, day.date, "plantHours.productionHours", day.plantHours.productionHours);
    assertNonNegative(issues, day.date, "plantHours.lossHours", day.plantHours.lossHours);
    assertNonNegative(issues, day.date, "plantHours.idleHours", day.plantHours.idleHours);
    assertNonNegative(issues, day.date, "plantHours.breakdownHours", day.plantHours.breakdownHours);
    assertNonNegative(issues, day.date, "electrical.kwh", day.electrical.kwh);
    assertNonNegative(issues, day.date, "electrical.kvah", day.electrical.kvah);
    assertNonNegative(issues, day.date, "electrical.maxDemand", day.electrical.maxDemand);
    assertNonNegative(issues, day.date, "electrical.unitsPerMt", day.electrical.unitsPerMt);
    assertNonNegative(issues, day.date, "electrical.lightingUnits", day.electrical.lightingUnits);
    assertNonNegative(issues, day.date, "loader.hours", day.loader.hours);
    assertNonNegative(issues, day.date, "loader.tph", day.loader.tph);
    assertNonNegative(issues, day.date, "loader.dieselLitres", day.loader.dieselLitres);
    assertNonNegative(issues, day.date, "loader.litresPerHour", day.loader.litresPerHour);
    assertNonNegative(issues, day.date, "loader.litresPerMt", day.loader.litresPerMt);

    for (const product of [...day.production.products, ...day.dispatch.products]) {
      assertNonNegative(issues, day.date, `${product.name}.mt`, product.mt);
    }

    for (const product of [...day.stock.opening, ...day.stock.closing]) {
      assertNonNegative(issues, day.date, `stock.${product.name}.mt`, product.mt);
    }

    const productTotal = sum(day.production.products.map((product) => product.mt));
    if (day.production.mt > 0 && Math.abs(productTotal - day.production.mt) > Math.max(2, day.production.mt * 0.03)) {
      issues.push({
        severity: "WARNING",
        code: "PRODUCT_MIX_RECONCILIATION",
        date: day.date,
        field: "production.products",
        message: `Product mix total ${round(productTotal)} MT does not reconcile to production ${round(day.production.mt)} MT.`,
      });
    }

    const dispatchMixTotal = sum(day.dispatch.products.map((product) => product.mt));
    if (Math.abs(dispatchMixTotal - day.dispatch.totalMt) > 1) {
      issues.push({
        severity: "WARNING",
        code: "DISPATCH_MIX_RECONCILIATION",
        date: day.date,
        field: "dispatch.products",
        message: `Dispatch mix total ${round(dispatchMixTotal)} MT does not reconcile to dispatch ${round(day.dispatch.totalMt)} MT.`,
      });
    }

    if (day.production.mt > 0 && day.machine.jawTph <= 0) {
      issues.push({
        severity: "WARNING",
        code: "MISSING_JAW_TPH",
        date: day.date,
        field: "machine.jawTph",
        message: "Production exists but Jaw TPH is missing or zero.",
      });
    }

    if (day.electrical.unitsPerMt > 8) {
      issues.push({
        severity: "WARNING",
        code: "HIGH_UNITS_PER_MT",
        date: day.date,
        field: "electrical.unitsPerMt",
        message: `Units/MT is ${round(day.electrical.unitsPerMt)}, which is above the configured review threshold.`,
      });
    }

    if (day.electrical.powerFactor < 0 || day.electrical.powerFactor > 1.05) {
      issues.push({
        severity: "WARNING",
        code: "POWER_FACTOR_OUT_OF_RANGE",
        date: day.date,
        field: "electrical.powerFactor",
        message: `Power factor is ${round(day.electrical.powerFactor, 4)}, which is outside the expected range.`,
      });
    }

    const accountedHours = day.plantHours.nonProductiveHours + day.plantHours.productionHours + day.plantHours.lossHours;
    if (day.plantHours.scheduledHours > 0 && accountedHours > day.plantHours.scheduledHours + 0.25) {
      issues.push({
        severity: "WARNING",
        code: "PLANT_HOURS_OVERBOOKED",
        date: day.date,
        field: "plantHours",
        message: `Scheduled hours are ${round(day.plantHours.scheduledHours)} but accounted hours are ${round(accountedHours)}.`,
      });
    }
  }

  return {
    valid: !issues.some((issue) => issue.severity === "ERROR"),
    issues,
  };
}

function assertNonNegative(
  issues: ValidationIssue[],
  date: string,
  field: string,
  value: number,
) {
  if (value >= 0) return;

  issues.push({
    severity: "ERROR",
    code: "NEGATIVE_OPERATIONAL_READING",
    date,
    field,
    message: `${field} is ${round(value)} and must be non-negative before report generation.`,
  });
}
