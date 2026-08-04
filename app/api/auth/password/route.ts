import { NextResponse } from "next/server";
import { changeOwnPassword, requireAdminSession } from "@/src/lib/auth/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = (await request.json()) as {
      currentPassword?: string;
      newPassword?: string;
    };
    await changeOwnPassword({
      currentPassword: body.currentPassword ?? "",
      newPassword: body.newPassword ?? "",
      session,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Password change failed." },
      { status: 400 },
    );
  }
}
