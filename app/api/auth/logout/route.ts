import { NextResponse } from "next/server";
import { clearAdminSession } from "@/src/lib/auth/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  await clearAdminSession();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
