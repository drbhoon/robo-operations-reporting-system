import { NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/src/lib/auth/admin";
import { buildBackfillTemplateCsv } from "@/src/lib/capture/backfill";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireSuperAdminSession();
  } catch {
    return NextResponse.json({ error: "Super admin access is required." }, { status: 403 });
  }
  return new NextResponse(buildBackfillTemplateCsv(), {
    headers: {
      "Content-Disposition": 'attachment; filename="roboops-apr-jul-2026-backfill-template.csv"',
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
