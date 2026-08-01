import { NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/src/lib/auth/admin";
import { parseBackfillFile } from "@/src/lib/capture/backfill";
import { saveDailyRecord } from "@/src/lib/capture/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let admin: Awaited<ReturnType<typeof requireSuperAdminSession>>;
  try {
    admin = await requireSuperAdminSession();
  } catch {
    return NextResponse.json({ error: "Super admin access is required." }, { status: 403 });
  }
  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Expected file field with CSV or XLSX upload." }, { status: 400 });
  }

  const parsed = await parseBackfillFile(await file.arrayBuffer(), file.name);
  const rejected = [...parsed.errors];
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
    } else {
      rejected.push({
        rowNumber: item.rowNumber,
        message: result.validation.issues.map((issue) => issue.message).join(" "),
      });
    }
  }

  return NextResponse.json({
    imported,
    rejected,
    totalRows: parsed.totalRows,
  });
}
