import { NextResponse } from "next/server";
import { getSnapshot } from "@/src/lib/reporting/store";
import { loadSampleSnapshot } from "@/src/lib/reporting/sample";
import { generatePowerPoint } from "@/src/lib/reporting/ppt";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ snapshotId: string }> },
) {
  const { snapshotId } = await context.params;
  const sample = await loadSampleSnapshot();
  const snapshot = (await getSnapshot(snapshotId)) ?? (sample?.id === snapshotId ? sample : null);

  if (!snapshot) {
    return NextResponse.json({ error: "Snapshot not found." }, { status: 404 });
  }

  if (!snapshot.validation.valid) {
    return NextResponse.json(
      {
        error: "Snapshot contains validation errors and cannot generate a locked report.",
        issues: snapshot.validation.issues.filter((issue) => issue.severity === "ERROR"),
      },
      { status: 409 },
    );
  }

  const buffer = await generatePowerPoint(snapshot);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${snapshot.plantCode}-${snapshot.period.start}-${snapshot.period.end}.pptx"`,
    },
  });
}
