import { NextResponse } from "next/server";
import {
  assignReportUser,
  listReportUsers,
  reportUserLimit,
  requireSuperAdminSession,
  revokeReportUser,
} from "@/src/lib/auth/admin";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireSuperAdminSession();
    return NextResponse.json({ limit: reportUserLimit(), reportUsers: await listReportUsers() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Super admin access is required." },
      { status: 403 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireSuperAdminSession();
    const body = (await request.json()) as { email?: string; name?: string };
    const result = await assignReportUser({
      actor,
      email: body.email ?? "",
      name: body.name ?? "",
    });
    return NextResponse.json({
      limit: reportUserLimit(),
      reportUsers: await listReportUsers(),
      temporaryPassword: result.temporaryPassword,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Report user assignment failed." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireSuperAdminSession();
    const body = (await request.json()) as { userId?: string };
    if (!body.userId) {
      return NextResponse.json({ error: "Report user id is required." }, { status: 400 });
    }
    await revokeReportUser({ actor, userId: body.userId });
    return NextResponse.json({ limit: reportUserLimit(), reportUsers: await listReportUsers() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Report user revocation failed." },
      { status: 400 },
    );
  }
}
