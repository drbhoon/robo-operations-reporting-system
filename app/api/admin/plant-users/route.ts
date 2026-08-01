import { NextResponse } from "next/server";
import {
  assignPlantUser,
  listPlantUsers,
  requireSuperAdminSession,
  revokePlantUser,
} from "@/src/lib/auth/admin";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireSuperAdminSession();
    return NextResponse.json({ plantUsers: await listPlantUsers() });
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
    const body = (await request.json()) as {
      email?: string;
      name?: string;
      plantCode?: string;
    };
    const result = await assignPlantUser({
      actor,
      email: body.email ?? "",
      name: body.name ?? "",
      plantCode: body.plantCode ?? "",
    });
    return NextResponse.json({
      plantUsers: await listPlantUsers(),
      temporaryPassword: result.temporaryPassword,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Plant user assignment failed." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireSuperAdminSession();
    const body = (await request.json()) as { accessId?: string };
    if (!body.accessId) {
      return NextResponse.json({ error: "Access id is required." }, { status: 400 });
    }
    await revokePlantUser({ accessId: body.accessId, actor });
    return NextResponse.json({ plantUsers: await listPlantUsers() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Plant user revocation failed." },
      { status: 400 },
    );
  }
}
