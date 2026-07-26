import { NextResponse } from "next/server";
import { createAdminSession, verifyAdminCredentials } from "@/src/lib/auth/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const username = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");

  if (!verifyAdminCredentials(username, password)) {
    return NextResponse.redirect(new URL("/login?error=1", request.url), { status: 303 });
  }

  await createAdminSession(username.trim());
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
