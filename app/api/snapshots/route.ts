import { NextResponse } from "next/server";
import { getLatestSnapshot } from "@/src/lib/reporting/store";

export const runtime = "nodejs";

export async function GET() {
  const snapshot = await getLatestSnapshot();
  return NextResponse.json({ snapshot });
}
