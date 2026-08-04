import { NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/src/lib/auth/admin";
import { listPlantOperationalConfigs, updatePlantOperationalConfig } from "@/src/lib/capture/plant-config-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireSuperAdminSession();
    return NextResponse.json({ plantConfigs: await listPlantOperationalConfigs() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Super admin access is required." },
      { status: 403 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await requireSuperAdminSession();
    const body = (await request.json()) as {
      electricLoaderEnabled?: boolean;
      plantCode?: string;
    };
    if (!body.plantCode || typeof body.electricLoaderEnabled !== "boolean") {
      return NextResponse.json({ error: "Plant and electric loader setting are required." }, { status: 400 });
    }
    return NextResponse.json({
      plantConfigs: await updatePlantOperationalConfig({
        electricLoaderEnabled: body.electricLoaderEnabled,
        plantCode: body.plantCode,
      }),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Plant configuration update failed." },
      { status: 400 },
    );
  }
}
