import { NextResponse } from "next/server";
import { parseGirWorkbook } from "@/src/lib/reporting/excel-parser";
import { saveSnapshot } from "@/src/lib/reporting/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const workbook = form.get("workbook");

  if (!(workbook instanceof File)) {
    return NextResponse.json({ error: "Expected workbook file field." }, { status: 400 });
  }

  const snapshot = await parseGirWorkbook(await workbook.arrayBuffer(), workbook.name);
  await saveSnapshot(snapshot);

  return NextResponse.json({ snapshot });
}
