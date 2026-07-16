import { DashboardShell } from "./dashboard-shell";
import { listDailyRecords } from "@/src/lib/capture/store";
import { getLatestSnapshot } from "@/src/lib/reporting/store";
import { loadSampleSnapshot } from "@/src/lib/reporting/sample";

export const metadata = {
  title: "Robo Silicon Operations Reporting",
  description:
    "Daily plant data capture, validation, dashboard snapshots, and PowerPoint report generation for Robo Silicon plants.",
};

export default async function Home() {
  const snapshot = (await getLatestSnapshot()) ?? (await loadSampleSnapshot());
  const records = await listDailyRecords();

  return <DashboardShell initialSnapshot={snapshot} initialRecords={records} />;
}
