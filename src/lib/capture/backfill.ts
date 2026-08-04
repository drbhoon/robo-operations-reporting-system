import readWorkbook from "read-excel-file/node";
import {
  CAPTURE_PRODUCTS,
  LOSS_CATEGORIES,
  PLANT_CONFIGS,
  type CapturePayload,
  type LossCategory,
  type MetricByProduct,
} from "./types";

export type BackfillParseResult = {
  errors: BackfillRowError[];
  payloads: Array<{ payload: CapturePayload; rowNumber: number }>;
  totalRows: number;
};

export type BackfillRowError = {
  message: string;
  rowNumber: number;
};

const START_DATE = "2026-04-01";
const END_DATE = "2026-07-31";

const PRODUCT_COLUMNS = [
  ["R Sand", "r_sand"],
  ["20 MM", "20_mm"],
  ["10 MM", "10_mm"],
  ["P Sand", "p_sand"],
  ["Plaster Pro", "plaster_pro"],
  ["Robo Sand Plus", "robo_sand_plus"],
  ["WMM", "wmm"],
] as const;

const LOSS_COLUMNS: Array<[LossCategory, string]> = [
  ["quarryOversizeJams", "quarry_oversize_jams"],
  ["quarryNoTippers", "quarry_no_tippers"],
  ["quarryNoMaterial", "quarry_no_material"],
  ["quarryBlasting", "quarry_blasting"],
  ["plantBreakdown", "plant_breakdown"],
  ["plantScheduledMaintenance", "plant_scheduled_maintenance"],
  ["plantIdle", "plant_idle"],
  ["plantOther", "plant_other"],
];

export const BACKFILL_HEADERS = [
  "plant_code",
  "report_date",
  "status",
  "submitted_by",
  "target_mt",
  "production_mt",
  "ob_soft_rock_mt",
  "ob_hard_rock_mt",
  ...PRODUCT_COLUMNS.map(([, key]) => `mix_pct_${key}`),
  ...PRODUCT_COLUMNS.map(([, key]) => `dispatch_${key}_mt`),
  ...PRODUCT_COLUMNS.map(([, key]) => `opening_stock_${key}_mt`),
  ...PRODUCT_COLUMNS.map(([, key]) => `stock_adj_${key}_mt`),
  "stock_adjustment_comment",
  ...PRODUCT_COLUMNS.map(([, key]) => `book_opening_${key}_mt`),
  "jaw_hour_opening",
  "jaw_hour_closing",
  "cone_hour_opening",
  "cone_hour_closing",
  "vsi_hour_opening",
  "vsi_hour_closing",
  "available_hours",
  "production_hours",
  "scheduled_stoppage_hours",
  ...LOSS_COLUMNS.flatMap(([, key]) => [`${key}_hours`, `${key}_comments`]),
  "kwh_opening",
  "kwh_closing",
  "kvah_opening",
  "kvah_closing",
  "cmd",
  "domestic_kwh_opening",
  "domestic_kwh_closing",
  "exclude_domestic_from_units_per_mt",
  "loader_hour_opening",
  "loader_hour_closing",
  "loader_other_works_hours",
  "loader_diesel_litres",
  "loader_dispatch_mt",
  "include_diesel_variance",
  "fixed_cost",
  "raw_material_cost",
  "rent_plant_cost",
  "plant_maintenance_cost",
  "spares_consumables_cost",
  "wear_parts_cost",
  "intercarting_expenses",
  "remarks",
] as const;

export function buildBackfillTemplateCsv() {
  const rows = [BACKFILL_HEADERS.join(",")];
  for (const date of dateRange(START_DATE, END_DATE)) {
    for (const plant of PLANT_CONFIGS) {
      const row: Record<string, string> = {
        plant_code: plant.code,
        report_date: displayDate(date),
        status: "FINAL",
        submitted_by: "backfill-upload",
        exclude_domestic_from_units_per_mt: "TRUE",
        include_diesel_variance: "FALSE",
      };
      rows.push(BACKFILL_HEADERS.map((header) => csvCell(row[header] ?? "")).join(","));
    }
  }
  return `${rows.join("\n")}\n`;
}

export async function parseBackfillFile(input: ArrayBuffer, fileName: string): Promise<BackfillParseResult> {
  const extension = fileName.toLowerCase().split(".").pop();
  if (extension !== "csv" && extension !== "xlsx") {
    return {
      errors: [{ rowNumber: 1, message: "Only CSV and XLSX backfill files are supported." }],
      payloads: [],
      totalRows: 0,
    };
  }
  const rows = extension === "xlsx"
    ? await parseWorkbookRows(input)
    : parseCsvRows(Buffer.from(input).toString("utf8"));

  return rowsToPayloads(rows);
}

async function parseWorkbookRows(input: ArrayBuffer) {
  const sheets = await readWorkbook(Buffer.from(input));
  const preferred = sheets.find((sheet) => normalizeHeader(sheet.sheet) === normalizeHeader("Final Daily Records")) ?? sheets[0];
  if (!preferred) return [];
  return preferred.data as unknown[][];
}

function rowsToPayloads(rows: unknown[][]): BackfillParseResult {
  const errors: BackfillRowError[] = [];
  const [headerRow, ...dataRows] = rows;
  if (!headerRow) {
    return { errors: [{ rowNumber: 1, message: "The upload file is empty." }], payloads: [], totalRows: 0 };
  }

  const headers = headerRow.map((value) => normalizeHeader(String(value ?? "")));
  const missingHeaders = BACKFILL_HEADERS.filter((header) => !headers.includes(normalizeHeader(header)));
  if (missingHeaders.length) {
    return {
      errors: [{ rowNumber: 1, message: `Missing required columns: ${missingHeaders.join(", ")}` }],
      payloads: [],
      totalRows: dataRows.length,
    };
  }

  const payloads: BackfillParseResult["payloads"] = [];
  dataRows.forEach((row, index) => {
    const rowNumber = index + 2;
    if (isBlankRow(row)) return;
    const values = Object.fromEntries(headers.map((header, columnIndex) => [header, row[columnIndex]]));
    if (isOperationalBlankRow(values)) return;
    try {
      payloads.push({ payload: rowToPayload(values), rowNumber });
    } catch (error) {
      errors.push({
        rowNumber,
        message: error instanceof Error ? error.message : "Could not parse row.",
      });
    }
  });

  payloads.sort((a, b) => a.payload.plantCode.localeCompare(b.payload.plantCode) || a.payload.date.localeCompare(b.payload.date));

  return {
    errors,
    payloads,
    totalRows: payloads.length + errors.length,
  };
}

function isOperationalBlankRow(row: Record<string, unknown>) {
  if (!text(row.plant_code) && !text(row.report_date)) return true;

  const nonOperationalHeaders = new Set([
    "plant_code",
    "report_date",
    "status",
    "submitted_by",
    "exclude_domestic_from_units_per_mt",
    "include_diesel_variance",
  ]);
  return BACKFILL_HEADERS
    .filter((header) => !nonOperationalHeaders.has(header))
    .every((header) => text(row[header]) === "");
}

function rowToPayload(row: Record<string, unknown>): CapturePayload {
  const plantCode = text(row.plant_code).toUpperCase();
  const plant = PLANT_CONFIGS.find((config) => config.code === plantCode || config.aliases.some((alias) => alias.toUpperCase() === plantCode));
  if (!plant) throw new Error(`Invalid plant_code "${plantCode}".`);

  const date = parseDate(row.report_date);
  if (!date) throw new Error("report_date is required and must be a valid date.");

  const productMixPercentages = productValues(row, "mix_pct", "");
  const dispatch = productValues(row, "dispatch", "_mt");
  const openingStock = productValues(row, "opening_stock", "_mt");
  const stockAdjustments = productValues(row, "stock_adj", "_mt");
  const monthlyOpening = productValues(row, "book_opening", "_mt");

  return {
    plantCode: plant.code,
    plantName: plant.name,
    date,
    targetMt: num(row.target_mt),
    productionMt: num(row.production_mt),
    productMixPercentages,
    productMix: emptyProducts(),
    overburden: {
      softRockMt: num(row.ob_soft_rock_mt),
      hardRockMt: num(row.ob_hard_rock_mt),
    },
    dispatch,
    openingStock,
    closingStock: emptyProducts(),
    stockAdjustments,
    stockAdjustmentComment: text(row.stock_adjustment_comment),
    bookStock: {
      monthlyOpening,
      calculatedClosing: emptyProducts(),
    },
    machineHours: { jaw: 0, cone: 0, vsi: 0 },
    equipmentHourMeters: {
      jaw: { opening: num(row.jaw_hour_opening), closing: num(row.jaw_hour_closing) },
      cone: { opening: num(row.cone_hour_opening), closing: num(row.cone_hour_closing) },
      vsi: { opening: num(row.vsi_hour_opening), closing: num(row.vsi_hour_closing) },
    },
    tph: { jaw: 0, cone: 0, vsi: 0 },
    plantHours: {
      available: durationHours(row.available_hours),
      production: durationHours(row.production_hours),
      scheduledStoppage: durationHours(row.scheduled_stoppage_hours),
      loss: 0,
    },
    lossHours: Object.fromEntries(LOSS_CATEGORIES.map((category) => [category, 0])) as CapturePayload["lossHours"],
    lossDetails: Object.fromEntries(
      LOSS_COLUMNS.map(([category, key]) => [
        category,
        {
          hours: durationHours(row[`${key}_hours`]),
          comments: text(row[`${key}_comments`]),
        },
      ]),
    ) as CapturePayload["lossDetails"],
    lossEvent: { reason: "", hours: 0, comments: "" },
    electrical: {
      openingKwh: num(row.kwh_opening),
      closingKwh: num(row.kwh_closing),
      kwhMultiplyingFactor: plant.electricalMf,
      openingKvah: num(row.kvah_opening),
      closingKvah: num(row.kvah_closing),
      kvahMultiplyingFactor: plant.electricalMf,
      unitsConsumed: 0,
      kvahUnitsConsumed: 0,
      domesticUnits: 0,
      domestic: {
        openingKwh: num(row.domestic_kwh_opening),
        closingKwh: num(row.domestic_kwh_closing),
        multiplyingFactor: 0,
        unitsConsumed: 0,
      },
      excludeDomesticFromUnitsPerMt: bool(row.exclude_domestic_from_units_per_mt, true),
      powerFactor: 0,
      cmd: num(row.cmd),
    },
    loader: {
      hours: 0,
      hourMeter: {
        opening: num(row.loader_hour_opening),
        closing: num(row.loader_hour_closing),
      },
      productionHours: 0,
      otherWorksHours: num(row.loader_other_works_hours),
      tph: 0,
      dieselLitres: num(row.loader_diesel_litres),
      dieselRate: 0,
      dieselVarianceRate: 0,
      includeDieselVariance: bool(row.include_diesel_variance, false),
      dieselCost: 0,
      dieselVarianceCost: 0,
      dispatchMt: num(row.loader_dispatch_mt),
    },
    electricLoader: {
      enabled: false,
      meter: { opening: 0, closing: 0 },
      kwh: { opening: 0, closing: 0 },
      kvah: { opening: 0, closing: 0 },
      dispatchMt: 0,
      runningHours: 0,
      kwhUnits: 0,
      kvahUnits: 0,
      unitsPerMt: 0,
      tph: 0,
    },
    cop: {
      fixedCostMonthly: 0,
      fixedCostDaily: 0,
      fixedCost: num(row.fixed_cost),
      frozenDrillingBlastingRate: 0,
      frozenLoadingTransportRate: 0,
      frozenObSoftRockRate: 0,
      frozenObHardRockRate: 0,
      frozenDieselRate: 0,
      frozenDieselVarianceRate: 0,
      quarryObCost: 0,
      quarryBlastingCost: 0,
      quarryLtCost: 0,
      drillingBlastingCost: 0,
      internalTransportationCost: 0,
      overburdenRemovalCost: 0,
      rawMaterialCost: num(row.raw_material_cost),
      rentPlantCost: num(row.rent_plant_cost),
      plantCost: 0,
      plantMaintenanceCost: num(row.plant_maintenance_cost),
      electricalCost: 0,
      loaderCost: 0,
      sparesConsumablesCost: num(row.spares_consumables_cost),
      wearPartsCost: num(row.wear_parts_cost),
      intercartingExpenses: num(row.intercarting_expenses),
      powerCost: 0,
      dieselCost: 0,
      consumablesCost: 0,
      maintenanceCost: 0,
    },
    remarks: text(row.remarks),
    evidencePhotos: [],
    submittedBy: text(row.submitted_by) || "backfill-upload",
  };
}

function productValues(row: Record<string, unknown>, prefix: string, suffix: string): MetricByProduct {
  return Object.fromEntries(
    PRODUCT_COLUMNS.map(([product, key]) => [product, num(row[`${prefix}_${key}${suffix}`])]),
  ) as MetricByProduct;
}

function emptyProducts(): MetricByProduct {
  return Object.fromEntries(CAPTURE_PRODUCTS.map((product) => [product, 0])) as MetricByProduct;
}

function parseCsvRows(input: string): unknown[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const textInput = input.replace(/^\uFEFF/, "");

  for (let index = 0; index < textInput.length; index += 1) {
    const char = textInput[index];
    const next = textInput[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      rows.push(row);
      field = "";
      row = [];
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return dateToIso(value);
  if (typeof value === "number" && value > 25569) {
    return new Date((value - 25569) * 86400 * 1000).toISOString().slice(0, 10);
  }
  const raw = text(value);
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return raw;
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) return dateToIso(date);
  const slash = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slash) {
    const [, day, month, year] = slash;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return "";
}

function dateToIso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateRange(start: string, end: string) {
  const dates: string[] = [];
  const current = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);
  while (current <= last) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function displayDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function num(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(text(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function durationHours(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getUTCHours() + value.getUTCMinutes() / 60 + value.getUTCSeconds() / 3600;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0;
    return value > 0 && value <= 1 ? value * 24 : value;
  }

  const raw = text(value);
  if (!raw) return 0;
  const hhmm = raw.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
  if (hhmm) {
    const [, hour, minute, second = "0"] = hhmm;
    return Number(hour) + Number(minute) / 60 + Number(second) / 3600;
  }

  const date = new Date(raw);
  if (!Number.isNaN(date.getTime()) && raw.includes("T")) {
    return date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  }

  return num(value);
}

function bool(value: unknown, fallback: boolean) {
  const raw = text(value).toLowerCase();
  if (!raw) return fallback;
  return ["true", "yes", "y", "1"].includes(raw);
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function isBlankRow(row: unknown[]) {
  return row.every((value) => text(value) === "");
}

function csvCell(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
