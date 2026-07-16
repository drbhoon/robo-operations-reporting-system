import crypto from "node:crypto";
import readWorkbook, { type SheetData } from "read-excel-file/node";
import type { DailySnapshot, ProductName, ReportSnapshot } from "./types";
import { buildTotals, round, safeNumber } from "./calculations";
import { validateDailySnapshots } from "./validation";
import { generateManagementCommentary } from "./commentary";

const REQUIRED_SHEETS = [
  "Book stock",
  "Traget",
  "Hours meter",
  "Plant report ",
  "Electrical Readings",
  "Loader -1",
] as const;

const PRODUCTS: Array<[ProductName, number]> = [
  ["R Sand", 24],
  ["20 MM", 25],
  ["10 MM", 26],
  ["P Sand", 27],
  ["Plaster Pro", 28],
  ["WMM", 29],
];

const DISPATCH_PRODUCTS: Array<[ProductName, number]> = [
  ["R Sand", 30],
  ["20 MM", 31],
  ["10 MM", 32],
  ["P Sand", 33],
  ["WMM", 34],
  ["Plaster Pro", 35],
];

const OPENING_STOCK: Array<[ProductName, number]> = [
  ["R Sand", 2],
  ["20 MM", 3],
  ["10 MM", 4],
  ["P Sand", 5],
  ["Plaster Pro", 6],
  ["WMM", 7],
  ["Natural Fines", 8],
];

const CLOSING_STOCK: Array<[ProductName, number]> = [
  ["R Sand", 38],
  ["20 MM", 39],
  ["10 MM", 40],
  ["P Sand", 41],
  ["Plaster Pro", 45],
  ["WMM", 43],
  ["Natural Fines", 44],
];

export async function parseGirWorkbook(
  input: Buffer | ArrayBuffer,
  fileName: string,
): Promise<ReportSnapshot> {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const sheets = await readWorkbook(buffer);
  const workbook = new Map(sheets.map((sheet) => [sheet.sheet, sheet.data]));

  for (const sheetName of REQUIRED_SHEETS) {
    if (!workbook.has(sheetName)) {
      throw new Error(`Missing required sheet: ${sheetName}`);
    }
  }

  const book = workbook.get("Book stock")!;
  const target = workbook.get("Traget")!;
  const hours = workbook.get("Hours meter")!;
  const plant = workbook.get("Plant report ")!;
  const electrical = workbook.get("Electrical Readings")!;
  const loader = workbook.get("Loader -1")!;

  const plantCode = text(book, 2, 2) || "GIR-1";
  const daily: DailySnapshot[] = [];

  for (let index = 0; index < 31; index += 1) {
    const bookRow = 6 + index;
    const date = isoDate(value(book, bookRow, 1));
    if (!date) continue;

    const targetRow = 2 + index;
    const hoursRow = 3 + index;
    const plantRow = 6 + index;
    const electricalRow = 3 + index;
    const loaderRow = 2 + index;
    const productionProducts = PRODUCTS.map(([name, col]) => ({ name, mt: round(number(book, bookRow, col)) }));
    const productionMt =
      productionProducts.reduce((total, product) => total + product.mt, 0) ||
      number(book, bookRow, 16) ||
      number(book, bookRow, 13) ||
      number(loader, loaderRow, 2);

    daily.push({
      date,
      label: date.slice(8, 10),
      targetMt: number(target, targetRow, 2),
      production: {
        mt: round(productionMt),
        rawMaterialMt: round(number(book, bookRow, 16) || number(book, bookRow, 13)),
        products: productionProducts,
      },
      dispatch: {
        totalMt: round(number(book, bookRow, 36) || number(loader, loaderRow, 5)),
        products: DISPATCH_PRODUCTS.map(([name, col]) => ({ name, mt: round(number(book, bookRow, col)) })),
      },
      stock: {
        opening: OPENING_STOCK.map(([name, col]) => ({ name, mt: round(number(book, bookRow, col)) })),
        closing: CLOSING_STOCK.map(([name, col]) => ({ name, mt: round(number(book, bookRow, col)) })),
      },
      machine: {
        jawHours: round(number(hours, hoursRow, 4), 2),
        coneHours: round(number(hours, hoursRow, 7), 2),
        vsiHours: round(number(hours, hoursRow, 13), 2),
        jawTph: round(number(hours, hoursRow, 16), 2),
        coneTph: round(number(hours, hoursRow, 17), 2),
        vsiTph: round(number(hours, hoursRow, 18), 2),
      },
      plantHours: {
        scheduledHours: round(hoursNumber(value(plant, plantRow, 2)), 2),
        nonProductiveHours: round(hoursNumber(value(plant, plantRow, 10)), 2),
        productionHours: round(hoursNumber(value(plant, plantRow, 14)), 2),
        lossHours: round(hoursNumber(value(plant, plantRow, 15)), 2),
        idleHours: round(hoursNumber(value(plant, plantRow, 16)), 2),
        breakdownHours: round(hoursNumber(value(plant, plantRow, 17)), 2),
        lossBreakdown: {
          local: round(hoursNumber(value(plant, plantRow, 4)), 2),
          preventive: round(hoursNumber(value(plant, plantRow, 5)), 2),
          scheduled: round(hoursNumber(value(plant, plantRow, 6)), 2),
          shiftChange: round(hoursNumber(value(plant, plantRow, 7)), 2),
          lunchDinner: round(hoursNumber(value(plant, plantRow, 8)), 2),
          idle: round(hoursNumber(value(plant, plantRow, 16)), 2),
          breakdown: round(hoursNumber(value(plant, plantRow, 17)), 2),
        },
      },
      electrical: {
        kwh: round(number(electrical, electricalRow, 4)),
        kvah: round(number(electrical, electricalRow, 7)),
        powerFactor: round(number(electrical, electricalRow, 8), 4),
        maxDemand: round(number(electrical, electricalRow, 10)),
        unitsPerMt: round(number(electrical, electricalRow, 12), 3),
        lightingUnits: round(number(electrical, electricalRow, 19)),
      },
      loader: {
        dispatchMt: round(number(loader, loaderRow, 5)),
        stockToCustomerMt: round(number(loader, loaderRow, 7)),
        hours: round(number(loader, loaderRow, 10), 2),
        tph: round(number(loader, loaderRow, 13), 2),
        dieselLitres: round(number(loader, loaderRow, 14)),
        litresPerHour: round(number(loader, loaderRow, 15), 2),
        litresPerMt: round(number(loader, loaderRow, 16), 3),
      },
      sourceRows: {
        bookStock: bookRow,
        target: targetRow,
        hoursMeter: hoursRow,
        plantReport: plantRow,
        electricalReadings: electricalRow,
        loader: loaderRow,
      },
    });
  }

  const period = {
    start: daily[0]?.date ?? "",
    end: daily[daily.length - 1]?.date ?? "",
  };
  const totals = buildTotals(daily);
  const validation = validateDailySnapshots(daily);
  const now = new Date().toISOString();
  const base = {
    id: snapshotId(plantCode, period.start, period.end, buffer),
    plantCode,
    plantName: plantCode.replace("-", " "),
    version: `${plantCode}-${period.start}-${period.end}-${checksum(buffer).slice(0, 8)}`,
    status: "LOCKED" as const,
    period,
    source: {
      fileName,
      checksum: checksum(buffer),
      importedAt: now,
    },
    daily,
    totals,
    validation,
    createdAt: now,
  };

  return {
    ...base,
    commentary: await generateManagementCommentary(base),
  };
}

function value(sheet: SheetData, row: number, col: number) {
  return sheet[row - 1]?.[col - 1] ?? null;
}

function number(sheet: SheetData, row: number, col: number) {
  return safeNumber(value(sheet, row, col));
}

function text(sheet: SheetData, row: number, col: number) {
  const cellValue = value(sheet, row, col);
  return typeof cellValue === "string" ? cellValue.trim() : String(cellValue ?? "").trim();
}

function isoDate(raw: unknown) {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  if (typeof raw === "string") {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  if (typeof raw === "number" && raw > 25569) {
    const date = new Date((raw - 25569) * 86400 * 1000);
    return date.toISOString().slice(0, 10);
  }
  return "";
}

function hoursNumber(raw: unknown) {
  if (typeof raw === "number") {
    if (raw > 0 && raw <= 2) return raw * 24;
    return raw;
  }
  if (raw instanceof Date) {
    return raw.getUTCHours() + raw.getUTCMinutes() / 60 + raw.getUTCSeconds() / 3600;
  }
  if (typeof raw === "string") {
    const normalized = raw.replace(";", ":").trim();
    const match = normalized.match(/(?:(\d+)\s*day[s]?,\s*)?(\d{1,2}):(\d{2})/i);
    if (match) {
      return safeNumber(match[1]) * 24 + safeNumber(match[2]) + safeNumber(match[3]) / 60;
    }
  }
  return 0;
}

function checksum(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function snapshotId(plantCode: string, start: string, end: string, buffer: Buffer) {
  return crypto
    .createHash("sha1")
    .update(`${plantCode}:${start}:${end}:${checksum(buffer)}`)
    .digest("hex")
    .slice(0, 24);
}
