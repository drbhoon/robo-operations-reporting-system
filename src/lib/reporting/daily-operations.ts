import type { DailySnapshot } from "./types";

export type DailyOperationsCumulative = {
  targetMt: number;
  productionMt: number;
  dispatchMt: number;
  jawTph: number;
  vsiTph: number;
  runHours: number;
  lossHours: number;
  electricityUnits: number;
  unitsPerMt: number;
  loaderLitresPerMt: number;
};

export function dailyElectricityUnits(day: DailySnapshot) {
  return day.electrical.productionUnits ?? day.electrical.kvah ?? 0;
}

export function buildDailyOperationsCumulative(days: DailySnapshot[]): DailyOperationsCumulative {
  const sum = (values: number[]) => values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
  const productionMt = sum(days.map((day) => day.production.mt));
  const dispatchMt = sum(days.map((day) => day.dispatch.totalMt));
  const jawHours = sum(days.map((day) => day.machine.jawHours));
  const vsiHours = sum(days.map((day) => day.machine.vsiHours));
  const electricityUnits = sum(days.map(dailyElectricityUnits));
  const loaderDispatchMt = sum(days.map((day) => day.loader.dispatchMt));
  const loaderDieselLitres = sum(days.map((day) => day.loader.dieselLitres));

  return {
    targetMt: sum(days.map((day) => day.targetMt)),
    productionMt,
    dispatchMt,
    jawTph: jawHours ? productionMt / jawHours : 0,
    vsiTph: vsiHours ? productionMt / vsiHours : 0,
    runHours: sum(days.map((day) => day.plantHours.productionHours)),
    lossHours: sum(days.map((day) => day.plantHours.lossHours)),
    electricityUnits,
    unitsPerMt: productionMt ? electricityUnits / productionMt : 0,
    loaderLitresPerMt: loaderDispatchMt ? loaderDieselLitres / loaderDispatchMt : 0,
  };
}
