import { NextResponse } from "next/server";
import { requireAdminSession } from "@/src/lib/auth/admin";
import { parseBackfillFile } from "@/src/lib/capture/backfill";
import { saveDailyRecord } from "@/src/lib/capture/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const admin = await requireAdminSession();
  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Expected file field with CSV or XLSX upload." }, { status: 400 });
  }

  const parsed = await parseBackfillFile(await file.arrayBuffer(), file.name);
  const rejected: Array<{ date?: string; message: string; plantCode?: string; rowNumber: number }> = [...parsed.errors];
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
      rejected.push({
        date: item.payload.date,
        plantCode: item.payload.plantCode,
        rowNumber: item.rowNumber,
        message: result.validation.issues.map((issue) => issue.message).join(" "),
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
