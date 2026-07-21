import PptxGenJS from "pptxgenjs";
import type { ReportSnapshot } from "./types";
import { inrNumber } from "./calculations";

export async function generatePowerPoint(snapshot: ReportSnapshot) {
  if (!snapshot.validation.valid) {
    throw new Error("Snapshot contains validation errors and cannot generate a locked report.");
  }

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Robo Silicon Operations Reporting";
  pptx.subject = `${snapshot.plantCode} operations report`;
  pptx.title = `${snapshot.plantCode} ${snapshot.period.start} to ${snapshot.period.end}`;
  pptx.company = "Robo Silicon";
  pptx.lang = "en-IN";
  pptx.theme = {
    headFontFace: "Aptos Display",
    bodyFontFace: "Aptos",
    lang: "en-US",
  };

  addTitle(pptx, snapshot);
  addTargetActual(pptx, snapshot);
  addProductRatiosAndBasis(pptx, snapshot);
  addPlantHours(pptx, snapshot);
  addLossHours(pptx, snapshot);
  addTph(pptx, snapshot, "jawTph", "Jaw TPH");
  addUtilisation(pptx, snapshot);
  addMtdTrends(pptx, snapshot);
  addTph(pptx, snapshot, "vsiTph", "VSI TPH");
  addElectrical(pptx, snapshot);
  addLoader(pptx, snapshot);
  addLoaderMonitoring(pptx, snapshot);
  addCopStructure(pptx, snapshot);
  addCopProjection(pptx, snapshot);
  addCommentary(pptx, snapshot);
  addNextWeek(pptx, snapshot);
  addThankYou(pptx, snapshot);

  const buffer = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.from(buffer);
}

function addTitle(pptx: PptxGenJS, snapshot: ReportSnapshot) {
  const slide = pptx.addSlide();
  slide.background = { color: "183153" };
  slide.addText(snapshot.plantCode, {
    x: 0.7,
    y: 2.05,
    w: 7,
    h: 0.7,
    color: "FFFFFF",
    fontFace: "Aptos Display",
    fontSize: 42,
    bold: true,
  });
  slide.addText(formatPeriod(snapshot), {
    x: 0.72,
    y: 2.86,
    w: 7,
    h: 0.38,
    color: "DCE9E6",
    fontSize: 19,
    bold: true,
  });
  slide.addText("Operations Performance Report", {
    x: 0.72,
    y: 3.45,
    w: 7.8,
    h: 0.42,
    color: "F3A712",
    fontSize: 17,
  });
}

function addTargetActual(pptx: PptxGenJS, snapshot: ReportSnapshot) {
  const slide = contentSlide(pptx, snapshot, "Target Vs Actual");
  addMetricTiles(slide, [
    ["Target", `${inrNumber(snapshot.totals.targetMt)} MT`],
    ["Production", `${inrNumber(snapshot.totals.productionMt)} MT`],
    ["Achievement", `${snapshot.totals.achievementPct}%`],
    ["Dispatch", `${inrNumber(snapshot.totals.dispatchMt)} MT`],
  ]);
  addSimpleBars(slide, snapshot.daily.map((d) => d.label), [
    { name: "Target", values: snapshot.daily.map((d) => d.targetMt), color: "183153" },
    { name: "Production", values: snapshot.daily.map((d) => d.production.mt), color: "087F8C" },
    { name: "Dispatch", values: snapshot.daily.map((d) => d.dispatch.totalMt), color: "D1495B" },
  ]);
}

function addProductRatiosAndBasis(pptx: PptxGenJS, snapshot: ReportSnapshot) {
  const slide = contentSlide(pptx, snapshot, "Product Ratios and KPI Basis");
  const productTotals = new Map<string, number>();
  snapshot.daily.forEach((day) => {
    day.production.products.forEach((product) => {
      productTotals.set(product.name, (productTotals.get(product.name) ?? 0) + product.mt);
    });
  });
  const productRows = [...productTotals.entries()]
    .filter((entry) => entry[1] > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => [
      name,
      `${inrNumber(value)} MT`,
      `${snapshot.totals.productionMt ? ((value / snapshot.totals.productionMt) * 100).toFixed(1) : "0.0"}%`,
    ]);
  productRows.push(["Total", `${inrNumber(snapshot.totals.productionMt)} MT`, "100.0%"]);

  addTable(slide, ["Product", "Production", "Ratio"], productRows, 0.9, 5.55);
  addTable(
    slide,
    ["Basis", "Production", "Jaw TPH", "Cone TPH", "VSI TPH", "Units/MT"],
    basisRows(snapshot).map((row) => [
      row.label,
      inrNumber(row.production),
      row.jawTph.toFixed(1),
      row.coneTph.toFixed(1),
      row.vsiTph.toFixed(1),
      row.unitsPerMt.toFixed(2),
    ]),
    3.5,
    5.55,
  );
}

function addPlantHours(pptx: PptxGenJS, snapshot: ReportSnapshot) {
  const slide = contentSlide(pptx, snapshot, "Plant Hrs. Summary");
  addMetricTiles(slide, [
    ["Running Hrs", `${inrNumber(snapshot.totals.plantRunningHours)} hr`],
    ["Stoppage Hrs", `${inrNumber(snapshot.totals.stoppageHours)} hr`],
    ["Avg Jaw TPH", `${snapshot.totals.avgJawTph}`],
    ["Avg VSI TPH", `${snapshot.totals.avgVsiTph}`],
  ]);
  addSimpleBars(slide, snapshot.daily.map((d) => d.label), [
    { name: "Production Hrs", values: snapshot.daily.map((d) => d.plantHours.productionHours), color: "2F855A" },
    { name: "Loss Hrs", values: snapshot.daily.map((d) => d.plantHours.lossHours), color: "D1495B" },
  ]);
}

function addLossHours(pptx: PptxGenJS, snapshot: ReportSnapshot) {
  const slide = contentSlide(pptx, snapshot, "Loss Hrs. Summary");
  addTable(slide, ["Area", "Reason", "Hours", "Comments"], lossRows(snapshot), 1.05);
}

function addTph(pptx: PptxGenJS, snapshot: ReportSnapshot, key: "jawTph" | "vsiTph", title: string) {
  const slide = contentSlide(pptx, snapshot, title);
  addMetricTiles(slide, [
    ["Average", `${key === "jawTph" ? snapshot.totals.avgJawTph : snapshot.totals.avgVsiTph}`],
    ["Peak", `${Math.max(...snapshot.daily.map((d) => d.machine[key]))}`],
    ["Minimum", `${Math.min(...snapshot.daily.filter((d) => d.machine[key] > 0).map((d) => d.machine[key]))}`],
    ["Days tracked", `${snapshot.daily.filter((d) => d.machine[key] > 0).length}`],
  ]);
  addSimpleBars(slide, snapshot.daily.map((d) => d.label), [
    { name: title, values: snapshot.daily.map((d) => d.machine[key]), color: "087F8C" },
  ]);
}

function addUtilisation(pptx: PptxGenJS, snapshot: ReportSnapshot) {
  const slide = contentSlide(pptx, snapshot, "Plant Utilisation");
  addTable(
    slide,
    ["Metric", "Value"],
    [
      ["Production achievement", `${snapshot.totals.achievementPct}%`],
      ["Dispatch to production", `${snapshot.totals.dispatchToProductionPct}%`],
      ["Production hours", `${inrNumber(snapshot.totals.plantRunningHours)} hr`],
      ["Stoppage hours", `${inrNumber(snapshot.totals.stoppageHours)} hr`],
      ["Avg units/MT", `${snapshot.totals.avgUnitsPerMt}`],
    ],
    1.05,
  );
}

function addMtdTrends(pptx: PptxGenJS, snapshot: ReportSnapshot) {
  const slide = contentSlide(pptx, snapshot, "MTD Trend - Production & Dispatch");
  const rows = mtdRows(snapshot);
  addMetricTiles(slide, [
    ["MTD Production", `${inrNumber(rows.at(-1)?.production ?? 0)} MT`],
    ["MTD Dispatch", `${inrNumber(rows.at(-1)?.dispatch ?? 0)} MT`],
    ["Avg Units/MT", `${snapshot.totals.avgUnitsPerMt}`],
    ["Loader L/MT", `${snapshot.totals.loaderLitresPerMt}`],
  ]);
  addSimpleBars(
    slide,
    rows.map((row) => row.label),
    [
      { name: "MTD Production", values: rows.map((row) => row.production), color: "087F8C" },
      { name: "MTD Dispatch", values: rows.map((row) => row.dispatch), color: "D1495B" },
    ],
    true,
  );
}

function addElectrical(pptx: PptxGenJS, snapshot: ReportSnapshot) {
  const slide = contentSlide(pptx, snapshot, "Electricity - Units / MT");
  addMetricTiles(slide, [
    ["Avg Units/MT", `${snapshot.totals.avgUnitsPerMt}`],
    ["Best Day", `${Math.min(...snapshot.daily.filter((d) => d.electrical.unitsPerMt > 0).map((d) => d.electrical.unitsPerMt))}`],
    ["Avg PF", `${avg(snapshot.daily.map((d) => d.electrical.powerFactor)).toFixed(3)}`],
    ["kWh", `${inrNumber(sum(snapshot.daily.map((d) => d.electrical.kwh)))}`],
  ]);
  addSimpleBars(slide, snapshot.daily.map((d) => d.label), [
    { name: "Units/MT", values: snapshot.daily.map((d) => d.electrical.unitsPerMt), color: "F3A712" },
  ]);
}

function addLoader(pptx: PptxGenJS, snapshot: ReportSnapshot) {
  const slide = contentSlide(pptx, snapshot, "Loader");
  addMetricTiles(slide, [
    ["Diesel", `${inrNumber(snapshot.totals.dieselLitres)} L`],
    ["L/MT", `${snapshot.totals.loaderLitresPerMt}`],
    ["Avg TPH", `${avg(snapshot.daily.map((d) => d.loader.tph)).toFixed(1)}`],
    ["Loader Hrs", `${inrNumber(sum(snapshot.daily.map((d) => d.loader.hours)))}`],
  ]);
  addSimpleBars(slide, snapshot.daily.map((d) => d.label), [
    { name: "L/MT", values: snapshot.daily.map((d) => d.loader.litresPerMt), color: "D1495B" },
  ]);
}

function addLoaderMonitoring(pptx: PptxGenJS, snapshot: ReportSnapshot) {
  const slide = contentSlide(pptx, snapshot, "Loader Daily / Weekly / MTD");
  addTable(
    slide,
    ["Basis", "Running Hrs", "Ltr/MT", "TPH", "Dispatch Qty"],
    loaderRows(snapshot).map((row) => [
      row.label,
      inrNumber(row.runningHours),
      row.litresPerMt.toFixed(3),
      row.tph.toFixed(1),
      `${inrNumber(row.dispatchMt)} MT`,
    ]),
    0.95,
  );
  addSimpleBars(
    slide,
    snapshot.daily.map((d) => d.label),
    [
      { name: "Dispatch MT", values: snapshot.daily.map((d) => d.loader.dispatchMt), color: "087F8C" },
      { name: "Loader TPH", values: snapshot.daily.map((d) => d.loader.tph), color: "183153" },
      { name: "Ltr/MT", values: snapshot.daily.map((d) => d.loader.litresPerMt), color: "F3A712" },
    ],
    true,
    2.8,
    3.65,
  );
}

function addCopStructure(pptx: PptxGenJS, snapshot: ReportSnapshot) {
  const slide = contentSlide(pptx, snapshot, "COP Structure");
  slide.addText(`Location: ${snapshot.plantName}`, { x: 0.75, y: 0.82, w: 3.5, h: 0.25, fontSize: 11, bold: true, color: "183153" });
  slide.addText(`Month: ${snapshot.period.start.slice(0, 7)}`, { x: 4.3, y: 0.82, w: 2.4, h: 0.25, fontSize: 11, bold: true, color: "183153" });
  addTable(slide, ["Quantitative Information", "Actuals", "Rs./Mt"], copRows(snapshot), 1.15);
}

function addCopProjection(pptx: PptxGenJS, snapshot: ReportSnapshot) {
  const slide = contentSlide(pptx, snapshot, "MTD and Extrapolated COP");
  addTable(
    slide,
    ["Metric", "Value"],
    copProjectionRows(snapshot).map((row) => [row.label, row.value]),
    1.05,
    7.8,
  );
}

function addCommentary(pptx: PptxGenJS, snapshot: ReportSnapshot) {
  const slide = contentSlide(pptx, snapshot, "Management Commentary");
  snapshot.commentary.actionPoints.slice(0, 5).forEach((point, index) => {
    slide.addText(point, {
      x: 0.8,
      y: 1.15 + index * 0.68,
      w: 11.4,
      h: 0.45,
      fontSize: 16,
      color: "15201D",
      fit: "shrink",
      breakLine: false,
      margin: 0.05,
      bullet: { type: "ul" },
    });
  });
}

function addNextWeek(pptx: PptxGenJS, snapshot: ReportSnapshot) {
  const slide = contentSlide(pptx, snapshot, "Next week Target");
  const dailyTarget = Math.round(snapshot.totals.targetMt / Math.max(snapshot.daily.length, 1));
  addTable(
    slide,
    ["Action", "Owner", "Target"],
    [
      ["Confirm daily production target before shift plan freeze", "Plant Head", `${inrNumber(dailyTarget)} MT/day`],
      ["Review Jaw/VSI TPH days below average", "Maintenance", "Daily morning meeting"],
      ["Track units/MT and loader litres/MT exceptions", "Electrical / Stores", "Exception log"],
      ["Close data gaps before report lock", "Operations MIS", "Same day"],
    ],
    1.05,
  );
}

function addThankYou(pptx: PptxGenJS, snapshot: ReportSnapshot) {
  const slide = pptx.addSlide();
  slide.background = { color: "183153" };
  slide.addText(snapshot.plantCode, {
    x: 0.8,
    y: 2.1,
    w: 5,
    h: 0.6,
    color: "FFFFFF",
    fontSize: 38,
    bold: true,
  });
  slide.addText("Thank You", {
    x: 0.8,
    y: 3.0,
    w: 5,
    h: 0.5,
    color: "F3A712",
    fontSize: 26,
    bold: true,
  });
  slide.addText(formatPeriod(snapshot), {
    x: 0.8,
    y: 3.6,
    w: 5,
    h: 0.3,
    color: "DCE9E6",
    fontSize: 14,
  });
}

function contentSlide(pptx: PptxGenJS, snapshot: ReportSnapshot, title: string) {
  const slide = pptx.addSlide();
  slide.background = { color: "F4F7F6" };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.58, fill: { color: "183153" }, line: { color: "183153" } });
  slide.addText(`${snapshot.plantCode}: ${title}`, {
    x: 0.55,
    y: 0.14,
    w: 8.4,
    h: 0.32,
    color: "FFFFFF",
    fontSize: 16,
    bold: true,
    fit: "shrink",
  });
  slide.addText(formatPeriod(snapshot), {
    x: 9.1,
    y: 0.16,
    w: 3.5,
    h: 0.28,
    color: "DCE9E6",
    fontSize: 12,
    align: "right",
  });
  return slide;
}

function addMetricTiles(slide: PptxGenJS.Slide, tiles: Array<[string, string]>) {
  tiles.forEach(([labelText, value], index) => {
    const x = 0.65 + index * 3.05;
    slide.addShape("roundRect", {
      x,
      y: 0.8,
      w: 2.75,
      h: 0.8,
      rectRadius: 0.04,
      fill: { color: "FFFFFF" },
      line: { color: "D9E4DF" },
    });
    slide.addText(labelText, { x: x + 0.14, y: 0.94, w: 2.4, h: 0.18, fontSize: 8.5, bold: true, color: "63716D" });
    slide.addText(value, { x: x + 0.14, y: 1.17, w: 2.4, h: 0.25, fontSize: 16, bold: true, color: "183153", fit: "shrink" });
  });
}

function addSimpleBars(
  slide: PptxGenJS.Slide,
  labels: string[],
  series: Array<{ name: string; values: number[]; color: string }>,
  showValues = false,
  y = 2.05,
  h = 4.5,
) {
  const x = 0.7;
  const w = 11.8;
  const max = Math.max(...series.flatMap((item) => item.values), 1);
  const groupWidth = w / labels.length;
  const barWidth = Math.min(0.13, groupWidth / (series.length + 1));

  slide.addShape("rect", { x, y, w, h, fill: { color: "FFFFFF" }, line: { color: "D9E4DF" } });
  series.forEach((item, seriesIndex) => {
    item.values.forEach((value, index) => {
      const barHeight = (Math.max(value, 0) / max) * (h - 0.72);
      slide.addShape("rect", {
        x: x + index * groupWidth + 0.12 + seriesIndex * (barWidth + 0.03),
        y: y + h - 0.42 - barHeight,
        w: barWidth,
        h: barHeight,
        fill: { color: item.color },
        line: { color: item.color },
      });
      if (showValues && labels.length <= 18 && value > 0) {
        slide.addText(compactNumber(value), {
          x: x + index * groupWidth + 0.02,
          y: y + h - 0.48 - barHeight - 0.13,
          w: Math.max(0.28, groupWidth),
          h: 0.12,
          fontSize: 5.8,
          color: "183153",
          align: "center",
          fit: "shrink",
        });
      }
    });
    slide.addText(item.name, {
      x: x + 0.2 + seriesIndex * 2.0,
      y: y + 0.16,
      w: 1.8,
      h: 0.2,
      fontSize: 9,
      color: item.color,
      bold: true,
    });
  });
  labels.forEach((labelText, index) => {
    if (index % 2 === 0) {
      slide.addText(labelText, {
        x: x + index * groupWidth,
        y: y + h - 0.28,
        w: groupWidth,
        h: 0.16,
        fontSize: 6.5,
        color: "63716D",
        align: "center",
      });
    }
  });
}

function addTable(slide: PptxGenJS.Slide, headers: string[], rows: string[][], y: number, w = 11.8) {
  slide.addTable([headers, ...rows], {
    x: 0.75,
    y,
    w,
    h: Math.min(5.4, 0.42 * (rows.length + 1)),
    border: { color: "D9E4DF", pt: 1 },
    fontSize: 13,
    color: "15201D",
    margin: 0.08,
    fill: { color: "FFFFFF" },
    autoFit: true,
    fit: "shrink",
  });
}

function basisRows(snapshot: ReportSnapshot) {
  return [
    summarizeBasis("Daily", latestDays(snapshot.daily, 1)),
    summarizeBasis("Weekly", latestDays(snapshot.daily, 7)),
    summarizeBasis("MTD", monthToDateDays(snapshot.daily)),
  ];
}

function loaderRows(snapshot: ReportSnapshot) {
  return [
    summarizeLoader("Daily", latestDays(snapshot.daily, 1)),
    summarizeLoader("Weekly", latestDays(snapshot.daily, 7)),
    summarizeLoader("MTD", monthToDateDays(snapshot.daily)),
  ];
}

function lossRows(snapshot: ReportSnapshot) {
  const totals = new Map<string, { area: string; hours: number; comments: Set<string> }>();
  snapshot.daily.forEach((day) => {
    const details = day.plantHours.lossDetails;
    Object.entries(day.plantHours.lossBreakdown).forEach(([bucket, value]) => {
      if (!value) return;
      const current = totals.get(bucket) ?? { area: bucket.startsWith("quarry") ? "Quarry" : "Plant", hours: 0, comments: new Set<string>() };
      current.hours += value;
      const comment = details?.[bucket]?.comments;
      if (comment) current.comments.add(comment);
      totals.set(bucket, current);
    });
  });
  return [...totals.entries()].map(([bucket, item]) => [
    item.area,
    label(bucket),
    formatHours(item.hours),
    [...item.comments].slice(0, 2).join("; "),
  ]);
}

function copRows(snapshot: ReportSnapshot) {
  const production = snapshot.totals.productionMt;
  const totals = {
    drillingBlasting: sum(snapshot.daily.map((day) => day.cop?.drillingBlastingCost ?? day.cop?.quarryBlastingCost ?? 0)),
    internalTransport: sum(snapshot.daily.map((day) => day.cop?.internalTransportationCost ?? day.cop?.quarryLtCost ?? 0)),
    overburden: sum(snapshot.daily.map((day) => day.cop?.overburdenRemovalCost ?? day.cop?.quarryObCost ?? 0)),
    rawMaterial: sum(snapshot.daily.map((day) => day.cop?.rawMaterialCost ?? 0)),
    rentPlant: sum(snapshot.daily.map((day) => day.cop?.rentPlantCost ?? 0)),
    electricity: sum(snapshot.daily.map((day) => day.cop?.electricalCost ?? 0)),
    plantMaintenance: sum(snapshot.daily.map((day) => day.cop?.plantMaintenanceCost ?? day.cop?.plantCost ?? 0)),
    spares: sum(snapshot.daily.map((day) => day.cop?.sparesConsumablesCost ?? 0)),
    wearParts: sum(snapshot.daily.map((day) => day.cop?.wearPartsCost ?? 0)),
    loaderDiesel: sum(snapshot.daily.map((day) => day.cop?.loaderCost ?? day.loader.dieselCost ?? 0)),
    intercarting: sum(snapshot.daily.map((day) => day.cop?.intercartingExpenses ?? 0)),
    fixed: sum(snapshot.daily.map((day) => day.cop?.fixedCost ?? day.cop?.fixedCostMonthly ?? 0)),
  };
  const variableExcavation = totals.drillingBlasting + totals.internalTransport + totals.overburden;
  const rawMaterialSourcing = totals.rawMaterial + totals.rentPlant;
  const crushing = totals.electricity + totals.plantMaintenance + totals.spares + totals.wearParts;
  const loading = totals.loaderDiesel + totals.intercarting;
  const totalVariable = variableExcavation + rawMaterialSourcing + crushing + loading;
  const totalCop = totalVariable + totals.fixed;
  return [
    ["Production", inrNumber(production), ""],
    ["Drilling & Blasting", currency(totals.drillingBlasting), perMt(totals.drillingBlasting, production)],
    ["Internal Transportation", currency(totals.internalTransport), perMt(totals.internalTransport, production)],
    ["Overburden Removal", currency(totals.overburden), perMt(totals.overburden, production)],
    ["Variable Excavation Cost", currency(variableExcavation), perMt(variableExcavation, production)],
    ["Raw materials", currency(totals.rawMaterial), perMt(totals.rawMaterial, production)],
    ["Rent- Plant", currency(totals.rentPlant), perMt(totals.rentPlant, production)],
    ["Raw Material - Boulder Sourcing", currency(rawMaterialSourcing), perMt(rawMaterialSourcing, production)],
    ["Diesel - Plant", "-", "-"],
    ["Electricity - Variable", currency(totals.electricity), perMt(totals.electricity, production)],
    ["Plant Maintenance", currency(totals.plantMaintenance), perMt(totals.plantMaintenance, production)],
    ["Spares & consumables", currency(totals.spares), perMt(totals.spares, production)],
    ["Wear Parts", currency(totals.wearParts), perMt(totals.wearParts, production)],
    ["Variable Crushing & Screening Costs", currency(crushing), perMt(crushing, production)],
    ["Diesel - loader", currency(totals.loaderDiesel), perMt(totals.loaderDiesel, production)],
    ["Intercarting Expenses", currency(totals.intercarting), perMt(totals.intercarting, production)],
    ["Variable Material loading & handling", currency(loading), perMt(loading, production)],
    ["Total Variable mfg costs", currency(totalVariable), perMt(totalVariable, production)],
    ["Fixed cost", currency(totals.fixed), perMt(totals.fixed, production)],
    ["Total COP", currency(totalCop), perMt(totalCop, production)],
  ];
}

function copProjectionRows(snapshot: ReportSnapshot) {
  const days = monthToDateDays(snapshot.daily);
  const latest = [...days].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  if (!latest) {
    return [
      { label: "MTD production", value: "0 MT" },
      { label: "Extrapolated production", value: "0 MT" },
      { label: "MTD total COP", value: "Rs 0" },
      { label: "Extrapolated COP", value: "Rs 0" },
      { label: "MTD COP / MT", value: "0" },
    ];
  }
  const [year, month, dayOfMonth] = latest.date.split("-").map(Number);
  const elapsedDays = Math.max(dayOfMonth || days.length, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const production = sum(days.map((day) => day.production.mt));
  const totalCop = copTotal(days);
  const copPerMt = production ? totalCop / production : 0;
  const projectedProduction = (production / elapsedDays) * daysInMonth;
  const projectedCop = copPerMt * projectedProduction;
  return [
    { label: "MTD production", value: `${inrNumber(production)} MT` },
    { label: "Elapsed calendar days", value: String(elapsedDays) },
    { label: "Days in month", value: String(daysInMonth) },
    { label: "Extrapolated production", value: `${inrNumber(projectedProduction)} MT` },
    { label: "MTD total COP", value: currency(totalCop) },
    { label: "Extrapolated COP", value: currency(projectedCop) },
    { label: "MTD COP / MT", value: perMt(totalCop, production) },
  ];
}

function copTotal(days: ReportSnapshot["daily"]) {
  return sum(days.map((day) => day.cop?.totalCost ?? 0)) || sum(days.map((day) => (
    (day.cop?.drillingBlastingCost ?? day.cop?.quarryBlastingCost ?? 0) +
    (day.cop?.internalTransportationCost ?? day.cop?.quarryLtCost ?? 0) +
    (day.cop?.overburdenRemovalCost ?? day.cop?.quarryObCost ?? 0) +
    (day.cop?.rawMaterialCost ?? 0) +
    (day.cop?.rentPlantCost ?? 0) +
    (day.cop?.electricalCost ?? 0) +
    (day.cop?.plantMaintenanceCost ?? day.cop?.plantCost ?? 0) +
    (day.cop?.sparesConsumablesCost ?? 0) +
    (day.cop?.wearPartsCost ?? 0) +
    (day.cop?.loaderCost ?? day.loader.dieselCost ?? 0) +
    (day.cop?.intercartingExpenses ?? 0) +
    (day.cop?.fixedCost ?? day.cop?.fixedCostMonthly ?? 0)
  )));
}

function mtdRows(snapshot: ReportSnapshot) {
  let production = 0;
  let dispatch = 0;
  return monthToDateDays(snapshot.daily).map((day) => {
    production += day.production.mt;
    dispatch += day.dispatch.totalMt;
    return {
      label: day.label,
      production,
      dispatch,
    };
  });
}

function summarizeBasis(labelText: string, days: ReportSnapshot["daily"]) {
  return {
    label: labelText,
    production: sum(days.map((day) => day.production.mt)),
    jawTph: avg(days.map((day) => day.machine.jawTph)),
    coneTph: avg(days.map((day) => day.machine.coneTph)),
    vsiTph: avg(days.map((day) => day.machine.vsiTph)),
    unitsPerMt: weightedAverage(days.map((day) => [day.electrical.unitsPerMt, day.production.mt])),
  };
}

function summarizeLoader(labelText: string, days: ReportSnapshot["daily"]) {
  const dispatchMt = sum(days.map((day) => day.loader.dispatchMt));
  const dieselLitres = sum(days.map((day) => day.loader.dieselLitres));
  const runningHours = sum(days.map((day) => day.loader.hours));

  return {
    label: labelText,
    runningHours,
    litresPerMt: dispatchMt ? dieselLitres / dispatchMt : 0,
    tph: runningHours ? dispatchMt / runningHours : 0,
    dispatchMt,
  };
}

function latestDays(days: ReportSnapshot["daily"], count: number) {
  return [...days].sort((a, b) => a.date.localeCompare(b.date)).slice(-count);
}

function monthToDateDays(days: ReportSnapshot["daily"]) {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted.at(-1);
  if (!latest) return [];
  const month = latest.date.slice(0, 7);
  return sorted.filter((day) => day.date.startsWith(month));
}

function weightedAverage(values: number[][]) {
  const weightedTotal = values.reduce((total, [value, weight]) => total + (Number.isFinite(value) ? value : 0) * weight, 0);
  const weightTotal = values.reduce((total, [, weight]) => total + (Number.isFinite(weight) ? weight : 0), 0);
  return weightTotal ? weightedTotal / weightTotal : 0;
}

function compactNumber(value: number) {
  if (Math.abs(value) >= 100000) return `${Math.round(value / 1000)}k`;
  if (Math.abs(value) >= 10000) return `${Math.round(value / 1000)}k`;
  if (Math.abs(value) >= 1000) return `${Math.round(value / 100) / 10}k`;
  return inrNumber(value);
}

function currency(value: number) {
  return value ? inrNumber(value) : "-";
}

function perMt(value: number, production: number) {
  return value && production ? inrNumber(value / production) : "-";
}

function formatHours(value: number) {
  const totalMinutes = Math.round(Math.max(value, 0) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function formatPeriod(snapshot: ReportSnapshot) {
  return `${snapshot.period.start} to ${snapshot.period.end}`;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function avg(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value) && value > 0);
  return valid.length ? sum(valid) / valid.length : 0;
}

function label(value: string) {
  return value.replace(/[A-Z]/g, (match) => ` ${match}`).replace(/^./, (match) => match.toUpperCase());
}
