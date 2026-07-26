import { NextResponse } from "next/server";
import { requireAdminSession } from "@/src/lib/auth/admin";
import { listDailyRecords, saveDailyRecord } from "@/src/lib/capture/store";
import type { CapturePayload } from "@/src/lib/capture/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  await requireAdminSession();
  const url = new URL(request.url);
  const records = await listDailyRecords({
    plantCode: url.searchParams.get("plantCode") || undefined,
    startDate: url.searchParams.get("startDate") || undefined,
    endDate: url.searchParams.get("endDate") || undefined,
    status: url.searchParams.get("status") === "FINAL" ? "FINAL" : undefined,
  });

  return NextResponse.json({ records });
}

export async function POST(request: Request) {
  const admin = await requireAdminSession();
  const body = (await request.json()) as {
    action?: "DRAFT" | "SUBMIT";
    record?: CapturePayload;
    actor?: string;
    allowFinalEdit?: boolean;
  };

  if (!body.record) {
    return NextResponse.json({ error: "Daily record payload is required." }, { status: 400 });
  }

  try {
    const result = await saveDailyRecord({
      payload: body.record,
      action: body.action === "SUBMIT" ? "SUBMIT" : "DRAFT",
      actor: body.actor || admin.username,
      allowFinalEdit: body.allowFinalEdit,
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
