import sampleSnapshot from "@/data/sample-gir-may2026-snapshot.json";
import type { ReportSnapshot } from "./types";

export async function loadSampleSnapshot(): Promise<ReportSnapshot | null> {
  return sampleSnapshot as ReportSnapshot;
}
