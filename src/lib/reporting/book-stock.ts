import { CAPTURE_PRODUCTS, type CaptureProductName } from "../capture/types";
import type { DailySnapshot } from "./types";

export const BOOK_STOCK_PRODUCTS = CAPTURE_PRODUCTS;

export type BookStockReportRow = {
  date: string;
  opening: Record<CaptureProductName, number>;
  rawMaterialAfterFinesMt: number;
  ratios: Record<CaptureProductName, number>;
  production: Record<CaptureProductName, number>;
  dispatch: Record<CaptureProductName, number>;
  dispatchTotalMt: number;
  naturalFinesMt: number;
  closing: Record<CaptureProductName, number>;
};

function productValues(
  values: Array<{ name: string; mt: number; ratio?: number }> | undefined,
  field: "mt" | "ratio" = "mt",
) {
  return Object.fromEntries(BOOK_STOCK_PRODUCTS.map((product) => {
    const value = values?.find((item) => item.name === product)?.[field] ?? 0;
    return [product, Number.isFinite(value) ? value : 0];
  })) as Record<CaptureProductName, number>;
}

export function buildBookStockReportRows(days: DailySnapshot[]): BookStockReportRow[] {
  return [...days].sort((a, b) => a.date.localeCompare(b.date)).map((day) => {
    const naturalFinesMt = day.dispatch.products.find((product) => product.name === "Natural Fines")?.mt ?? 0;
    return {
      date: day.date,
      opening: productValues(day.stock.bookOpening ?? day.stock.opening),
      rawMaterialAfterFinesMt: day.production.rawMaterialMt ?? day.production.mt,
      ratios: productValues(day.production.products, "ratio"),
      production: productValues(day.production.products),
      dispatch: productValues(day.dispatch.products),
      dispatchTotalMt: day.dispatch.totalMt,
      naturalFinesMt,
      closing: productValues(day.stock.bookClosing ?? day.stock.closing),
    };
  });
}
