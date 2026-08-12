import { NextResponse } from "next/server";
import { canAccessPlant, requireAdminSession } from "@/src/lib/auth/admin";
import { deleteDailyRecord, getDailyRecord, listDailyRecords, saveDailyRecord } from "@/src/lib/capture/store";
import type { CapturePayload } from "@/src/lib/capture/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireAdminSession();
  const url = new URL(request.url);
  const requestedPlant = url.searchParams.get("plantCode") || undefined;
  const plantCode = session.role === "PLANT_USER" ? session.plantCode : requestedPlant;
  const records = await listDailyRecords({
    plantCode,
    startDate: url.searchParams.get("startDate") || undefined,
    endDate: url.searchParams.get("endDate") || undefined,
    status: url.searchParams.get("status") === "FINAL" ? "FINAL" : undefined,
  });

  return NextResponse.json({ records });
}

export async function DELETE(request: Request) {
  const session = await requireAdminSession();
  const body = (await request.json()) as { id?: string };
  if (!body.id) {
    return NextResponse.json({ error: "Daily record id is required." }, { status: 400 });
  }

  const record = await getDailyRecord(body.id);
  if (!record) {
    return NextResponse.json({ error: "Daily record was not found." }, { status: 404 });
  }
  if (!canAccessPlant(session, record.plantCode)) {
    return NextResponse.json({ error: `Access denied for plant ${record.plantCode}.` }, { status: 403 });
  }
  if (record.status === "FINAL" && session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Final records can be deleted only by ROBOOPS." }, { status: 403 });
  }

  try {
    const result = await deleteDailyRecord({
      actor: session.username,
      allowFinalDelete: session.role === "SUPER_ADMIN",
      id: body.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Daily record delete failed." },
      { status: 409 },
    );
  }
}

export async function POST(request: Request) {
  const session = await requireAdminSession();
  const body = (await request.json()) as {
    action?: "DRAFT" | "SUBMIT";
    record?: CapturePayload;
    actor?: string;
    allowFinalEdit?: boolean;
  };

  if (!body.record) {
    return NextResponse.json({ error: "Daily record payload is required." }, { status: 400 });
  }
  if (!canAccessPlant(session, body.record.plantCode)) {
    return NextResponse.json({ error: `Access denied for plant ${body.record.plantCode}.` }, { status: 403 });
  }

  try {
    const result = await saveDailyRecord({
      payload: body.record,
      action: body.action === "SUBMIT" ? "SUBMIT" : "DRAFT",
      actor: session.username,
      allowFinalEdit: session.role === "SUPER_ADMIN" && body.allowFinalEdit,
    });

    if (!result.accepted && body.action === "SUBMIT") {
      return NextResponse.json(
        {
          error: "Validation errors must be fixed before final submission.",
          record: result.record,
          validation: result.validation,
        },
        { status: 422 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Daily record save failed." },
      { status: 409 },
    );
  }
}
