import { NextResponse } from "next/server";
import { requireAdminSession } from "@/src/lib/auth/admin";
import { buildBackfillTemplateCsv } from "@/src/lib/capture/backfill";

export const runtime = "nodejs";

export async function GET() {
  await requireAdminSession();
  return new NextResponse(buildBackfillTemplateCsv(), {
    headers: {
      "Content-Disposition": 'attachment; filename="roboops-apr-jul-2026-backfill-template.csv"',
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
