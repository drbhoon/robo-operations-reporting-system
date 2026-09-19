import type { DailySnapshot } from "./types";

export type CopTotals = {
  drillingBlasting: number;
  electricity: number;
  fixed: number;
  internalTransport: number;
  intercarting: number;
  loaderDiesel: number;
  overburden: number;
  plantMaintenance: number;
  rawMaterial: number;
  rentPlant: number;
  spares: number;
  wearParts: number;
};

function weekStart(date: string) {
  const day = new Date(`${date}T00:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() || 7) + 1);
  return day.toISOString().slice(0, 10);
}

function manualValues(day: DailySnapshot) {
  const cop = day.cop;
  return [
    cop?.fixedCost ?? cop?.fixedCostMonthly ?? 0,
    cop?.rawMaterialCost ?? 0,
    cop?.rentPlantCost ?? 0,
    cop?.plantMaintenanceCost ?? cop?.plantCost ?? 0,
    cop?.sparesConsumablesCost ?? 0,
    cop?.wearPartsCost ?? 0,
  ];
}

export function weeklyCopEntries(days: DailySnapshot[]) {
  const byWeek = new Map<string, DailySnapshot>();
  for (const day of days) {
    const week = weekStart(day.date);
    if (day.cop?.weeklyEntryDate && weekStart(day.cop.weeklyEntryDate) !== week) continue;
    if (!day.cop?.weeklyEntryDate && !manualValues(day).some((value) => value > 0)) continue;
    const previous = byWeek.get(week);
    if (!previous || (day.cop?.updatedAt ?? day.date) > (previous.cop?.updatedAt ?? previous.date)) {
      byWeek.set(week, day);
    }
  }

  // Older records have no entry marker. Identical values copied into the next week
  // by the old daily carry-forward must not be charged a second time.
  let previousValues: string | null = null;
  let previousExplicit = false;
  let previousMonth: string | null = null;
  let previousWeek: string | null = null;
  return [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([week, day]) => {
    const values = JSON.stringify(manualValues(day));
    const explicit = Boolean(day.cop?.weeklyEntryDate);
    const month = day.date.slice(0, 7);
    const consecutiveWeek = previousWeek !== null &&
      (Date.parse(`${week}T00:00:00.000Z`) - Date.parse(`${previousWeek}T00:00:00.000Z`)) === 7 * 24 * 60 * 60 * 1000;
    const carriedDuplicate = consecutiveWeek && month === previousMonth && values === previousValues && (!explicit || !previousExplicit);
    previousValues = values;
    previousExplicit = explicit;
    previousMonth = month;
    previousWeek = week;
    return carriedDuplicate || !manualValues(day).some((value) => value > 0) ? [] : [day];
  });
}

export function buildCopTotals(days: DailySnapshot[]): CopTotals {
  const entries = weeklyCopEntries(days);
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  return {
    drillingBlasting: sum(days.map((day) => day.cop?.drillingBlastingCost ?? day.cop?.quarryBlastingCost ?? 0)),
    internalTransport: sum(days.map((day) => day.cop?.internalTransportationCost ?? day.cop?.quarryLtCost ?? 0)),
    overburden: sum(days.map((day) => day.cop?.overburdenRemovalCost ?? day.cop?.quarryObCost ?? 0)),
    electricity: sum(days.map((day) => day.cop?.electricalCost ?? 0)),
    loaderDiesel: sum(days.map((day) => day.cop?.loaderCost ?? day.loader.dieselCost ?? 0)),
    intercarting: sum(days.map((day) => day.cop?.intercartingExpenses ?? 0)),
    rawMaterial: sum(entries.map((day) => day.cop?.rawMaterialCost ?? 0)),
    rentPlant: sum(entries.map((day) => day.cop?.rentPlantCost ?? 0)),
    plantMaintenance: sum(entries.map((day) => day.cop?.plantMaintenanceCost ?? day.cop?.plantCost ?? 0)),
    spares: sum(entries.map((day) => day.cop?.sparesConsumablesCost ?? 0)),
    wearParts: sum(entries.map((day) => day.cop?.wearPartsCost ?? 0)),
    fixed: sum(entries.map((day) => day.cop?.fixedCost ?? day.cop?.fixedCostMonthly ?? 0)),
  };
}
