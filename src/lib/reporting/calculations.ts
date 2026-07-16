import type { DailySnapshot, ReportSnapshot } from "./types";

export function sum(values: number[]) {
  return values.reduce((total, value) => total + safeNumber(value), 0);
}

export function average(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value) && value > 0);
  return valid.length ? sum(valid) / valid.length : 0;
}

export function ratio(numerator: number, denominator: number) {
  return denominator ? numerator / denominator : 0;
}

export function round(value: number, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function safeNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function buildTotals(days: DailySnapshot[]): ReportSnapshot["totals"] {
  const targetMt = sum(days.map((day) => day.targetMt));
  const productionMt = sum(days.map((day) => day.production.mt));
  const dispatchMt = sum(days.map((day) => day.dispatch.totalMt));
  const dieselLitres = sum(days.map((day) => day.loader.dieselLitres));

  return {
    targetMt: round(targetMt),
    productionMt: round(productionMt),
    dispatchMt: round(dispatchMt),
    achievementPct: round(ratio(productionMt, targetMt) * 100),
    dispatchToProductionPct: round(ratio(dispatchMt, productionMt) * 100),
    avgJawTph: round(average(days.map((day) => day.machine.jawTph))),
    avgConeTph: round(average(days.map((day) => day.machine.coneTph))),
    avgVsiTph: round(average(days.map((day) => day.machine.vsiTph))),
    avgUnitsPerMt: round(average(days.map((day) => day.electrical.unitsPerMt))),
    dieselLitres: round(dieselLitres),
    loaderLitresPerMt: round(ratio(dieselLitres, sum(days.map((day) => day.loader.stockToCustomerMt))), 3),
    plantRunningHours: round(sum(days.map((day) => day.plantHours.productionHours))),
    stoppageHours: round(sum(days.map((day) => day.plantHours.lossHours))),
  };
}

export function inrNumber(value: number) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 1,
  }).format(value);
}
