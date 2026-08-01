import { DashboardShell } from "../dashboard-shell";
import { allowedPlantCodes, listPlantUsers, requireAdminSession } from "@/src/lib/auth/admin";
import { listDailyRecords } from "@/src/lib/capture/store";
import { getLatestSnapshot } from "@/src/lib/reporting/store";
import { loadSampleSnapshot } from "@/src/lib/reporting/sample";

export const metadata = {
  title: "Robo Operations Reporting",
  description:
    "Daily plant data capture, validation, dashboard snapshots, and PowerPoint report generation for Robo Silicon plants.",
};

export default async function OperationsPage() {
  const session = await requireAdminSession("/operations");
  const permittedPlants = allowedPlantCodes(session);
  const snapshot = (await getLatestSnapshot({ plantCode: permittedPlants?.[0] })) ?? (session.role === "SUPER_ADMIN" ? await loadSampleSnapshot() : null);
  const records = await listDailyRecords({ plantCode: permittedPlants?.[0] });
  const plantUsers = session.role === "SUPER_ADMIN" ? await listPlantUsers() : [];

  return (
    <DashboardShell
      allowedPlantCodes={permittedPlants}
      initialPlantUsers={plantUsers}
      initialSnapshot={snapshot}
      initialRecords={records}
      session={session}
    />
  );
}
