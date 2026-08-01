import { NextResponse } from "next/server";
import { requireAdminSession } from "@/src/lib/auth/admin";
import { getLatestSnapshot } from "@/src/lib/reporting/store";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireAdminSession();
  const snapshot = await getLatestSnapshot({ plantCode: session.role === "PLANT_USER" ? session.plantCode : undefined });
  return NextResponse.json({ snapshot });
}
