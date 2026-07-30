import { NextResponse } from "next/server";
import { requireAdminSession } from "@/src/lib/auth/admin";
import { parseBackfillFile } from "@/src/lib/capture/backfill";
import { saveDailyRecord } from "@/src/lib/capture/store";
import { LOSS_CATEGORIES } from "@/src/lib/capture/types";

export const runtime = "nodejs";

type RejectedBackfillRow = {
  date?: string;
  diagnostics?: {
    availableHours: number;
    calculatedLossHours: number;
    dispatchTotal: number;
    lossDetailTotal: number;
    productMixPercentageTotal: number;
    productMixTotal: number;
    productionHours: number;
    productionMt: number;
    scheduledStoppageHours: number;
  };
  issueCount?: number;
  issues?: Array<{
    code: string;
    field?: string;
    message: string;
    severity: string;
  }>;
  message: string;
  plantCode?: string;
  rowNumber: number;
};

export async function POST(request: Request) {
  const admin = await requireAdminSession();
  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Expected file field with CSV or XLSX upload." }, { status: 400 });
  }

  const parsed = await parseBackfillFile(await file.arrayBuffer(), file.name);
  const rejected: RejectedBackfillRow[] = [...parsed.errors];
  const accepted: Array<{ date: string; plantCode: string; rowNumber: number }> = [];
  let imported = 0;

  for (const item of parsed.payloads) {
    const result = await saveDailyRecord({
      payload: item.payload,
      action: "SUBMIT",
      actor: admin.username,
      allowFinalEdit: true,
    });

    if (result.accepted) {
      imported += 1;
      accepted.push({
        date: item.payload.date,
        plantCode: item.payload.plantCode,
        rowNumber: item.rowNumber,
      });
    } else {
      const errors = result.validation.issues.filter((issue) => issue.severity === "ERROR");
      rejected.push({
        date: item.payload.date,
        diagnostics: {
          availableHours: result.record.plantHours.available,
          calculatedLossHours: result.record.calculations.lossHours,
          dispatchTotal: result.record.calculations.dispatchTotal,
          lossDetailTotal: LOSS_CATEGORIES.reduce((total, category) => total + result.record.lossDetails[category].hours, 0),
          productMixPercentageTotal: result.record.calculations.productMixPercentageTotal,
          productMixTotal: result.record.calculations.productMixTotal,
          productionHours: result.record.plantHours.production,
          productionMt: result.record.productionMt,
          scheduledStoppageHours: result.record.plantHours.scheduledStoppage,
        },
        issueCount: errors.length,
        issues: errors.map((issue) => ({
          code: issue.code,
          field: issue.field,
          message: issue.message,
          severity: issue.severity,
        })),
        plantCode: item.payload.plantCode,
        rowNumber: item.rowNumber,
        message: errors.map((issue) => issue.message).join(" "),
      });
    }
  }

  return NextResponse.json({
    accepted,
    imported,
    rejected,
    totalRows: parsed.totalRows,
  });
}
