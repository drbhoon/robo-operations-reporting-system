import { NextResponse } from "next/server";
import { requireAdminSession } from "@/src/lib/auth/admin";
import { getLatestSnapshot } from "@/src/lib/reporting/store";

export const runtime = "nodejs";

export async function GET() {
  await requireAdminSession();
  const snapshot = await getLatestSnapshot();
  return NextResponse.json({ snapshot });
}
