import { NextResponse } from "next/server";
import { listDailyRecords } from "@/src/lib/capture/store";
import { buildSnapshotFromDailyRecords } from "@/src/lib/capture/snapshot";
import { saveSnapshot } from "@/src/lib/reporting/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    plantCode?: string;
    startDate?: string;
    endDate?: string;
    reportType?: "DAILY" | "WEEKLY" | "MONTHLY";
    requiredPhotoCategories?: string[];
  };

  if (!body.plantCode || !body.startDate || !body.endDate) {
    return NextResponse.json(
      { error: "Plant, start date and end date are required to build a snapshot." },
      { status: 400 },
    );
  }

  const records = await listDailyRecords({
    plantCode: body.plantCode,
    startDate: body.startDate,
    endDate: body.endDate,
    status: "FINAL",
  });

  try {
    const snapshot = await buildSnapshotFromDailyRecords({
      records,
      plantCode: body.plantCode,
      reportType: body.reportType || "WEEKLY",
      requiredPhotoCategories: body.requiredPhotoCategories,
    });
    await saveSnapshot(snapshot);

    return NextResponse.json({ snapshot });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Snapshot generation failed." },
      { status: 422 },
    );
  }
}
