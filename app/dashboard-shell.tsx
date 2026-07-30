"use client";

import {
  Bar,
  Doughnut,
  Line,
  Scatter,
} from "react-chartjs-2";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import {
  AlertTriangle,
  ClipboardCheck,
  Database,
  Download,
  FileUp,
  Lock,
  Presentation,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import type { AppSession, PlantUserSummary, UserRole } from "@/src/lib/auth/admin";
import { electricLoaderEnabledFor, type PlantOperationalConfig } from "@/src/lib/capture/plant-config-client";
import { calculateDailyRecord, domesticMeterMfFor, materializeCalculatedFields, mirroredLoaderDispatchPlant } from "@/src/lib/capture/calculations";
import {
  CAPTURE_PRODUCTS,
  LOSS_CATEGORIES,
  PLANT_CONFIGS,
  PHOTO_CATEGORIES,
  type CapturePayload,
  type DailyPlantRecord,
  type EvidencePhoto,
  type LossCategory,
  type LossReason,
  type PhotoCategory,
} from "@/src/lib/capture/types";
import { validateCaptureRecord } from "@/src/lib/capture/validation";
import type { ReportSnapshot } from "@/src/lib/reporting/types";

function chartCompactNumber(value: number) {
  if (Math.abs(value) >= 100000) return `${Math.round(value / 1000)}k`;
  if (Math.abs(value) >= 10000) return `${Math.round(value / 1000)}k`;
  if (Math.abs(value) >= 1000) return `${Math.round(value / 100) / 10}k`;
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(value);
}

const valueLabelPlugin = {
  id: "valueLabel",
  afterDatasetsDraw(chart: ChartJS) {
    const { ctx } = chart;
    ctx.save();
    ctx.font = "11px var(--font-mono), monospace";
    ctx.fillStyle = "#183153";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      meta.data.forEach((element, index) => {
        const raw = dataset.data[index];
        const value = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(value) || value === 0) return;
        const position = element.tooltipPosition(true);
        ctx.fillText(chartCompactNumber(value), position.x, position.y - 4);
      });
    });
    ctx.restore();
  },
};

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  valueLabelPlugin,
);

type Props = {
  allowedPlantCodes?: string[];
  initialPlantConfigs: PlantOperationalConfig[];
  initialPlantUsers: PlantUserSummary[];
  initialSnapshot: ReportSnapshot | null;
  initialRecords: DailyPlantRecord[];
  session: AppSession;
};

type WorkspaceTab = "capture" | "dashboard" | "reports" | "access";
type DashboardView = "daily" | "weekly" | "monthly" | "trends" | "exceptions";
type SnapshotDay = ReportSnapshot["daily"][number];
type BasisRow = {
  label: "Daily" | "Weekly" | "MTD";
  production: number;
  jawTph: number;
  coneTph: number;
  vsiTph: number;
  unitsPerMt: number;
};
type LoaderBasisRow = {
  label: "Daily" | "Weekly" | "MTD";
  runningHours: number;
  litresPerMt: number;
  tph: number;
  dispatchMt: number;
};
type ElectricLoaderBasisRow = {
  dispatchMt: number;
  kwhUnits: number;
  kvahUnits: number;
  label: "Daily" | "Weekly" | "MTD";
  runningHours: number;
  tph: number;
  unitsPerMt: number;
};
type PeriodSummaryRow = {
  achievementPct: number;
  dispatch: number;
  end: string;
  jawTph: number;
  kvahPerMt: number;
  label: string;
  loaderLitresPerMt: number;
  lossHours: number;
  production: number;
  start: string;
  target: number;
  vsiTph: number;
};
type CopProjectionRow = {
  label: string;
  value: number;
  suffix?: string;
};

const fmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1, style: "percent" });

export function DashboardShell({ allowedPlantCodes, initialPlantConfigs, initialPlantUsers, initialSnapshot, initialRecords, session }: Props) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("capture");
  const [dashboardView, setDashboardView] = useState<DashboardView>("daily");
  const [records, setRecords] = useState(initialRecords);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const plantOptions = useMemo(() => {
    const allowed = new Set(allowedPlantCodes ?? PLANT_CONFIGS.map((plant) => plant.code));
    return PLANT_CONFIGS.filter((plant) => allowed.has(plant.code));
  }, [allowedPlantCodes]);
  const [form, setForm] = useState<CapturePayload>(() => initialPayload(initialRecords, plantOptions[0]?.code));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [plantConfigs, setPlantConfigs] = useState(initialPlantConfigs);
  const [plantUsers, setPlantUsers] = useState(initialPlantUsers);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [backfillFileName, setBackfillFileName] = useState("");
  const [startDate, setStartDate] = useState(initialSnapshot?.period.start ?? todayIso());
  const [endDate, setEndDate] = useState(initialSnapshot?.period.end ?? todayIso());
  const [reportPlantCode, setReportPlantCode] = useState(initialSnapshot?.plantCode ?? plantOptions[0]?.code ?? initialPayload(initialRecords, plantOptions[0]?.code).plantCode);
  const [reportType, setReportType] = useState<"DAILY" | "WEEKLY" | "MONTHLY">("WEEKLY");
  const fileRef = useRef<HTMLInputElement>(null);
  const backfillFileRef = useRef<HTMLInputElement>(null);

  const previewRecord = useMemo(() => {
    const materializedForm = materializeCalculatedFields(form);
    const calculations = calculateDailyRecord(materializedForm);
    const draft: DailyPlantRecord = {
      ...materializedForm,
      id: materializedForm.id || "preview",
      status: "DRAFT",
      reviewStatus: "OPEN",
      calculations,
      validation: { valid: false, issues: [] },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const validation = validateCaptureRecord(draft);
    return {
      ...draft,
      validation: { valid: validation.valid, issues: validation.issues },
      reviewStatus: validation.exceptionWarnings.length ? "REVIEW_REQUIRED" : "OPEN",
    };
  }, [form]);

  const exceptionRecords = records.filter((record) => record.validation.issues.length > 0 || record.reviewStatus === "REVIEW_REQUIRED");

  const visibleDays = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.daily.filter((day) => {
      if (startDate && day.date < startDate) return false;
      if (endDate && day.date > endDate) return false;
      return true;
    });
  }, [endDate, snapshot, startDate]);

  const totals = useMemo(() => {
    const production = sum(visibleDays.map((d) => d.production.mt));
    const target = sum(visibleDays.map((d) => d.targetMt));
    const dispatch = sum(visibleDays.map((d) => d.dispatch.totalMt));
    const diesel = sum(visibleDays.map((d) => d.loader.dieselLitres));
    const jawTph = average(visibleDays.map((d) => d.machine.jawTph));
    const vsiTph = average(visibleDays.map((d) => d.machine.vsiTph));
    const unitsMt = average(visibleDays.map((d) => d.electrical.unitsPerMt));

    return {
      production,
      target,
      dispatch,
      diesel,
      achievement: target ? production / target : 0,
      dispatchRatio: production ? dispatch / production : 0,
      jawTph,
      vsiTph,
      unitsMt,
    };
  }, [visibleDays]);

  async function saveRecord(action: "DRAFT" | "SUBMIT") {
    setBusy(true);
    setStatus(action === "DRAFT" ? "Saving draft..." : "Validating and submitting final record...");

    try {
      const response = await fetch("/api/daily-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, record: { ...form, submittedBy: session.username } }),
      });
      const body = (await response.json()) as {
        record?: DailyPlantRecord;
        records?: DailyPlantRecord[];
        error?: string;
        validation?: { issues: Array<{ message: string }> };
      };
      if (!response.ok || !body.record) {
        throw new Error(body.error ?? body.validation?.issues?.[0]?.message ?? "Record save failed");
      }
      setRecords((current) => upsertRecord(current, body.record!));
      setForm(recordToPayload(body.record));
      setStatus(
        action === "DRAFT"
          ? "Draft saved with audit trail."
          : "Final daily record submitted. It can now feed dashboard snapshots.",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Record save failed");
    } finally {
      setBusy(false);
    }
  }

  async function importWorkbook() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setStatus("Choose the GIR daily report workbook first.");
      return;
    }

    setBusy(true);
    setStatus("Importing workbook for reference reconciliation...");
    const upload = new FormData();
    upload.append("workbook", file);

    try {
      const response = await fetch("/api/import", { method: "POST", body: upload });
      const body = (await response.json()) as { snapshot?: ReportSnapshot; error?: string };
      if (!response.ok || !body.snapshot) throw new Error(body.error ?? "Import failed");
      setSnapshot(body.snapshot);
      setStartDate(body.snapshot.period.start);
      setEndDate(body.snapshot.period.end);
      setStatus("Reference Excel snapshot imported. Use it only for reconciliation, not daily operations.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadBackfill() {
    const file = backfillFileRef.current?.files?.[0];
    if (!file) {
      setStatus("Choose the completed Apr-Jul backfill CSV or XLSX first.");
      return;
    }

    setBusy(true);
    setStatus("Uploading historical daily records...");
    const upload = new FormData();
    upload.append("file", file);

    try {
      const response = await fetch("/api/backfill-upload", { method: "POST", body: upload });
      const body = (await response.json()) as {
        error?: string;
        imported?: number;
        rejected?: Array<{ rowNumber: number; message: string }>;
        totalRows?: number;
      };
      if (!response.ok) throw new Error(body.error ?? "Backfill upload failed");

      const recordsResponse = await fetch("/api/daily-records");
      const recordsBody = (await recordsResponse.json()) as { records?: DailyPlantRecord[] };
      if (recordsBody.records) setRecords(recordsBody.records);

      const rejected = body.rejected ?? [];
      const firstError = rejected[0] ? ` First issue: row ${rejected[0].rowNumber}: ${rejected[0].message}` : "";
      setStatus(`Backfill processed ${body.totalRows ?? 0} rows. Imported ${body.imported ?? 0}; rejected ${rejected.length}.${firstError}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Backfill upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function buildSnapshot() {
    setBusy(true);
    setStatus("Building locked report snapshot from validated daily records...");

    try {
      const response = await fetch("/api/snapshots/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plantCode: reportPlantCode,
          startDate,
          endDate,
          reportType,
          requiredPhotoCategories: PHOTO_CATEGORIES,
        }),
      });
      const body = (await response.json()) as { snapshot?: ReportSnapshot; error?: string };
      if (!response.ok || !body.snapshot) throw new Error(body.error ?? "Snapshot build failed");
      setSnapshot(body.snapshot);
      setStatus(`Locked snapshot ${body.snapshot.version} is ready for dashboard and PPT.`);
      setActiveTab("dashboard");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Snapshot build failed");
    } finally {
      setBusy(false);
    }
  }

  async function generatePpt() {
    if (!snapshot) return;
    setBusy(true);
    setStatus("Generating PowerPoint from locked snapshot...");

    try {
      const response = await fetch(`/api/reports/${snapshot.id}`, { method: "POST" });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Report generation failed");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${snapshot.plantCode}-${snapshot.period.start}-${snapshot.period.end}.pptx`;
      link.click();
      URL.revokeObjectURL(url);
      setStatus("PowerPoint generated from the locked snapshot.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Report generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function assignPlantAccess(input: { email: string; name: string; plantCode: string }) {
    setBusy(true);
    setTemporaryPassword(null);
    setStatus("Assigning plant access...");
    try {
      const response = await fetch("/api/admin/plant-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = (await response.json()) as {
        error?: string;
        plantUsers?: PlantUserSummary[];
        temporaryPassword?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "Plant user assignment failed");
      if (body.plantUsers) setPlantUsers(body.plantUsers);
      setTemporaryPassword(body.temporaryPassword ?? null);
      setStatus(`Plant access assigned for ${input.plantCode}. Share the temporary password once.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Plant user assignment failed");
    } finally {
      setBusy(false);
    }
  }

  async function revokePlantAccess(accessId: string) {
    setBusy(true);
    setTemporaryPassword(null);
    setStatus("Revoking plant access...");
    try {
      const response = await fetch("/api/admin/plant-users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessId }),
      });
      const body = (await response.json()) as { error?: string; plantUsers?: PlantUserSummary[] };
      if (!response.ok) throw new Error(body.error ?? "Plant user revocation failed");
      if (body.plantUsers) setPlantUsers(body.plantUsers);
      setStatus("Plant access revoked. Existing sessions for that user are invalidated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Plant user revocation failed");
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(input: { currentPassword: string; newPassword: string }) {
    setBusy(true);
    setStatus("Changing password...");
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Password change failed");
      setStatus("Password changed successfully.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Password change failed");
    } finally {
      setBusy(false);
    }
  }

  async function updatePlantElectricLoader(plantCode: string, electricLoaderEnabled: boolean) {
    setBusy(true);
    setStatus("Updating plant configuration...");
    try {
      const response = await fetch("/api/admin/plant-configs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ electricLoaderEnabled, plantCode }),
      });
      const body = (await response.json()) as { error?: string; plantConfigs?: PlantOperationalConfig[] };
      if (!response.ok) throw new Error(body.error ?? "Plant configuration update failed");
      if (body.plantConfigs) setPlantConfigs(body.plantConfigs);
      setStatus("Plant electric loader configuration updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Plant configuration update failed");
    } finally {
      setBusy(false);
    }
  }

  const labels = visibleDays.map((d) => d.label);
  const productMix = aggregateProducts(visibleDays);
  const lossBuckets = aggregateLosses(visibleDays);

  return (
    <main className="app-shell">
      <section className="topbar">
        <div className="brand-block">
          <div className="logo-panel">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="Robo Silicon" src="/robo-logo.png" />
          </div>
          <div>
            <p className="eyebrow">Robo Silicon operations</p>
            <h1>Daily plant reality capture before reporting</h1>
            <p className="subtitle">
              Operators capture plant data once. Validation blocks weak data before it reaches
              dashboards, locked snapshots, PowerPoint, PDF, or management summaries.
            </p>
          </div>
        </div>
        <div className="toolbar">
          <span className="admin-chip">{session.role === "SUPER_ADMIN" ? session.username : `${session.name} | ${session.plantCode}`}</span>
          <button className={tabClass(activeTab, "capture")} onClick={() => setActiveTab("capture")}>
            <ClipboardCheck size={16} />
            Capture
          </button>
          <button className={tabClass(activeTab, "dashboard")} onClick={() => setActiveTab("dashboard")}>
            <Database size={16} />
            Dashboard
          </button>
          <button className={tabClass(activeTab, "reports")} onClick={() => setActiveTab("reports")}>
            <Presentation size={16} />
            Reports
          </button>
          {session.role === "SUPER_ADMIN" ? (
            <button className={tabClass(activeTab, "access")} onClick={() => setActiveTab("access")}>
              <ShieldCheck size={16} />
              Access
            </button>
          ) : null}
          <a className="btn" href="/api/auth/logout">
            Sign out
          </a>
        </div>
      </section>

      <PasswordPanel busy={busy} onChangePassword={changePassword} />

      {activeTab === "capture" ? (
        <CaptureWorkspace
          busy={busy}
          electricLoaderEnabled={electricLoaderEnabledFor(plantConfigs, form.plantCode) || form.electricLoader.enabled}
          form={form}
          plantOptions={plantOptions}
          previewRecord={previewRecord}
          records={records}
          setForm={setForm}
          session={session}
          saveDraft={() => saveRecord("DRAFT")}
          submitFinal={() => saveRecord("SUBMIT")}
        />
      ) : null}

      {activeTab === "dashboard" ? (
        <DashboardWorkspace
          dashboardView={dashboardView}
          exceptionRecords={exceptionRecords}
          labels={labels}
          lossBuckets={lossBuckets}
          productMix={productMix}
          setDashboardView={setDashboardView}
          snapshot={snapshot}
          totals={totals}
          visibleDays={visibleDays}
        />
      ) : null}

      {activeTab === "reports" ? (
        <ReportsWorkspace
          backfillFileRef={backfillFileRef}
          backfillFileName={backfillFileName}
          busy={busy}
          buildSnapshot={buildSnapshot}
          endDate={endDate}
          fileRef={fileRef}
          generatePpt={generatePpt}
          importWorkbook={importWorkbook}
          plantCode={reportPlantCode}
          plantOptions={plantOptions}
          reportType={reportType}
          setEndDate={setEndDate}
          setPlantCode={setReportPlantCode}
          setReportType={setReportType}
          setStartDate={setStartDate}
          snapshot={snapshot}
          startDate={startDate}
          status={status}
          onBackfillFileSelected={(fileName) => {
            setBackfillFileName(fileName);
            setStatus(fileName ? `Selected ${fileName}. Press Upload final data to import.` : null);
          }}
          uploadBackfill={uploadBackfill}
          userRole={session.role}
        />
      ) : null}

      {activeTab === "access" && session.role === "SUPER_ADMIN" ? (
        <AccessWorkspace
          busy={busy}
          onAssign={assignPlantAccess}
          onConfigChange={updatePlantElectricLoader}
          onRevoke={revokePlantAccess}
          plantConfigs={plantConfigs}
          plantUsers={plantUsers}
          temporaryPassword={temporaryPassword}
        />
      ) : null}

      {status ? <p className="status-line">{status}</p> : null}
    </main>
  );
}

function CaptureWorkspace({
  busy,
  electricLoaderEnabled,
  form,
  plantOptions,
  previewRecord,
  records,
  setForm,
  session,
  saveDraft,
  submitFinal,
}: {
  busy: boolean;
  electricLoaderEnabled: boolean;
  form: CapturePayload;
  plantOptions: Array<(typeof PLANT_CONFIGS)[number]>;
  previewRecord: DailyPlantRecord;
  records: DailyPlantRecord[];
  setForm: (updater: CapturePayload | ((current: CapturePayload) => CapturePayload)) => void;
  session: AppSession;
  saveDraft: () => void;
  submitFinal: () => void;
}) {
  return (
    <section className="capture-layout">
      <div className="capture-form">
        <Section title="Plant and date" meta="Mandatory" defaultOpen>
          <div className="form-grid four">
            <SelectField
              disabled={session.role === "PLANT_USER"}
              label="Plant"
              value={form.plantCode}
              options={plantOptions.map((plant) => ({ label: plant.name, value: plant.code }))}
              onChange={(value) => setPlant(setForm, value, records)}
            />
            <TextField disabled label="Plant name" value={form.plantName} onChange={(value) => setField(setForm, "plantName", value)} />
            <TextField label="Date" type="date" value={form.date} onChange={(value) => setDateWithCarryForward(setForm, records, value)} />
            <ReadOnlyText label="Date display" value={formatDisplayDate(form.date)} />
            <NumberField label="Target MT" value={form.targetMt} onChange={(value) => setField(setForm, "targetMt", value)} />
          </div>
        </Section>

        <Section title="Opening parameters" meta="Enter before day closing" defaultOpen>
          <h3 className="section-subtitle">Opening stock</h3>
          <ProductGrid values={form.openingStock} onChange={(product, value) => setProduct(setForm, "openingStock", product, value)} />
          <ProductTotal label="Opening stock total" values={form.openingStock} />
          <h3 className="section-subtitle">Monthly opening book stock</h3>
          <ProductGrid values={form.bookStock.monthlyOpening} onChange={(product, value) => setBookStock(setForm, "monthlyOpening", product, value)} />
          <ProductTotal label="Monthly opening book stock total" values={form.bookStock.monthlyOpening} />
          <div className="form-grid four">
            <NumberField label="Opening kWh" value={form.electrical.openingKwh} onChange={(value) => setNested(setForm, "electrical", "openingKwh", value)} />
            <NumberField label="Opening KVAH" value={form.electrical.openingKvah} onChange={(value) => setNested(setForm, "electrical", "openingKvah", value)} />
            <NumberField label="Domestic opening kWh" value={form.electrical.domestic.openingKwh} onChange={(value) => setDomesticElectrical(setForm, "openingKwh", value)} />
            <NumberField label="Jaw opening HM" value={form.equipmentHourMeters.jaw.opening} onChange={(value) => setEquipmentMeter(setForm, "jaw", "opening", value)} />
            <NumberField label="Cone opening HM" value={form.equipmentHourMeters.cone.opening} onChange={(value) => setEquipmentMeter(setForm, "cone", "opening", value)} />
            <NumberField label="VSI opening HM" value={form.equipmentHourMeters.vsi.opening} onChange={(value) => setEquipmentMeter(setForm, "vsi", "opening", value)} />
            <NumberField label="Loader opening HM" value={form.loader.hourMeter.opening} onChange={(value) => setLoaderHourMeter(setForm, "opening", value)} />
            {electricLoaderEnabled ? <NumberField label="Ele loader opening meter" value={form.electricLoader.meter.opening} onChange={(value) => setElectricLoaderReading(setForm, "meter", "opening", value)} /> : null}
            {electricLoaderEnabled ? <NumberField label="Ele loader opening KWH" value={form.electricLoader.kwh.opening} onChange={(value) => setElectricLoaderReading(setForm, "kwh", "opening", value)} /> : null}
            {electricLoaderEnabled ? <NumberField label="Ele loader opening KVAH" value={form.electricLoader.kvah.opening} onChange={(value) => setElectricLoaderReading(setForm, "kvah", "opening", value)} /> : null}
          </div>
        </Section>

        <Section title="Production and product mix" meta="Production must equal mix total">
          <div className="form-grid four">
            <NumberField label="Production MT" value={form.productionMt} onChange={(value) => setField(setForm, "productionMt", value)} />
            <NumberField label="OB soft rock MT" value={form.overburden.softRockMt} onChange={(value) => setOverburden(setForm, "softRockMt", value)} />
            <NumberField label="OB hard rock MT" value={form.overburden.hardRockMt} onChange={(value) => setOverburden(setForm, "hardRockMt", value)} />
            <ReadOnlyMetric label="Product mix total" value={previewRecord.calculations.productMixTotal} suffix="MT" />
            <ReadOnlyMetric label="Product mix total" value={previewRecord.calculations.productMixPercentageTotal} suffix="%" />
          </div>
          <h3 className="section-subtitle">Product mix percentage entry</h3>
          <ProductGrid suffix="%" values={form.productMixPercentages} onChange={(product, value) => setProduct(setForm, "productMixPercentages", product, value)} />
          <h3 className="section-subtitle">Calculated product quantity</h3>
          <ProductReadOnlyGrid values={previewRecord.productMix} />
        </Section>

        <Section title="Dispatch and calculated stock" meta="Closing = opening + production - dispatch + adjustment">
          <h3 className="section-subtitle">Dispatch</h3>
          <ProductGrid values={form.dispatch} onChange={(product, value) => setDispatchProduct(setForm, form.plantCode, product, value)} />
          <ProductTotal label="Dispatch total" values={form.dispatch} />
          <h3 className="section-subtitle">Stock adjustments / other transactions</h3>
          <ProductGrid values={form.stockAdjustments} onChange={(product, value) => setProduct(setForm, "stockAdjustments", product, value)} />
          <ProductTotal label="Stock adjustment total" values={form.stockAdjustments} />
          <label className="text-area-field">
            <span>Stock adjustment comments</span>
            <textarea value={form.stockAdjustmentComment} onChange={(event) => setField(setForm, "stockAdjustmentComment", event.target.value)} />
          </label>
          <h3 className="section-subtitle">Calculated closing physical stock</h3>
          <ProductReadOnlyGrid values={previewRecord.calculations.calculatedClosingStock} />
          <ProductTotal label="Closing physical stock total" values={previewRecord.calculations.calculatedClosingStock} />
          <h3 className="section-subtitle">Calculated book stock</h3>
          <ProductReadOnlyGrid values={previewRecord.calculations.calculatedBookStock} />
          <ProductTotal label="Calculated book stock total" values={previewRecord.calculations.calculatedBookStock} />
        </Section>

        <Section title="Equipment hour meter readings and TPH" meta="Running hours and TPH auto-calculated">
          <div className="form-grid three">
            <NumberField label="Jaw closing HM" value={form.equipmentHourMeters.jaw.closing} onChange={(value) => setEquipmentMeter(setForm, "jaw", "closing", value)} />
            <NumberField label="Cone closing HM" value={form.equipmentHourMeters.cone.closing} onChange={(value) => setEquipmentMeter(setForm, "cone", "closing", value)} />
            <NumberField label="VSI closing HM" value={form.equipmentHourMeters.vsi.closing} onChange={(value) => setEquipmentMeter(setForm, "vsi", "closing", value)} />
            <ReadOnlyMetric label="Jaw running hrs" value={previewRecord.calculations.equipmentRunningHours.jaw} />
            <ReadOnlyMetric label="Cone running hrs" value={previewRecord.calculations.equipmentRunningHours.cone} />
            <ReadOnlyMetric label="VSI running hrs" value={previewRecord.calculations.equipmentRunningHours.vsi} />
            <ReadOnlyMetric label="Jaw TPH" value={previewRecord.calculations.equipmentTph.jaw} />
            <ReadOnlyMetric label="Cone TPH" value={previewRecord.calculations.equipmentTph.cone} />
            <ReadOnlyMetric label="VSI TPH" value={previewRecord.calculations.equipmentTph.vsi} />
          </div>
        </Section>

        <Section title="Plant available hours, stoppages and loss hours" meta="Hours must reconcile">
          <div className="form-grid four">
            <HourField label="Available hours" value={form.plantHours.available} onChange={(value) => setNested(setForm, "plantHours", "available", value)} />
            <HourField label="Production hours" value={form.plantHours.production} onChange={(value) => setNested(setForm, "plantHours", "production", value)} />
            <HourField label="Scheduled stoppage" value={form.plantHours.scheduledStoppage} onChange={(value) => setNested(setForm, "plantHours", "scheduledStoppage", value)} />
            <ReadOnlyMetric format="hours" label="Loss hours" value={previewRecord.plantHours.loss} />
          </div>
          <LossDetailGrid form={form} setForm={setForm} />
        </Section>

        <Section title="Electrical readings and units" meta="KVAH/MT auto-calculated">
          <div className="form-grid four">
            <NumberField label="CMD" value={form.electrical.cmd} onChange={(value) => setNested(setForm, "electrical", "cmd", value)} />
            <NumberField label="Closing kWh" value={form.electrical.closingKwh} onChange={(value) => setNested(setForm, "electrical", "closingKwh", value)} />
            <NumberField disabled label="kWh MF" value={previewRecord.electrical.kwhMultiplyingFactor} onChange={(value) => setNested(setForm, "electrical", "kwhMultiplyingFactor", value)} />
            <ReadOnlyMetric label="Actual kWh units" value={previewRecord.calculations.electricalUnitsConsumed} />
            <NumberField label="Closing KVAH" value={form.electrical.closingKvah} onChange={(value) => setNested(setForm, "electrical", "closingKvah", value)} />
            <NumberField disabled label="KVAH MF" value={previewRecord.electrical.kvahMultiplyingFactor} onChange={(value) => setNested(setForm, "electrical", "kvahMultiplyingFactor", value)} />
            <ReadOnlyMetric label="KVAH units" value={previewRecord.calculations.kvahUnitsConsumed} />
            <ReadOnlyMetric format="powerFactor" label="Power factor" value={previewRecord.calculations.powerFactor} />
            <ReadOnlyMetric label="Electricity cost on KVAH" value={previewRecord.calculations.electricalCost} prefix="Rs" />
            <ReadOnlyMetric label="Production KVAH units" value={previewRecord.calculations.productionPowerUnits} />
            <ReadOnlyMetric label="Production KVAH / MT" value={previewRecord.calculations.unitsPerMt} />
          </div>
          <h3 className="section-subtitle">Domestic power consumption</h3>
          <div className="form-grid four">
            <NumberField label="Domestic closing kWh" value={form.electrical.domestic.closingKwh} onChange={(value) => setDomesticElectrical(setForm, "closingKwh", value)} />
            <NumberField disabled label="Domestic MF" value={domesticMeterMfFor(form.plantCode || form.plantName)} onChange={(value) => setDomesticElectrical(setForm, "multiplyingFactor", value)} />
            <ReadOnlyMetric label="Domestic units" value={previewRecord.calculations.domesticPowerUnits} />
            <ReadOnlyMetric label="Domestic units / MT" value={previewRecord.calculations.domesticUnitsPerMt} />
            <ReadOnlyMetric label="Combined KVAH units" value={previewRecord.calculations.combinedPowerUnits} />
            <ReadOnlyMetric label="Combined KVAH / MT" value={previewRecord.calculations.combinedUnitsPerMt} />
          </div>
        </Section>

        <Section title="Loader" meta="Hour meter, other works, diesel and TPH">
          <div className="form-grid four">
            <NumberField label="Loader closing HM" value={form.loader.hourMeter.closing} onChange={(value) => setLoaderHourMeter(setForm, "closing", value)} />
            <NumberField label="Other works hours" value={form.loader.otherWorksHours} onChange={(value) => setNested(setForm, "loader", "otherWorksHours", value)} />
            <ReadOnlyMetric label="Loader running hrs" value={previewRecord.calculations.loaderRunningHours} />
            <ReadOnlyMetric label="Production loader hrs" value={previewRecord.calculations.loaderProductionHours} />
            <NumberField label="Loader diesel L" value={form.loader.dieselLitres} onChange={(value) => setNested(setForm, "loader", "dieselLitres", value)} />
            <NumberField disabled label="Frozen diesel rate" value={previewRecord.loader.dieselRate} onChange={(value) => setNested(setForm, "loader", "dieselRate", value)} />
            <NumberField disabled label="Diesel variance rate" value={previewRecord.loader.dieselVarianceRate} onChange={(value) => setNested(setForm, "loader", "dieselVarianceRate", value)} />
            <NumberField
              disabled={mirroredLoaderDispatchPlant(form.plantCode || form.plantName)}
              label={mirroredLoaderDispatchPlant(form.plantCode || form.plantName) ? "Loader dispatch MT auto" : "Loader dispatch MT"}
              value={previewRecord.loader.dispatchMt}
              onChange={(value) => setNested(setForm, "loader", "dispatchMt", value)}
            />
            <CheckboxField label="Include diesel variance" checked={form.loader.includeDieselVariance} onChange={(value) => setLoaderFlag(setForm, "includeDieselVariance", value)} />
            <ReadOnlyMetric label="Loader TPH" value={previewRecord.calculations.loaderTph} />
            <ReadOnlyMetric label="Loader L / MT" value={previewRecord.calculations.loaderLitresPerMt} />
            <ReadOnlyMetric label="Diesel cost" value={previewRecord.calculations.loaderDieselCost} prefix="Rs" />
            <ReadOnlyMetric label="Diesel variance" value={previewRecord.calculations.loaderDieselVarianceCost} prefix="Rs" />
          </div>
        </Section>

        {electricLoaderEnabled ? (
          <Section title="Electric loader" meta="Plant-wise configurable">
            <div className="form-grid four">
              <NumberField label="Closing meter reading" value={form.electricLoader.meter.closing} onChange={(value) => setElectricLoaderReading(setForm, "meter", "closing", value)} />
              <ReadOnlyMetric label="Running hours" value={previewRecord.calculations.electricLoaderRunningHours} />
              <NumberField label="Closing KWH reading" value={form.electricLoader.kwh.closing} onChange={(value) => setElectricLoaderReading(setForm, "kwh", "closing", value)} />
              <ReadOnlyMetric label="KWH units" value={previewRecord.calculations.electricLoaderKwhUnits} />
              <NumberField label="Closing KVAH reading" value={form.electricLoader.kvah.closing} onChange={(value) => setElectricLoaderReading(setForm, "kvah", "closing", value)} />
              <ReadOnlyMetric label="KVAH units" value={previewRecord.calculations.electricLoaderKvahUnits} />
              <NumberField label="Total dispatch quantity MT" value={form.electricLoader.dispatchMt} onChange={(value) => setElectricLoaderValue(setForm, "dispatchMt", value)} />
              <ReadOnlyMetric label="KVAH / MT" value={previewRecord.calculations.electricLoaderUnitsPerMt} />
              <ReadOnlyMetric label="Electric loader TPH" value={previewRecord.calculations.electricLoaderTph} />
            </div>
          </Section>
        ) : null}

        <Section title="COP inputs" meta="Update weekly; Rs/MT calculated from production">
          <div className="form-grid four">
            <ReadOnlyMetric label="Drilling & blasting rate" value={previewRecord.cop.frozenDrillingBlastingRate} prefix="Rs" />
            <ReadOnlyMetric label="Drilling & blasting" value={previewRecord.calculations.drillingBlastingCost} prefix="Rs" />
            <ReadOnlyMetric label="Loading & transport rate" value={previewRecord.cop.frozenLoadingTransportRate} prefix="Rs" />
            <ReadOnlyMetric label="Loading & transport" value={previewRecord.calculations.loadingTransportCost} prefix="Rs" />
            <ReadOnlyMetric label="OB soft rock rate" value={previewRecord.cop.frozenObSoftRockRate} prefix="Rs" />
            <ReadOnlyMetric label="OB hard rock rate" value={previewRecord.cop.frozenObHardRockRate} prefix="Rs" />
            <ReadOnlyMetric label="Overburden removal" value={previewRecord.calculations.overburdenCost} prefix="Rs" />
            <NumberField label="Raw material cost" value={form.cop.rawMaterialCost} onChange={(value) => setNested(setForm, "cop", "rawMaterialCost", value)} />
            <NumberField label="Rent - plant" value={form.cop.rentPlantCost} onChange={(value) => setNested(setForm, "cop", "rentPlantCost", value)} />
            <NumberField label="Plant maintenance" value={form.cop.plantMaintenanceCost} onChange={(value) => setNested(setForm, "cop", "plantMaintenanceCost", value)} />
            <NumberField label="Spares & consumables" value={form.cop.sparesConsumablesCost} onChange={(value) => setNested(setForm, "cop", "sparesConsumablesCost", value)} />
            <NumberField label="Wear parts" value={form.cop.wearPartsCost} onChange={(value) => setNested(setForm, "cop", "wearPartsCost", value)} />
            <NumberField label="Intercarting expenses" value={form.cop.intercartingExpenses} onChange={(value) => setNested(setForm, "cop", "intercartingExpenses", value)} />
            <NumberField label="Weekly fixed cost" value={form.cop.fixedCost} onChange={(value) => setNested(setForm, "cop", "fixedCost", value)} />
            <ReadOnlyMetric label="Electrical cost on KVAH" value={previewRecord.calculations.electricalCost} prefix="Rs" />
            <ReadOnlyMetric label="Diesel - loader" value={previewRecord.calculations.loaderDieselCost} prefix="Rs" />
            <ReadOnlyMetric label="Total COP cost" value={previewRecord.calculations.totalCopCost} prefix="Rs" />
            <ReadOnlyMetric label="COP / MT" value={previewRecord.calculations.copPerMt} />
          </div>
        </Section>

        <Section title="Remarks and evidence photos" meta="Photos optional">
          <label className="text-area-field">
            <span>Remarks</span>
            <textarea value={form.remarks} onChange={(event) => setField(setForm, "remarks", event.target.value)} />
          </label>
          <div className="photo-grid">
            {PHOTO_CATEGORIES.map((category) => (
              <label className="photo-upload" key={category}>
                <span>{category}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) setEvidence(setForm, category, file.name, previewRecord);
                  }}
                />
                <small>{form.evidencePhotos.find((photo) => photo.category === category)?.fileName || "No photo selected"}</small>
              </label>
            ))}
          </div>
        </Section>

        <div className="form-actions">
          <button className="btn" disabled={busy} onClick={saveDraft}>
            <Save size={16} />
            Save draft
          </button>
          <button className="btn primary" disabled={busy} onClick={submitFinal}>
            <Send size={16} />
            Submit final
          </button>
        </div>
      </div>

      <aside className="review-rail">
        <Panel title="Auto-calculations" meta="Deterministic">
          <MetricList
            items={[
              ["Product mix", `${fmt.format(previewRecord.calculations.productMixTotal)} MT`],
              ["Dispatch", `${fmt.format(previewRecord.calculations.dispatchTotal)} MT`],
              ["Achievement", `${fmt.format(previewRecord.calculations.achievementPct)}%`],
              ["KVAH/MT", fmt.format(previewRecord.calculations.unitsPerMt)],
              ["Loader L/MT", fmt.format(previewRecord.calculations.loaderLitresPerMt)],
              ["COP/MT", fmt.format(previewRecord.calculations.copPerMt)],
            ]}
          />
        </Panel>
        <Panel title="Validation before submission" meta={`${previewRecord.validation.issues.length} issues`}>
          <IssueList issues={previewRecord.validation.issues} />
        </Panel>
        <Panel title="Drafts and final records" meta={`${records.length} records`}>
          <div className="record-list">
            {records.slice(-8).reverse().map((record) => (
              <button className="record-pill" key={record.id} onClick={() => setForm(recordToPayload(record))}>
                <span>{formatDisplayDate(record.date)}</span>
                <strong>{record.status}</strong>
                <small>{record.validation.valid ? "Valid" : `${record.validation.issues.length} issues`}</small>
              </button>
            ))}
            {!records.length ? <p className="muted">No records captured yet.</p> : null}
          </div>
        </Panel>
      </aside>
    </section>
  );
}

function PasswordPanel({
  busy,
  onChangePassword,
}: {
  busy: boolean;
  onChangePassword: (input: { currentPassword: string; newPassword: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const mismatch = newPassword && confirmPassword && newPassword !== confirmPassword;

  return (
    <section className="account-strip">
      <button className="btn" onClick={() => setOpen((value) => !value)}>
        <ShieldCheck size={16} />
        Password reset
      </button>
      {open ? (
        <div className="account-password-form">
          <TextField label="Current password" type="password" value={currentPassword} onChange={setCurrentPassword} />
          <TextField label="New password" type="password" value={newPassword} onChange={setNewPassword} />
          <TextField label="Confirm new password" type="password" value={confirmPassword} onChange={setConfirmPassword} />
          <button
            className="btn primary"
            disabled={busy || !currentPassword || newPassword.length < 8 || mismatch}
            onClick={() => {
              onChangePassword({ currentPassword, newPassword });
              setCurrentPassword("");
              setNewPassword("");
              setConfirmPassword("");
            }}
          >
            Save password
          </button>
          {mismatch ? <span className="muted">New password and confirmation do not match.</span> : null}
        </div>
      ) : null}
    </section>
  );
}

function DashboardWorkspace({
  dashboardView,
  exceptionRecords,
  labels,
  lossBuckets,
  productMix,
  setDashboardView,
  snapshot,
  totals,
  visibleDays,
}: {
  dashboardView: DashboardView;
  exceptionRecords: DailyPlantRecord[];
  labels: string[];
  lossBuckets: Array<{ name: string; value: number }>;
  productMix: Array<{ name: string; value: number }>;
  setDashboardView: (view: DashboardView) => void;
  snapshot: ReportSnapshot | null;
  totals: {
    production: number;
    target: number;
    dispatch: number;
    diesel: number;
    achievement: number;
    dispatchRatio: number;
    jawTph: number;
    vsiTph: number;
    unitsMt: number;
  };
  visibleDays: ReportSnapshot["daily"];
}) {
  if (!snapshot) {
    return (
      <section className="empty-state">
        <Database size={28} />
        <h2>No locked dashboard snapshot</h2>
        <p>Submit final daily records, then build a weekly or monthly snapshot.</p>
      </section>
    );
  }

  const productRatios = buildProductRatios(productMix, totals.production);
  const basisRows = buildBasisRows(visibleDays);
  const mtdRows = buildMtdRows(visibleDays);
  const loaderRows = buildLoaderRows(visibleDays);
  const electricLoaderRows = buildElectricLoaderRows(visibleDays);
  const electricLoaderDays = visibleDays.filter((day): day is SnapshotDay & { electricLoader: NonNullable<SnapshotDay["electricLoader"]> } => Boolean(day.electricLoader));
  const copRows = buildCopRows(visibleDays);
  const copProjectionRows = buildCopProjectionRows(visibleDays);
  const weeklyRows = buildPeriodSummaryRows(visibleDays, "week");
  const monthlyRows = buildPeriodSummaryRows(visibleDays, "month");
  const topProduct = productRatios[0];

  return (
    <>
      <section className="view-tabs">
        {(["daily", "weekly", "monthly", "trends", "exceptions"] as DashboardView[]).map((view) => (
          <button className={dashboardView === view ? "btn primary" : "btn"} key={view} onClick={() => setDashboardView(view)}>
            {view}
          </button>
        ))}
      </section>

      <section className="grid kpi-grid">
        <Kpi title="Production" value={`${fmt.format(totals.production)} MT`} detail={`${pct.format(totals.achievement)} of target`} />
        <Kpi title="Dispatch" value={`${fmt.format(totals.dispatch)} MT`} detail={`${pct.format(totals.dispatchRatio)} of production`} />
        <Kpi title="Top product" value={topProduct ? topProduct.name : "-"} detail={topProduct ? `${fmt.format(topProduct.ratio)}% of production` : "No mix"} />
        <Kpi title="Avg TPH" value={fmt.format((totals.jawTph + totals.vsiTph) / 2)} detail={`Jaw ${fmt.format(totals.jawTph)} | VSI ${fmt.format(totals.vsiTph)}`} />
        <Kpi title="KVAH / MT" value={fmt.format(totals.unitsMt)} detail="Auto-calculated" />
        <Kpi title="Loader L / MT" value={fmt.format(loaderRows[0]?.litresPerMt ?? 0)} detail={`${fmt.format(totals.diesel)} L diesel`} />
      </section>

      {dashboardView === "weekly" ? <PeriodDashboard electricLoaderRows={electricLoaderRows} period="Weekly" rows={weeklyRows} /> : null}
      {dashboardView === "monthly" ? <PeriodDashboard electricLoaderRows={electricLoaderRows} period="Monthly" rows={monthlyRows} /> : null}
      {dashboardView === "trends" ? (
        <TrendDashboard
          copProjectionRows={copProjectionRows}
          copRows={copRows}
          electricLoaderRows={electricLoaderRows}
          labels={labels}
          loaderRows={loaderRows}
          mtdRows={mtdRows}
          visibleDays={visibleDays}
        />
      ) : null}
      {dashboardView === "exceptions" ? <ExceptionDashboard exceptionRecords={exceptionRecords} /> : null}

      {dashboardView === "daily" ? (
        <>
      <section className="grid dashboard-summary-grid">
        <Panel title="Production and product ratios" meta="Linked to total production">
          <RatioTable rows={productRatios} />
        </Panel>
        <Panel title="Daily / Weekly / MTD KPI basis" meta="TPH and KVAH/MT">
          <BasisTable rows={basisRows} />
        </Panel>
      </section>

        <section className="grid main-grid">
          <div className="grid">
            <Panel title="Production, dispatch and target" meta="Validated MT">
              <Line
                data={{
                  labels,
                  datasets: [
                    dataset("Target", visibleDays.map((d) => d.targetMt), "#183153"),
                    dataset("Production", visibleDays.map((d) => d.production.mt), "#087f8c"),
                    dataset("Dispatch", visibleDays.map((d) => d.dispatch.totalMt), "#d1495b"),
                  ],
                }}
                options={chartOptions}
              />
            </Panel>
            <Panel title="MTD production and dispatch trend" meta="Cumulative MT with values">
              <Bar
                data={{
                  labels: mtdRows.map((row) => row.label),
                  datasets: [
                    {
                      label: "MTD Production",
                      data: mtdRows.map((row) => row.production),
                      backgroundColor: "#087f8c",
                    },
                    {
                      label: "MTD Dispatch",
                      data: mtdRows.map((row) => row.dispatch),
                      backgroundColor: "#d1495b",
                    },
                  ],
                }}
                options={labelledBarOptions}
              />
            </Panel>
            <div className="grid chart-grid">
              <Panel title="Product mix" meta="Production MT">
                <Doughnut
                  data={{
                    labels: productMix.map((p) => p.name),
                    datasets: [{ data: productMix.map((p) => p.value), backgroundColor: ["#087f8c", "#f3a712", "#2f855a", "#d1495b", "#183153", "#7a5195", "#5b8def"] }],
                  }}
                  options={{ maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }}
                />
              </Panel>
              <Panel title="TPH vs production" meta="Jaw TPH">
                <Scatter
                  data={{
                    datasets: [{
                      label: "Daily",
                      data: visibleDays.filter((d) => d.machine.jawTph > 0).map((d) => ({ x: d.machine.jawTph, y: d.production.mt })),
                      borderColor: "#087f8c",
                      backgroundColor: "rgba(8, 127, 140, 0.65)",
                    }],
                  }}
                  options={scatterOptions}
                />
              </Panel>
              <Panel title="Loss hour buckets" meta="Hours">
                <Bar
                  data={{
                    labels: lossBuckets.map((b) => b.name),
                    datasets: [{ label: "Hours", data: lossBuckets.map((b) => b.value), backgroundColor: "#d1495b" }],
                  }}
                  options={chartOptions}
                />
              </Panel>
              <Panel title="Electrical efficiency" meta="KVAH / MT">
                <Line
                  data={{
                    labels,
                    datasets: [
                      dataset("KVAH / MT", visibleDays.map((d) => d.electrical.unitsPerMt), "#f3a712"),
                      dataset("Power factor", visibleDays.map((d) => d.electrical.powerFactor), "#2f855a"),
                    ],
                  }}
                  options={chartOptions}
                />
              </Panel>
              <Panel title="Loader dispatch and TPH" meta="Daily trend">
                <Line
                  data={{
                    labels,
                    datasets: [
                      dataset("Dispatch MT", visibleDays.map((d) => d.loader.dispatchMt), "#087f8c"),
                      dataset("Loader TPH", visibleDays.map((d) => d.loader.tph), "#183153"),
                    ],
                  }}
                  options={chartOptions}
                />
              </Panel>
              <Panel title="Loader diesel efficiency" meta="Daily litres/MT">
                <Bar
                  data={{
                    labels,
                    datasets: [
                      {
                        label: "Ltr/MT",
                        data: visibleDays.map((d) => d.loader.litresPerMt),
                        backgroundColor: "#f3a712",
                      },
                    ],
                  }}
                  options={labelledBarOptions}
                />
              </Panel>
              {electricLoaderDays.length ? (
                <Panel title="Electric loader KVAH/MT and TPH" meta="Daily trend">
                  <Line
                    data={{
                      labels: electricLoaderDays.map((day) => day.label),
                      datasets: [
                        dataset("KVAH/MT", electricLoaderDays.map((day) => day.electricLoader.unitsPerMt), "#f3a712"),
                        dataset("TPH", electricLoaderDays.map((day) => day.electricLoader.tph), "#183153"),
                      ],
                    }}
                    options={chartOptions}
                  />
                </Panel>
              ) : null}
            </div>
            <Panel title="Loader Daily / Weekly / MTD trends" meta="Running hours, Ltr/MT, TPH and dispatch">
              <LoaderTable rows={loaderRows} />
            </Panel>
            {electricLoaderDays.length ? (
              <>
                <Panel title="Electric loader Daily / Weekly / MTD" meta="Running hours, KVAH/MT, TPH and dispatch">
                  <ElectricLoaderTable rows={electricLoaderRows} />
                </Panel>
                <Panel title="Electric loader reading log" meta="Opening and closing readings">
                  <ElectricLoaderDailyTable days={electricLoaderDays} />
                </Panel>
              </>
            ) : null}
            <Panel title="COP structure" meta="Actuals and Rs./MT">
              <CopTable rows={copRows} />
            </Panel>
            <Panel title="MTD and extrapolated COP" meta="Projected from MTD production average">
              <CopProjectionTable rows={copProjectionRows} />
            </Panel>
          </div>

          <aside className="grid side-stack">
            <Panel title="Locked snapshot" meta={snapshot.status}>
              <div className="commentary">
                <ul>
                  <li>
                    <Lock size={14} /> {snapshot.version}
                  </li>
                  <li>Period: {formatDisplayDate(snapshot.period.start)} to {formatDisplayDate(snapshot.period.end)}</li>
                  <li>Source checksum: {snapshot.source.checksum.slice(0, 12)}</li>
                </ul>
              </div>
            </Panel>
            <Panel title="Management commentary" meta="Narrative only">
              <div className="commentary">
                <ul>{snapshot.commentary.actionPoints.map((point) => <li key={point}>{point}</li>)}</ul>
              </div>
            </Panel>
          </aside>
        </section>

      <section className="panel table-panel">
        <div className="panel-header">
          <h2>Daily operations log</h2>
          <span>{visibleDays.length} rows</span>
        </div>
        <DailyTable days={visibleDays} />
      </section>
        </>
      ) : null}
    </>
  );
}

function PeriodDashboard({
  electricLoaderRows,
  period,
  rows,
}: {
  electricLoaderRows: ElectricLoaderBasisRow[];
  period: "Weekly" | "Monthly";
  rows: PeriodSummaryRow[];
}) {
  return (
    <section className="grid">
      <Panel title={`${period} summary`} meta="Aggregated from validated daily records">
        <PeriodSummaryTable rows={rows} />
      </Panel>
      <div className="grid chart-grid">
        <Panel title={`${period} production and dispatch`} meta="MT">
          <Bar
            data={{
              labels: rows.map((row) => row.label),
              datasets: [
                { label: "Production", data: rows.map((row) => row.production), backgroundColor: "#087f8c" },
                { label: "Dispatch", data: rows.map((row) => row.dispatch), backgroundColor: "#d1495b" },
              ],
            }}
            options={labelledBarOptions}
          />
        </Panel>
        <Panel title={`${period} efficiency`} meta="KVAH/MT and loader L/MT">
          <Line
            data={{
              labels: rows.map((row) => row.label),
              datasets: [
                dataset("KVAH / MT", rows.map((row) => row.kvahPerMt), "#f3a712"),
                dataset("Loader L / MT", rows.map((row) => row.loaderLitresPerMt), "#183153"),
              ],
            }}
            options={chartOptions}
          />
        </Panel>
      </div>
      {electricLoaderRows.some((row) => row.dispatchMt > 0 || row.runningHours > 0 || row.kvahUnits > 0) ? (
        <Panel title="Electric loader Daily / Weekly / MTD" meta="Running hours, KVAH/MT, TPH and dispatch">
          <ElectricLoaderTable rows={electricLoaderRows} />
        </Panel>
      ) : null}
    </section>
  );
}

function TrendDashboard({
  copProjectionRows,
  copRows,
  electricLoaderRows,
  labels,
  loaderRows,
  mtdRows,
  visibleDays,
}: {
  copProjectionRows: CopProjectionRow[];
  copRows: ReturnType<typeof buildCopRows>;
  electricLoaderRows: ElectricLoaderBasisRow[];
  labels: string[];
  loaderRows: LoaderBasisRow[];
  mtdRows: ReturnType<typeof buildMtdRows>;
  visibleDays: ReportSnapshot["daily"];
}) {
  const electricLoaderDays = visibleDays.filter((day): day is SnapshotDay & { electricLoader: NonNullable<SnapshotDay["electricLoader"]> } => Boolean(day.electricLoader));

  return (
    <section className="grid">
      <div className="grid chart-grid">
        <Panel title="MTD production and dispatch trend" meta="Cumulative MT with values">
          <Bar
            data={{
              labels: mtdRows.map((row) => row.label),
              datasets: [
                { label: "MTD Production", data: mtdRows.map((row) => row.production), backgroundColor: "#087f8c" },
                { label: "MTD Dispatch", data: mtdRows.map((row) => row.dispatch), backgroundColor: "#d1495b" },
              ],
            }}
            options={labelledBarOptions}
          />
        </Panel>
        <Panel title="Electrical efficiency trend" meta="KVAH/MT and PF">
          <Line
            data={{
              labels,
              datasets: [
                dataset("KVAH / MT", visibleDays.map((day) => day.electrical.unitsPerMt), "#f3a712"),
                dataset("Power factor", visibleDays.map((day) => day.electrical.powerFactor), "#2f855a"),
              ],
            }}
            options={chartOptions}
          />
        </Panel>
        <Panel title="Loader dispatch and TPH trend" meta="Daily values">
          <Line
            data={{
              labels,
              datasets: [
                dataset("Dispatch MT", visibleDays.map((day) => day.loader.dispatchMt), "#087f8c"),
                dataset("Loader TPH", visibleDays.map((day) => day.loader.tph), "#183153"),
              ],
            }}
            options={chartOptions}
          />
        </Panel>
        <Panel title="Loader diesel efficiency trend" meta="Daily litres/MT">
          <Bar
            data={{
              labels,
              datasets: [{ label: "Ltr/MT", data: visibleDays.map((day) => day.loader.litresPerMt), backgroundColor: "#f3a712" }],
            }}
            options={labelledBarOptions}
          />
        </Panel>
        {electricLoaderDays.length ? (
          <Panel title="Electric loader KVAH/MT and TPH trend" meta="Daily values">
            <Line
              data={{
                labels: electricLoaderDays.map((day) => day.label),
                datasets: [
                  dataset("KVAH/MT", electricLoaderDays.map((day) => day.electricLoader.unitsPerMt), "#f3a712"),
                  dataset("TPH", electricLoaderDays.map((day) => day.electricLoader.tph), "#183153"),
                ],
              }}
              options={chartOptions}
            />
          </Panel>
        ) : null}
      </div>
      <Panel title="Loader Daily / Weekly / MTD trends" meta="Running hours, Ltr/MT, TPH and dispatch">
        <LoaderTable rows={loaderRows} />
      </Panel>
      {electricLoaderRows.some((row) => row.dispatchMt > 0 || row.runningHours > 0 || row.kvahUnits > 0) ? (
        <Panel title="Electric loader Daily / Weekly / MTD" meta="Running hours, KVAH/MT, TPH and dispatch">
          <ElectricLoaderTable rows={electricLoaderRows} />
        </Panel>
      ) : null}
      <Panel title="COP structure" meta="Actuals and Rs./MT">
        <CopTable rows={copRows} />
      </Panel>
      <Panel title="MTD and extrapolated COP" meta="Projected from MTD production average">
        <CopProjectionTable rows={copProjectionRows} />
      </Panel>
    </section>
  );
}

function ExceptionDashboard({ exceptionRecords }: { exceptionRecords: DailyPlantRecord[] }) {
  return (
    <Panel title="Exception view" meta="Warnings and blockers">
      <div className="table-shell">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Status</th>
              <th>Review</th>
              <th>Issues</th>
            </tr>
          </thead>
          <tbody>
            {exceptionRecords.map((record) => (
              <tr key={record.id}>
                <td>{formatDisplayDate(record.date)}</td>
                <td>{record.status}</td>
                <td>{record.reviewStatus}</td>
                <td>{record.validation.issues.map((issue) => issue.code).join(", ")}</td>
              </tr>
            ))}
            {!exceptionRecords.length ? (
              <tr>
                <td colSpan={4}>No exceptions for the current records.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function AccessWorkspace({
  busy,
  onAssign,
  onConfigChange,
  onRevoke,
  plantConfigs,
  plantUsers,
  temporaryPassword,
}: {
  busy: boolean;
  onAssign: (input: { email: string; name: string; plantCode: string }) => void;
  onConfigChange: (plantCode: string, electricLoaderEnabled: boolean) => void;
  onRevoke: (accessId: string) => void;
  plantConfigs: PlantOperationalConfig[];
  plantUsers: PlantUserSummary[];
  temporaryPassword: string | null;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [plantCode, setPlantCode] = useState(PLANT_CONFIGS[0]?.code ?? "");
  const activeByPlant = new Map(plantUsers.map((user) => [user.plantCode, user]));
  const configByPlant = new Map(plantConfigs.map((config) => [config.code, config]));

  return (
    <section className="reports-grid">
      <Panel title="Assign plant access" meta="ROBOOPS only">
        <div className="commentary">
          <p>One active user is allowed per plant. Assigning a new user to a plant automatically revokes the previous assignment for that plant.</p>
        </div>
        <div className="form-grid two report-controls">
          <SelectField
            label="Plant"
            value={plantCode}
            options={PLANT_CONFIGS.map((plant) => ({ label: plant.name, value: plant.code }))}
            onChange={setPlantCode}
          />
          <TextField label="Name" value={name} onChange={setName} />
          <TextField label="Email" type="email" value={email} onChange={setEmail} />
        </div>
        <div className="form-actions">
          <button
            className="btn primary"
            disabled={busy || !name.trim() || !email.trim() || !plantCode}
            onClick={() => onAssign({ email, name, plantCode })}
          >
            <UserPlus size={16} />
            Assign / replace user
          </button>
        </div>
        {temporaryPassword ? (
          <div className="status-line">
            Temporary password: <strong>{temporaryPassword}</strong>
          </div>
        ) : null}
      </Panel>

      <Panel title="Current plant assignments" meta={`${plantUsers.length} active`}>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Plant</th>
                <th>User</th>
                <th>Email</th>
                <th>Electric loader</th>
                <th>Assigned</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {PLANT_CONFIGS.map((plant) => {
                const access = activeByPlant.get(plant.code);
                const config = configByPlant.get(plant.code);
                return (
                  <tr key={plant.code}>
                    <td>{plant.name}</td>
                    <td>{access?.name ?? "Not assigned"}</td>
                    <td>{access?.email ?? "-"}</td>
                    <td>
                      <CheckboxField
                        checked={config?.electricLoaderEnabled ?? false}
                        label="Enabled"
                        onChange={(value) => onConfigChange(plant.code, value)}
                      />
                    </td>
                    <td>{access?.assignedAt ? formatDisplayDate(access.assignedAt.slice(0, 10)) : "-"}</td>
                    <td>
                      {access?.accessId ? (
                        <button className="btn danger" disabled={busy} onClick={() => onRevoke(access.accessId!)}>
                          <Trash2 size={16} />
                          Revoke
                        </button>
                      ) : (
                        <span className="muted">Open</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </section>
  );
}

function ReportsWorkspace({
  backfillFileRef,
  backfillFileName,
  busy,
  buildSnapshot,
  endDate,
  fileRef,
  generatePpt,
  importWorkbook,
  plantCode,
  plantOptions,
  reportType,
  setEndDate,
  setPlantCode,
  setReportType,
  setStartDate,
  snapshot,
  startDate,
  status,
  onBackfillFileSelected,
  uploadBackfill,
  userRole,
}: {
  backfillFileRef: React.RefObject<HTMLInputElement | null>;
  backfillFileName: string;
  busy: boolean;
  buildSnapshot: () => void;
  endDate: string;
  fileRef: React.RefObject<HTMLInputElement | null>;
  generatePpt: () => void;
  importWorkbook: () => void;
  plantCode: string;
  plantOptions: Array<(typeof PLANT_CONFIGS)[number]>;
  reportType: "DAILY" | "WEEKLY" | "MONTHLY";
  setEndDate: (value: string) => void;
  setPlantCode: (value: string) => void;
  setReportType: (value: "DAILY" | "WEEKLY" | "MONTHLY") => void;
  setStartDate: (value: string) => void;
  snapshot: ReportSnapshot | null;
  startDate: string;
  status: string | null;
  onBackfillFileSelected: (fileName: string) => void;
  uploadBackfill: () => void;
  userRole: UserRole;
}) {
  return (
    <section className="reports-grid">
      <Panel title="Generate locked dashboard snapshot" meta="Database to report">
        <div className="form-grid two report-controls">
          <SelectField
            disabled={userRole === "PLANT_USER"}
            label="Plant"
            value={plantCode}
            options={plantOptions.map((plant) => ({ label: plant.name, value: plant.code }))}
            onChange={setPlantCode}
          />
          <TextField label="Start date" type="date" value={startDate} onChange={setStartDate} />
          <TextField label="End date" type="date" value={endDate} onChange={setEndDate} />
          <ReadOnlyText label="Start date display" value={formatDisplayDate(startDate)} />
          <ReadOnlyText label="End date display" value={formatDisplayDate(endDate)} />
          <label className="field">
            <span>Report type</span>
            <select value={reportType} onChange={(event) => setReportType(event.target.value as "DAILY" | "WEEKLY" | "MONTHLY")}>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </label>
          <div className="required-photo-list">
            <strong>Optional photo categories</strong>
            <span>{PHOTO_CATEGORIES.join(", ")}</span>
          </div>
        </div>
        <div className="form-actions">
          <button className="btn primary" disabled={busy} onClick={buildSnapshot}>
            <Lock size={16} />
            Generate snapshot
          </button>
          <button className="btn" disabled={busy || !snapshot || !snapshot.validation.valid} onClick={generatePpt}>
            <Presentation size={16} />
            Generate PPT
          </button>
        </div>
      </Panel>

      {userRole === "SUPER_ADMIN" ? (
      <Panel title="Historical backfill upload" meta="Apr, May, Jun and Jul 2026">
        <div className="commentary">
          <p>Download the flat template, fill one row per plant-date, then upload the completed CSV or XLSX. Accepted rows are saved as final daily records and can feed snapshots immediately.</p>
        </div>
        {status ? <p className="status-line">{status}</p> : null}
        <div className="form-actions">
          <a className="btn" href="/api/backfill-template">
            <Download size={16} />
            Download Apr-Jul template
          </a>
          <label className="file-control">
            <FileUp size={16} />
            <input
              ref={backfillFileRef}
              aria-label="Upload Apr-Jul backfill file"
              type="file"
              accept=".csv,.xlsx"
              hidden
              onChange={(event) => onBackfillFileSelected(event.target.files?.[0]?.name ?? "")}
            />
            {backfillFileName || "Backfill file"}
          </label>
          <button className="btn primary" disabled={busy} onClick={uploadBackfill}>
            <RefreshCw size={16} />
            Upload final data
          </button>
        </div>
      </Panel>
      ) : null}

      {userRole === "SUPER_ADMIN" ? (
      <Panel title="Excel reconciliation utility" meta="Temporary">
        <div className="commentary">
          <p>Excel is retained only to compare first system-generated reports against the old process.</p>
        </div>
        <div className="form-actions">
          <label className="file-control">
            <FileUp size={16} />
            <input ref={fileRef} aria-label="Upload GIR daily report workbook" type="file" accept=".xlsx,.xlsm,.xls" hidden />
            Workbook
          </label>
          <button className="btn" disabled={busy} onClick={importWorkbook}>
            <RefreshCw size={16} />
            Import for cross-check
          </button>
        </div>
      </Panel>
      ) : null}

      <Panel title="Current locked snapshot" meta={snapshot ? snapshot.status : "None"}>
        {snapshot ? (
          <MetricList
            items={[
              ["Plant", snapshot.plantCode],
              ["Period", `${formatDisplayDate(snapshot.period.start)} to ${formatDisplayDate(snapshot.period.end)}`],
              ["Version", snapshot.version],
              ["Validation", snapshot.validation.valid ? "Valid" : `${snapshot.validation.issues.length} issues`],
            ]}
          />
        ) : (
          <p className="muted">No snapshot generated yet.</p>
        )}
      </Panel>
    </section>
  );
}

function Kpi({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="kpi">
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function Panel({ title, meta, children }: { title: string; meta: string; children: ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{title}</h2>
        <span>{meta}</span>
      </div>
      <div className="chart-wrap">{children}</div>
    </section>
  );
}

function Section({
  children,
  defaultOpen = false,
  meta,
  title,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  meta: string;
  title: string;
}) {
  return (
    <details className="form-section" defaultOpen={defaultOpen}>
      <summary className="panel-header section-summary">
        <h2>{title}</h2>
        <span>{meta}</span>
      </summary>
      <div className="section-body">{children}</div>
    </details>
  );
}

function TextField({
  disabled = false,
  label,
  onChange,
  type = "text",
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input disabled={disabled} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({
  disabled = false,
  label,
  onChange,
  options,
  placeholder,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function NumberField({
  disabled = false,
  label,
  onChange,
  step = "0.01",
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: number) => void;
  step?: string;
  value: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input disabled={disabled} type="number" step={step} value={String(value)} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function HourField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        inputMode="numeric"
        pattern="[0-9]{1,3}:[0-5][0-9]"
        placeholder="HH:MM"
        value={formatHours(value)}
        onChange={(event) => onChange(parseHours(event.target.value))}
      />
    </label>
  );
}

function ReadOnlyText({ label, value }: { label: string; value: string }) {
  return (
    <div className="readonly-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReadOnlyMetric({
  format,
  label,
  prefix,
  suffix,
  value,
}: {
  format?: "hours" | "powerFactor";
  label: string;
  prefix?: string;
  suffix?: string;
  value: number;
}) {
  const renderedValue = format === "hours" ? formatHours(value) : format === "powerFactor" ? value.toFixed(2) : fmt.format(value);
  return (
    <div className="readonly-metric">
      <span>{label}</span>
      <strong>{prefix ? `${prefix} ` : ""}{renderedValue}{suffix ? ` ${suffix}` : ""}</strong>
    </div>
  );
}

function ProductGrid({
  onChange,
  suffix,
  values,
}: {
  onChange: (product: (typeof CAPTURE_PRODUCTS)[number], value: number) => void;
  suffix?: string;
  values: CapturePayload["productMix"];
}) {
  return (
    <div className="form-grid product-grid">
      {CAPTURE_PRODUCTS.map((product) => (
        <NumberField key={product} label={suffix ? `${product} ${suffix}` : product} value={values[product]} onChange={(value) => onChange(product, value)} />
      ))}
    </div>
  );
}

function ProductReadOnlyGrid({
  suffix = "MT",
  values,
}: {
  suffix?: string;
  values: CapturePayload["productMix"];
}) {
  return (
    <div className="form-grid product-grid">
      {CAPTURE_PRODUCTS.map((product) => (
        <ReadOnlyMetric key={product} label={product} value={values[product]} suffix={suffix} />
      ))}
    </div>
  );
}

function ProductTotal({
  label,
  values,
}: {
  label: string;
  values: CapturePayload["productMix"];
}) {
  return (
    <div className="product-total-row">
      <ReadOnlyMetric label={label} value={productTotal(values)} suffix="MT" />
    </div>
  );
}

function CheckboxField({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="checkbox-field">
      <input checked={checked} type="checkbox" onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function LossDetailGrid({
  form,
  setForm,
}: {
  form: CapturePayload;
  setForm: (updater: CapturePayload | ((current: CapturePayload) => CapturePayload)) => void;
}) {
  return (
    <div className="loss-detail-layout">
      <div>
        <h3 className="section-subtitle">Quarry</h3>
        <LossRows categories={["quarryOversizeJams", "quarryNoTippers", "quarryNoMaterial", "quarryBlasting"]} form={form} setForm={setForm} />
      </div>
      <div>
        <h3 className="section-subtitle">Plant</h3>
        <LossRows categories={["plantBreakdown", "plantScheduledMaintenance", "plantIdle", "plantOther"]} form={form} setForm={setForm} />
      </div>
    </div>
  );
}

function LossRows({
  categories,
  form,
  setForm,
}: {
  categories: LossCategory[];
  form: CapturePayload;
  setForm: (updater: CapturePayload | ((current: CapturePayload) => CapturePayload)) => void;
}) {
  return (
    <div className="loss-detail-grid">
      {categories.map((category) => (
        <div className="loss-detail-row" key={category}>
          <strong>{lossCategoryLabel(category)}</strong>
          <HourField label="Hours" value={form.lossDetails[category].hours} onChange={(value) => setLossDetail(setForm, category, "hours", value)} />
          <label className="text-area-field">
            <span>Comments</span>
            <textarea value={form.lossDetails[category].comments} onChange={(event) => setLossDetail(setForm, category, "comments", event.target.value)} />
          </label>
        </div>
      ))}
    </div>
  );
}

function MetricList({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="metric-list">
      {items.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function IssueList({ issues }: { issues: DailyPlantRecord["validation"]["issues"] }) {
  if (!issues.length) {
    return (
      <div className="issue">
        <strong>No validation issues</strong>
        <span>This record can be submitted final.</span>
      </div>
    );
  }

  return (
    <div className="issues">
      {issues.map((issue) => (
        <div className={`issue ${issue.severity.toLowerCase()}`} key={`${issue.code}-${issue.field}-${issue.message}`}>
          <strong>
            <AlertTriangle size={14} /> {issue.code}
          </strong>
          <span>{issue.message}</span>
        </div>
      ))}
    </div>
  );
}

function DailyTable({ days }: { days: ReportSnapshot["daily"] }) {
  return (
    <div className="table-shell">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Target</th>
            <th>Production</th>
            <th>Dispatch</th>
            <th>Jaw TPH</th>
            <th>VSI TPH</th>
            <th>Run Hrs</th>
            <th>Loss Hrs</th>
            <th>KVAH/MT</th>
            <th>Loader L/MT</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <td>{formatDisplayDate(day.date)}</td>
              <td>{fmt.format(day.targetMt)}</td>
              <td>{fmt.format(day.production.mt)}</td>
              <td>{fmt.format(day.dispatch.totalMt)}</td>
              <td>{fmt.format(day.machine.jawTph)}</td>
              <td>{fmt.format(day.machine.vsiTph)}</td>
              <td>{formatHours(day.plantHours.productionHours)}</td>
              <td>{formatHours(day.plantHours.lossHours)}</td>
              <td>{fmt.format(day.electrical.unitsPerMt)}</td>
              <td>{fmt.format(day.loader.litresPerMt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PeriodSummaryTable({ rows }: { rows: PeriodSummaryRow[] }) {
  return (
    <div className="table-shell">
      <table>
        <thead>
          <tr>
            <th>Period</th>
            <th>Date range</th>
            <th>Target</th>
            <th>Production</th>
            <th>Dispatch</th>
            <th>Achievement</th>
            <th>Jaw TPH</th>
            <th>VSI TPH</th>
            <th>KVAH/MT</th>
            <th>Loader L/MT</th>
            <th>Loss Hrs</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.label}-${row.start}-${row.end}`}>
              <td>{row.label}</td>
              <td>{formatDisplayDate(row.start)} to {formatDisplayDate(row.end)}</td>
              <td>{fmt.format(row.target)}</td>
              <td>{fmt.format(row.production)}</td>
              <td>{fmt.format(row.dispatch)}</td>
              <td>{fmt.format(row.achievementPct)}%</td>
              <td>{fmt.format(row.jawTph)}</td>
              <td>{fmt.format(row.vsiTph)}</td>
              <td>{fmt.format(row.kvahPerMt)}</td>
              <td>{fmt.format(row.loaderLitresPerMt)}</td>
              <td>{formatHours(row.lossHours)}</td>
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td colSpan={11}>No records available for this period.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function RatioTable({ rows }: { rows: Array<{ name: string; mt: number; ratio: number }> }) {
  return (
    <div className="table-shell mini-table">
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>MT</th>
            <th>Ratio</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td>{row.name}</td>
              <td>{fmt.format(row.mt)}</td>
              <td>{fmt.format(row.ratio)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BasisTable({ rows }: { rows: BasisRow[] }) {
  return (
    <div className="table-shell mini-table">
      <table>
        <thead>
          <tr>
            <th>Basis</th>
            <th>Production</th>
            <th>Jaw TPH</th>
            <th>Cone TPH</th>
            <th>VSI TPH</th>
            <th>KVAH/MT</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{fmt.format(row.production)}</td>
              <td>{fmt.format(row.jawTph)}</td>
              <td>{fmt.format(row.coneTph)}</td>
              <td>{fmt.format(row.vsiTph)}</td>
              <td>{fmt.format(row.unitsPerMt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LoaderTable({ rows }: { rows: LoaderBasisRow[] }) {
  return (
    <div className="table-shell mini-table">
      <table>
        <thead>
          <tr>
            <th>Basis</th>
            <th>Running Hrs</th>
            <th>Ltr/MT</th>
            <th>TPH</th>
            <th>Dispatch Qty</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{formatHours(row.runningHours)}</td>
              <td>{fmt.format(row.litresPerMt)}</td>
              <td>{fmt.format(row.tph)}</td>
              <td>{fmt.format(row.dispatchMt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ElectricLoaderTable({ rows }: { rows: ElectricLoaderBasisRow[] }) {
  return (
    <div className="table-shell mini-table">
      <table>
        <thead>
          <tr>
            <th>Basis</th>
            <th>Running Hrs</th>
            <th>KWH</th>
            <th>KVAH</th>
            <th>KVAH/MT</th>
            <th>TPH</th>
            <th>Dispatch Qty</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{fmt.format(row.runningHours)}</td>
              <td>{fmt.format(row.kwhUnits)}</td>
              <td>{fmt.format(row.kvahUnits)}</td>
              <td>{fmt.format(row.unitsPerMt)}</td>
              <td>{fmt.format(row.tph)}</td>
              <td>{fmt.format(row.dispatchMt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ElectricLoaderDailyTable({ days }: { days: Array<SnapshotDay & { electricLoader: NonNullable<SnapshotDay["electricLoader"]> }> }) {
  return (
    <div className="table-shell mini-table">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Opening meter</th>
            <th>Closing meter</th>
            <th>Run Hrs</th>
            <th>Opening KWH</th>
            <th>Closing KWH</th>
            <th>Opening KVAH</th>
            <th>Closing KVAH</th>
            <th>Dispatch MT</th>
            <th>KVAH/MT</th>
            <th>TPH</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <td>{formatDisplayDate(day.date)}</td>
              <td>{fmt.format(day.electricLoader.meter.opening)}</td>
              <td>{fmt.format(day.electricLoader.meter.closing)}</td>
              <td>{fmt.format(day.electricLoader.runningHours)}</td>
              <td>{fmt.format(day.electricLoader.kwh.opening)}</td>
              <td>{fmt.format(day.electricLoader.kwh.closing)}</td>
              <td>{fmt.format(day.electricLoader.kvah.opening)}</td>
              <td>{fmt.format(day.electricLoader.kvah.closing)}</td>
              <td>{fmt.format(day.electricLoader.dispatchMt)}</td>
              <td>{fmt.format(day.electricLoader.unitsPerMt)}</td>
              <td>{fmt.format(day.electricLoader.tph)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CopTable({ rows }: { rows: Array<{ label: string; actuals: number; perMt: number; strong?: boolean }> }) {
  return (
    <div className="table-shell mini-table">
      <table>
        <thead>
          <tr>
            <th>Quantitative Information</th>
            <th>Actuals</th>
            <th>Rs./Mt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className={row.strong ? "summary-row" : undefined}>
              <td>{row.label}</td>
              <td>{row.actuals ? fmt.format(row.actuals) : "-"}</td>
              <td>{row.perMt ? fmt.format(row.perMt) : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CopProjectionTable({ rows }: { rows: CopProjectionRow[] }) {
  return (
    <div className="table-shell mini-table">
      <table>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{fmt.format(row.value)}{row.suffix ? ` ${row.suffix}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function defaultPayload(): CapturePayload {
  const defaultPlant = PLANT_CONFIGS[0];
  return {
    plantCode: defaultPlant.code,
    plantName: defaultPlant.name,
    date: todayIso(),
    targetMt: 1700,
    productionMt: 0,
    productMixPercentages: emptyProducts(),
    productMix: emptyProducts(),
    overburden: { softRockMt: 0, hardRockMt: 0 },
    dispatch: emptyProducts(),
    openingStock: emptyProducts(),
    closingStock: emptyProducts(),
    stockAdjustments: emptyProducts(),
    stockAdjustmentComment: "",
    bookStock: { monthlyOpening: emptyProducts(), calculatedClosing: emptyProducts() },
    machineHours: { jaw: 0, cone: 0, vsi: 0 },
    equipmentHourMeters: {
      jaw: { opening: 0, closing: 0 },
      cone: { opening: 0, closing: 0 },
      vsi: { opening: 0, closing: 0 },
    },
    tph: { jaw: 0, cone: 0, vsi: 0 },
    plantHours: { available: 24, production: 0, scheduledStoppage: 0, loss: 0 },
    lossHours: emptyLosses(),
    lossDetails: emptyLossDetails(),
    lossEvent: { reason: "", hours: 0, comments: "" },
    electrical: {
      openingKwh: 0,
      closingKwh: 0,
      kwhMultiplyingFactor: defaultPlant.electricalMf,
      openingKvah: 0,
      closingKvah: 0,
      kvahMultiplyingFactor: defaultPlant.electricalMf,
      unitsConsumed: 0,
      kvahUnitsConsumed: 0,
      domesticUnits: 0,
      domestic: {
        openingKwh: 0,
        closingKwh: 0,
        multiplyingFactor: domesticMeterMfFor(defaultPlant.code),
        unitsConsumed: 0,
      },
      excludeDomesticFromUnitsPerMt: true,
      powerFactor: 0.98,
      cmd: 0,
    },
    loader: {
      hours: 0,
      hourMeter: { opening: 0, closing: 0 },
      productionHours: 0,
      otherWorksHours: 0,
      tph: 0,
      dieselLitres: 0,
      dieselRate: 0,
      dieselVarianceRate: 0,
      includeDieselVariance: false,
      dieselCost: 0,
      dieselVarianceCost: 0,
      dispatchMt: 0,
    },
    electricLoader: {
      enabled: false,
      meter: { opening: 0, closing: 0 },
      kwh: { opening: 0, closing: 0 },
      kvah: { opening: 0, closing: 0 },
      dispatchMt: 0,
      runningHours: 0,
      kwhUnits: 0,
      kvahUnits: 0,
      unitsPerMt: 0,
      tph: 0,
    },
    cop: {
      fixedCostMonthly: 0,
      fixedCostDaily: 0,
      fixedCost: 0,
      frozenDrillingBlastingRate: 0,
      frozenLoadingTransportRate: 0,
      frozenObSoftRockRate: 0,
      frozenObHardRockRate: 0,
      frozenDieselRate: 0,
      frozenDieselVarianceRate: 0,
      quarryObCost: 0,
      quarryBlastingCost: 0,
      quarryLtCost: 0,
      drillingBlastingCost: 0,
      internalTransportationCost: 0,
      overburdenRemovalCost: 0,
      rawMaterialCost: 0,
      rentPlantCost: 0,
      plantCost: 0,
      plantMaintenanceCost: 0,
      electricalCost: 0,
      loaderCost: 0,
      sparesConsumablesCost: 0,
      wearPartsCost: 0,
      intercartingExpenses: 0,
      powerCost: 0,
      dieselCost: 0,
      consumablesCost: 0,
      maintenanceCost: 0,
    },
    remarks: "",
    evidencePhotos: [],
    submittedBy: "operations-head",
  };
}

function initialPayload(records: DailyPlantRecord[], preferredPlantCode?: string) {
  const base = defaultPayload();
  if (preferredPlantCode) {
    const plant = PLANT_CONFIGS.find((config) => config.code === preferredPlantCode) ?? PLANT_CONFIGS[0];
    base.plantCode = plant.code;
    base.plantName = plant.name;
  }
  return payloadForPlantDate(base, records, base.plantCode, base.date);
}

function emptyProducts() {
  return Object.fromEntries(CAPTURE_PRODUCTS.map((product) => [product, 0])) as CapturePayload["productMix"];
}

function emptyLosses() {
  return Object.fromEntries(LOSS_CATEGORIES.map((category) => [category, 0])) as CapturePayload["lossHours"];
}

function emptyLossDetails() {
  return Object.fromEntries(LOSS_CATEGORIES.map((category) => [category, { hours: 0, comments: "" }])) as CapturePayload["lossDetails"];
}

function lossEventFromLegacyLossHours(lossHours: CapturePayload["lossHours"], totalHours: number): CapturePayload["lossEvent"] {
  const firstLoss = LOSS_CATEGORIES.find((category) => (lossHours[category] ?? 0) > 0);
  const reasonByCategory: Record<LossCategory, LossReason> = {
    quarryOversizeJams: "Oversize Jams",
    quarryNoTippers: "No Feed due to Non-Availability of Tippers",
    quarryNoMaterial: "No Material Available in Quarry",
    quarryBlasting: "Blasting",
    plantBreakdown: "Breakdown Hours",
    plantOther: "Other Reasons",
    plantScheduledMaintenance: "Scheduled Maintenance",
    plantIdle: "Idle Hours",
  };
  return {
    reason: firstLoss ? reasonByCategory[firstLoss] : "",
    hours: firstLoss ? lossHours[firstLoss] : totalHours,
    comments: "",
  };
}

function mergeLossDetails(
  fallback: CapturePayload["lossDetails"],
  current: DailyPlantRecord["lossDetails"] | undefined,
  lossHours: CapturePayload["lossHours"],
): CapturePayload["lossDetails"] {
  return Object.fromEntries(
    LOSS_CATEGORIES.map((category) => [
      category,
      {
        hours: current?.[category]?.hours ?? lossHours[category] ?? fallback[category].hours,
        comments: current?.[category]?.comments ?? fallback[category].comments,
      },
    ]),
  ) as CapturePayload["lossDetails"];
}

function recordToPayload(record: DailyPlantRecord): CapturePayload {
  const fallback = defaultPayload();
  const { id, plantCode, plantName, date, targetMt, productionMt, productMix, dispatch, openingStock, closingStock, machineHours, tph, plantHours, lossHours, electrical, loader, cop, remarks, evidencePhotos, submittedBy } = record;
  const plant = PLANT_CONFIGS.find((config) => config.code === plantCode) ?? PLANT_CONFIGS.find((config) => config.aliases.includes(plantCode as never));
  const mergedElectrical = { ...fallback.electrical, ...electrical };
  const mergedLoader = { ...fallback.loader, ...loader };
  const mergedElectricLoader = { ...fallback.electricLoader, ...record.electricLoader };
  const mergedCop = { ...fallback.cop, ...cop };
  const domesticMf = domesticMeterMfFor(plant?.code ?? plantCode);
  return {
    id,
    plantCode: plant?.code ?? plantCode,
    plantName: plant?.name ?? plantName,
    date,
    targetMt,
    productionMt,
    productMixPercentages: { ...fallback.productMixPercentages, ...(record.productMixPercentages ?? {}) },
    productMix: { ...fallback.productMix, ...productMix },
    overburden: { ...fallback.overburden, ...(record.overburden ?? {}) },
    dispatch: { ...fallback.dispatch, ...dispatch },
    openingStock: { ...fallback.openingStock, ...openingStock },
    closingStock: { ...fallback.closingStock, ...closingStock },
    stockAdjustments: { ...fallback.stockAdjustments, ...record.stockAdjustments },
    stockAdjustmentComment: record.stockAdjustmentComment ?? "",
    bookStock: {
      monthlyOpening: { ...fallback.bookStock.monthlyOpening, ...record.bookStock?.monthlyOpening },
      calculatedClosing: { ...fallback.bookStock.calculatedClosing, ...record.bookStock?.calculatedClosing },
    },
    machineHours,
    equipmentHourMeters: record.equipmentHourMeters ?? fallback.equipmentHourMeters,
    tph,
    plantHours,
    lossHours: { ...fallback.lossHours, ...lossHours },
    lossDetails: mergeLossDetails(fallback.lossDetails, record.lossDetails, { ...fallback.lossHours, ...lossHours }),
    lossEvent: record.lossEvent ?? lossEventFromLegacyLossHours({ ...fallback.lossHours, ...lossHours }, plantHours.loss),
    electrical: {
      ...mergedElectrical,
      kwhMultiplyingFactor: plant?.electricalMf ?? mergedElectrical.kwhMultiplyingFactor,
      kvahMultiplyingFactor: plant?.electricalMf ?? mergedElectrical.kvahMultiplyingFactor,
      domestic: {
        ...fallback.electrical.domestic,
        ...electrical.domestic,
        multiplyingFactor: domesticMf,
      },
    },
    loader: {
      ...mergedLoader,
      hourMeter: { ...fallback.loader.hourMeter, ...loader.hourMeter },
      otherWorksHours: loader.otherWorksHours ?? 0,
      productionHours: loader.productionHours ?? loader.hours ?? 0,
      tph: loader.tph ?? 0,
      dieselRate: loader.dieselRate ?? 0,
      dieselVarianceRate: loader.dieselVarianceRate ?? 0,
      includeDieselVariance: loader.includeDieselVariance ?? false,
      dieselCost: loader.dieselCost ?? cop.dieselCost ?? 0,
      dieselVarianceCost: loader.dieselVarianceCost ?? 0,
    },
    electricLoader: {
      ...mergedElectricLoader,
      meter: { ...fallback.electricLoader.meter, ...record.electricLoader?.meter },
      kwh: { ...fallback.electricLoader.kwh, ...record.electricLoader?.kwh },
      kvah: { ...fallback.electricLoader.kvah, ...record.electricLoader?.kvah },
    },
    cop: mergedCop,
    remarks,
    evidencePhotos,
    submittedBy,
  };
}

function upsertRecord(records: DailyPlantRecord[], record: DailyPlantRecord) {
  const next = records.filter((existing) => existing.id !== record.id);
  next.push(record);
  return next.sort((a, b) => a.date.localeCompare(b.date));
}

function setField<K extends keyof CapturePayload>(
  setForm: (updater: (current: CapturePayload) => CapturePayload) => void,
  field: K,
  value: CapturePayload[K],
) {
  setForm((current) => ({ ...current, [field]: value }));
}

function setPlant(
  setForm: (updater: (current: CapturePayload) => CapturePayload) => void,
  plantCode: string,
  records: DailyPlantRecord[] = [],
) {
  const plant = PLANT_CONFIGS.find((config) => config.code === plantCode) ?? PLANT_CONFIGS[0];
  setForm((current) => payloadForPlantDate(current, records, plant.code, current.date));
}

function setDateWithCarryForward(
  setForm: (updater: (current: CapturePayload) => CapturePayload) => void,
  records: DailyPlantRecord[],
  date: string,
) {
  setForm((current) => payloadForPlantDate(current, records, current.plantCode, date));
}

function payloadForPlantDate(
  current: CapturePayload,
  records: DailyPlantRecord[],
  plantCode: string,
  date: string,
) {
  const plant = PLANT_CONFIGS.find((config) => config.code === plantCode) ?? PLANT_CONFIGS[0];
  const existing = records.find((record) => record.plantCode === plant.code && record.date === date);
  if (existing) return recordToPayload(existing);

  const previous = previousRecordForDate(records, plant.code, date);
  const base = defaultPayload();
  const carried = previous ? carryForwardFromPreviousRecord(base, previous, date) : base;
  return {
    ...carried,
    id: undefined,
    plantCode: plant.code,
    plantName: plant.name,
    date,
    targetMt: previous?.targetMt ?? current.targetMt,
    electrical: {
      ...carried.electrical,
      kwhMultiplyingFactor: plant.electricalMf,
      kvahMultiplyingFactor: plant.electricalMf,
      domestic: {
        ...carried.electrical.domestic,
        multiplyingFactor: domesticMeterMfFor(plant.code),
      },
    },
  };
}

function previousRecordForDate(records: DailyPlantRecord[], plantCode: string, date: string) {
  const previousCalendarDate = addDays(date, -1);
  const plantRecords = records
    .filter((record) => record.plantCode === plantCode && record.date < date)
    .sort((a, b) => b.date.localeCompare(a.date));
  return plantRecords.find((record) => record.date === previousCalendarDate) ?? plantRecords[0];
}

function carryForwardFromPreviousRecord(base: CapturePayload, previous: DailyPlantRecord, date: string): CapturePayload {
  const previousPayload = recordToPayload(previous);
  const previousCalculations = calculateDailyRecord(materializeCalculatedFields(previousPayload));
  const closingStock = {
    ...base.openingStock,
    ...previousCalculations.calculatedClosingStock,
  };
  const bookOpening = { ...base.bookStock.monthlyOpening, ...previousCalculations.calculatedBookStock };
  const equipmentHourMeters = {
    jaw: carryEquipmentMeter(previousPayload, "jaw"),
    cone: carryEquipmentMeter(previousPayload, "cone"),
    vsi: carryEquipmentMeter(previousPayload, "vsi"),
  };
  const loaderOpening = previousPayload.loader.hourMeter.closing;
  const electricLoaderOpening = {
    kwh: previousPayload.electricLoader.kwh.closing,
    kvah: previousPayload.electricLoader.kvah.closing,
    meter: previousPayload.electricLoader.meter.closing,
  };

  return {
    ...base,
    plantCode: previousPayload.plantCode,
    plantName: previousPayload.plantName,
    date,
    targetMt: previousPayload.targetMt,
    openingStock: closingStock,
    closingStock,
    bookStock: {
      monthlyOpening: bookOpening,
      calculatedClosing: bookOpening,
    },
    equipmentHourMeters,
    electrical: {
      ...base.electrical,
      openingKwh: previousPayload.electrical.closingKwh,
      closingKwh: previousPayload.electrical.closingKwh,
      kwhMultiplyingFactor: previousPayload.electrical.kwhMultiplyingFactor,
      openingKvah: previousPayload.electrical.closingKvah,
      closingKvah: previousPayload.electrical.closingKvah,
      kvahMultiplyingFactor: previousPayload.electrical.kvahMultiplyingFactor,
      domestic: {
        ...base.electrical.domestic,
        openingKwh: previousPayload.electrical.domestic.closingKwh,
        closingKwh: previousPayload.electrical.domestic.closingKwh,
        multiplyingFactor: previousPayload.electrical.domestic.multiplyingFactor,
      },
      excludeDomesticFromUnitsPerMt: previousPayload.electrical.excludeDomesticFromUnitsPerMt,
      cmd: previousPayload.electrical.cmd,
    },
    loader: {
      ...base.loader,
      hourMeter: {
        opening: loaderOpening,
        closing: loaderOpening,
      },
      dieselRate: previousPayload.loader.dieselRate,
      dieselVarianceRate: previousPayload.loader.dieselVarianceRate,
      includeDieselVariance: previousPayload.loader.includeDieselVariance,
    },
    electricLoader: {
      ...base.electricLoader,
      enabled: previousPayload.electricLoader.enabled,
      meter: {
        opening: electricLoaderOpening.meter,
        closing: electricLoaderOpening.meter,
      },
      kwh: {
        opening: electricLoaderOpening.kwh,
        closing: electricLoaderOpening.kwh,
      },
      kvah: {
        opening: electricLoaderOpening.kvah,
        closing: electricLoaderOpening.kvah,
      },
    },
    cop: {
      ...base.cop,
      fixedCost: previousPayload.cop.fixedCost,
      rawMaterialCost: previousPayload.cop.rawMaterialCost,
      rentPlantCost: previousPayload.cop.rentPlantCost,
      plantMaintenanceCost: previousPayload.cop.plantMaintenanceCost,
      sparesConsumablesCost: previousPayload.cop.sparesConsumablesCost,
      wearPartsCost: previousPayload.cop.wearPartsCost,
      intercartingExpenses: previousPayload.cop.intercartingExpenses,
    },
    submittedBy: previousPayload.submittedBy,
  };
}

function carryEquipmentMeter(previous: CapturePayload, equipment: keyof CapturePayload["equipmentHourMeters"]) {
  const opening = previous.equipmentHourMeters[equipment].closing;
  return { opening, closing: opening };
}

function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function formatDisplayDate(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function setNested<
  K extends "machineHours" | "tph" | "plantHours" | "electrical" | "loader" | "cop",
>(
  setForm: (updater: (current: CapturePayload) => CapturePayload) => void,
  section: K,
  field: keyof CapturePayload[K],
  value: number,
) {
  setForm((current) => ({ ...current, [section]: { ...current[section], [field]: value } }));
}

function setProduct(
  setForm: (updater: (current: CapturePayload) => CapturePayload) => void,
  section: "productMixPercentages" | "productMix" | "dispatch" | "openingStock" | "closingStock" | "stockAdjustments",
  product: (typeof CAPTURE_PRODUCTS)[number],
  value: number,
) {
  setForm((current) => ({ ...current, [section]: { ...current[section], [product]: value } }));
}

function setDispatchProduct(
  setForm: (updater: (current: CapturePayload) => CapturePayload) => void,
  plantCode: string,
  product: (typeof CAPTURE_PRODUCTS)[number],
  value: number,
) {
  setForm((current) => {
    const dispatch = { ...current.dispatch, [product]: value };
    const loader = mirroredLoaderDispatchPlant(plantCode || current.plantName)
      ? { ...current.loader, dispatchMt: roundDisplay(sum(CAPTURE_PRODUCTS.map((item) => dispatch[item]))) }
      : current.loader;
    return { ...current, dispatch, loader };
  });
}

function setOverburden(
  setForm: (updater: (current: CapturePayload) => CapturePayload) => void,
  field: keyof CapturePayload["overburden"],
  value: number,
) {
  setForm((current) => ({ ...current, overburden: { ...current.overburden, [field]: value } }));
}

function setLoaderFlag(
  setForm: (updater: (current: CapturePayload) => CapturePayload) => void,
  field: "includeDieselVariance",
  value: boolean,
) {
  setForm((current) => ({ ...current, loader: { ...current.loader, [field]: value } }));
}

function setBookStock(
  setForm: (updater: (current: CapturePayload) => CapturePayload) => void,
  field: keyof CapturePayload["bookStock"],
  product: (typeof CAPTURE_PRODUCTS)[number],
  value: number,
) {
  setForm((current) => ({
    ...current,
    bookStock: {
      ...current.bookStock,
      [field]: {
        ...current.bookStock[field],
        [product]: value,
      },
    },
  }));
}

function setEquipmentMeter(
  setForm: (updater: (current: CapturePayload) => CapturePayload) => void,
  equipment: keyof CapturePayload["equipmentHourMeters"],
  field: keyof CapturePayload["equipmentHourMeters"]["jaw"],
  value: number,
) {
  setForm((current) => ({
    ...current,
    equipmentHourMeters: {
      ...current.equipmentHourMeters,
      [equipment]: {
        ...current.equipmentHourMeters[equipment],
        [field]: value,
      },
    },
  }));
}

function setLoaderHourMeter(
  setForm: (updater: (current: CapturePayload) => CapturePayload) => void,
  field: keyof CapturePayload["loader"]["hourMeter"],
  value: number,
) {
  setForm((current) => ({
    ...current,
    loader: {
      ...current.loader,
      hourMeter: {
        ...current.loader.hourMeter,
        [field]: value,
      },
    },
  }));
}

function setElectricLoaderReading(
  setForm: (updater: (current: CapturePayload) => CapturePayload) => void,
  group: "meter" | "kwh" | "kvah",
  field: "opening" | "closing",
  value: number,
) {
  setForm((current) => ({
    ...current,
    electricLoader: {
      ...current.electricLoader,
      enabled: true,
      [group]: {
        ...current.electricLoader[group],
        [field]: value,
      },
    },
  }));
}

function setElectricLoaderValue(
  setForm: (updater: (current: CapturePayload) => CapturePayload) => void,
  field: "dispatchMt",
  value: number,
) {
  setForm((current) => ({
    ...current,
    electricLoader: {
      ...current.electricLoader,
      enabled: true,
      [field]: value,
    },
  }));
}

function setDomesticElectrical(
  setForm: (updater: (current: CapturePayload) => CapturePayload) => void,
  field: keyof CapturePayload["electrical"]["domestic"],
  value: number,
) {
  setForm((current) => ({
    ...current,
    electrical: {
      ...current.electrical,
      domestic: {
        ...current.electrical.domestic,
        [field]: value,
      },
    },
  }));
}

function setLossDetail<K extends keyof CapturePayload["lossDetails"][LossCategory]>(
  setForm: (updater: (current: CapturePayload) => CapturePayload) => void,
  category: LossCategory,
  field: K,
  value: CapturePayload["lossDetails"][LossCategory][K],
) {
  setForm((current) => ({
    ...current,
    lossDetails: {
      ...current.lossDetails,
      [category]: {
        ...current.lossDetails[category],
        [field]: value,
      },
    },
  }));
}

function setEvidence(
  setForm: (updater: (current: CapturePayload) => CapturePayload) => void,
  category: PhotoCategory,
  fileName: string,
  previewRecord: DailyPlantRecord,
) {
  const photo: EvidencePhoto = {
    id: `${category}-${Date.now()}`,
    category,
    fileName,
    required: previewRecord.validation.issues.some((issue) => issue.field === `evidencePhotos.${category}`),
    uploadedAt: new Date().toISOString(),
  };
  setForm((current) => ({
    ...current,
    evidencePhotos: [...current.evidencePhotos.filter((existing) => existing.category !== category), photo],
  }));
}

function aggregateProducts(days: ReportSnapshot["daily"]) {
  const buckets = new Map<string, number>();
  days.forEach((day) => {
    day.production.products.forEach((product) => {
      buckets.set(product.name, (buckets.get(product.name) ?? 0) + product.mt);
    });
  });
  return [...buckets].map(([name, value]) => ({ name, value }));
}

function productTotal(values: CapturePayload["productMix"]) {
  return roundDisplay(sum(CAPTURE_PRODUCTS.map((product) => values[product])));
}

function aggregateLosses(days: ReportSnapshot["daily"]) {
  const buckets = new Map<string, number>();
  days.forEach((day) => {
    Object.entries(day.plantHours.lossBreakdown).forEach(([name, value]) => {
      buckets.set(name, (buckets.get(name) ?? 0) + value);
    });
  });
  return [...buckets].filter((entry) => entry[1] > 0).map(([name, value]) => ({ name, value }));
}

function buildProductRatios(products: Array<{ name: string; value: number }>, production: number) {
  return products
    .map((product) => ({
      name: product.name,
      mt: product.value,
      ratio: production ? (product.value / production) * 100 : 0,
    }))
    .sort((a, b) => b.mt - a.mt);
}

function buildBasisRows(days: SnapshotDay[]): BasisRow[] {
  return [
    summarizeBasis("Daily", latestDays(days, 1)),
    summarizeBasis("Weekly", latestDays(days, 7)),
    summarizeBasis("MTD", monthToDateDays(days)),
  ];
}

function buildLoaderRows(days: SnapshotDay[]): LoaderBasisRow[] {
  return [
    summarizeLoader("Daily", latestDays(days, 1)),
    summarizeLoader("Weekly", latestDays(days, 7)),
    summarizeLoader("MTD", monthToDateDays(days)),
  ];
}

function buildCopRows(days: SnapshotDay[]) {
  const production = sum(days.map((day) => day.production.mt));
  const totals = {
    drillingBlasting: sum(days.map((day) => day.cop?.drillingBlastingCost ?? day.cop?.quarryBlastingCost ?? 0)),
    internalTransport: sum(days.map((day) => day.cop?.internalTransportationCost ?? day.cop?.quarryLtCost ?? 0)),
    overburden: sum(days.map((day) => day.cop?.overburdenRemovalCost ?? day.cop?.quarryObCost ?? 0)),
    rawMaterial: sum(days.map((day) => day.cop?.rawMaterialCost ?? 0)),
    rentPlant: sum(days.map((day) => day.cop?.rentPlantCost ?? 0)),
    electricity: sum(days.map((day) => day.cop?.electricalCost ?? 0)),
    plantMaintenance: sum(days.map((day) => day.cop?.plantMaintenanceCost ?? day.cop?.plantCost ?? 0)),
    spares: sum(days.map((day) => day.cop?.sparesConsumablesCost ?? 0)),
    wearParts: sum(days.map((day) => day.cop?.wearPartsCost ?? 0)),
    loaderDiesel: sum(days.map((day) => day.cop?.loaderCost ?? day.loader.dieselCost ?? 0)),
    intercarting: sum(days.map((day) => day.cop?.intercartingExpenses ?? 0)),
    fixed: sum(days.map((day) => day.cop?.fixedCost ?? day.cop?.fixedCostMonthly ?? 0)),
  };
  const variableExcavation = totals.drillingBlasting + totals.internalTransport + totals.overburden;
  const rawMaterialSourcing = totals.rawMaterial + totals.rentPlant;
  const crushing = totals.electricity + totals.plantMaintenance + totals.spares + totals.wearParts;
  const loading = totals.loaderDiesel + totals.intercarting;
  const totalVariable = variableExcavation + rawMaterialSourcing + crushing + loading;
  const totalCop = totalVariable + totals.fixed;
  const row = (label: string, actuals: number, strong = false) => ({ label, actuals: roundDisplay(actuals), perMt: roundDisplay(production ? actuals / production : 0), strong });

  return [
    row("Production", production),
    row("Drilling & Blasting", totals.drillingBlasting),
    row("Internal Transportation", totals.internalTransport),
    row("Overburden Removal", totals.overburden),
    row("Variable Excavation Cost", variableExcavation, true),
    row("Raw materials", totals.rawMaterial),
    row("Rent- Plant", totals.rentPlant),
    row("Raw Material - Boulder Sourcing", rawMaterialSourcing, true),
    row("Diesel - Plant", 0),
    row("Electricity - Variable", totals.electricity),
    row("Plant Maintenance", totals.plantMaintenance),
    row("Spares & consumables", totals.spares),
    row("Wear Parts", totals.wearParts),
    row("Variable Crushing & Screening Costs", crushing, true),
    row("Diesel - loader", totals.loaderDiesel),
    row("Intercarting Expenses", totals.intercarting),
    row("Variable Material loading & handling", loading, true),
    row("Total Variable mfg costs", totalVariable, true),
    row("Fixed cost", totals.fixed, true),
    row("Total COP", totalCop, true),
  ];
}

function buildCopProjectionRows(days: SnapshotDay[]): CopProjectionRow[] {
  const mtdDays = monthToDateDays(days);
  const latest = [...mtdDays].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  if (!latest) {
    return [
      { label: "MTD production", value: 0, suffix: "MT" },
      { label: "Extrapolated production", value: 0, suffix: "MT" },
      { label: "MTD total COP", value: 0 },
      { label: "Extrapolated COP", value: 0 },
      { label: "MTD COP / MT", value: 0 },
    ];
  }
  const [year, month, dayOfMonth] = latest.date.split("-").map(Number);
  const elapsedDays = Math.max(dayOfMonth || mtdDays.length, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const production = sum(mtdDays.map((day) => day.production.mt));
  const totalCop = totalCopCost(mtdDays);
  const copPerMt = production ? totalCop / production : 0;
  const projectedProduction = (production / elapsedDays) * daysInMonth;
  const projectedCop = copPerMt * projectedProduction;
  return [
    { label: "MTD production", value: roundDisplay(production), suffix: "MT" },
    { label: "Elapsed calendar days", value: elapsedDays },
    { label: "Extrapolated production", value: roundDisplay(projectedProduction), suffix: "MT" },
    { label: "MTD total COP", value: roundDisplay(totalCop) },
    { label: "Extrapolated COP", value: roundDisplay(projectedCop) },
    { label: "MTD COP / MT", value: roundDisplay(copPerMt) },
  ];
}

function totalCopCost(days: SnapshotDay[]) {
  const totals = {
    drillingBlasting: sum(days.map((day) => day.cop?.drillingBlastingCost ?? day.cop?.quarryBlastingCost ?? 0)),
    internalTransport: sum(days.map((day) => day.cop?.internalTransportationCost ?? day.cop?.quarryLtCost ?? 0)),
    overburden: sum(days.map((day) => day.cop?.overburdenRemovalCost ?? day.cop?.quarryObCost ?? 0)),
    rawMaterial: sum(days.map((day) => day.cop?.rawMaterialCost ?? 0)),
    rentPlant: sum(days.map((day) => day.cop?.rentPlantCost ?? 0)),
    electricity: sum(days.map((day) => day.cop?.electricalCost ?? 0)),
    plantMaintenance: sum(days.map((day) => day.cop?.plantMaintenanceCost ?? day.cop?.plantCost ?? 0)),
    spares: sum(days.map((day) => day.cop?.sparesConsumablesCost ?? 0)),
    wearParts: sum(days.map((day) => day.cop?.wearPartsCost ?? 0)),
    loaderDiesel: sum(days.map((day) => day.cop?.loaderCost ?? day.loader.dieselCost ?? 0)),
    intercarting: sum(days.map((day) => day.cop?.intercartingExpenses ?? 0)),
    fixed: sum(days.map((day) => day.cop?.fixedCost ?? day.cop?.fixedCostMonthly ?? 0)),
  };
  return (
    totals.drillingBlasting +
    totals.internalTransport +
    totals.overburden +
    totals.rawMaterial +
    totals.rentPlant +
    totals.electricity +
    totals.plantMaintenance +
    totals.spares +
    totals.wearParts +
    totals.loaderDiesel +
    totals.intercarting +
    totals.fixed
  );
}

function buildMtdRows(days: SnapshotDay[]) {
  let production = 0;
  let dispatch = 0;
  return monthToDateDays(days).map((day) => {
    production += day.production.mt;
    dispatch += day.dispatch.totalMt;
    return {
      label: day.label,
      production: roundDisplay(production),
      dispatch: roundDisplay(dispatch),
    };
  });
}

function buildPeriodSummaryRows(days: SnapshotDay[], period: "week" | "month"): PeriodSummaryRow[] {
  const groups = new Map<string, SnapshotDay[]>();
  [...days].sort((a, b) => a.date.localeCompare(b.date)).forEach((day) => {
    const key = period === "week" ? weekGroupKey(day.date) : day.date.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), day]);
  });

  return [...groups.entries()].map(([key, groupedDays]) => summarizePeriod(key, groupedDays));
}

function summarizePeriod(label: string, days: SnapshotDay[]): PeriodSummaryRow {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const target = sum(sorted.map((day) => day.targetMt));
  const production = sum(sorted.map((day) => day.production.mt));
  const dispatch = sum(sorted.map((day) => day.dispatch.totalMt));
  const loaderDispatch = sum(sorted.map((day) => day.loader.dispatchMt));
  const loaderDiesel = sum(sorted.map((day) => day.loader.dieselLitres));

  return {
    label,
    start: sorted[0]?.date ?? "",
    end: sorted.at(-1)?.date ?? "",
    target: roundDisplay(target),
    production: roundDisplay(production),
    dispatch: roundDisplay(dispatch),
    achievementPct: roundDisplay(target ? (production / target) * 100 : 0),
    jawTph: roundDisplay(average(sorted.map((day) => day.machine.jawTph))),
    vsiTph: roundDisplay(average(sorted.map((day) => day.machine.vsiTph))),
    kvahPerMt: roundDisplay(weightedAverage(sorted.map((day) => [day.electrical.unitsPerMt, day.production.mt]))),
    loaderLitresPerMt: roundDisplay(loaderDispatch ? loaderDiesel / loaderDispatch : 0),
    lossHours: roundDisplay(sum(sorted.map((day) => day.plantHours.lossHours))),
  };
}

function weekGroupKey(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  const dayOfWeek = parsed.getUTCDay() || 7;
  const monday = new Date(parsed);
  monday.setUTCDate(parsed.getUTCDate() - dayOfWeek + 1);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return `${formatDisplayDate(monday.toISOString().slice(0, 10))} to ${formatDisplayDate(sunday.toISOString().slice(0, 10))}`;
}

function summarizeBasis(label: BasisRow["label"], days: SnapshotDay[]): BasisRow {
  return {
    label,
    production: roundDisplay(sum(days.map((day) => day.production.mt))),
    jawTph: roundDisplay(average(days.map((day) => day.machine.jawTph))),
    coneTph: roundDisplay(average(days.map((day) => day.machine.coneTph))),
    vsiTph: roundDisplay(average(days.map((day) => day.machine.vsiTph))),
    unitsPerMt: roundDisplay(weightedAverage(days.map((day) => [day.electrical.unitsPerMt, day.production.mt]))),
  };
}

function summarizeLoader(label: LoaderBasisRow["label"], days: SnapshotDay[]): LoaderBasisRow {
  const dispatchMt = sum(days.map((day) => day.loader.dispatchMt));
  const dieselLitres = sum(days.map((day) => day.loader.dieselLitres));
  const runningHours = sum(days.map((day) => day.loader.hours));

  return {
    label,
    runningHours: roundDisplay(runningHours),
    litresPerMt: roundDisplay(dispatchMt ? dieselLitres / dispatchMt : 0),
    tph: roundDisplay(runningHours ? dispatchMt / runningHours : 0),
    dispatchMt: roundDisplay(dispatchMt),
  };
}

function buildElectricLoaderRows(days: SnapshotDay[]) {
  return [
    summarizeElectricLoader("Daily", latestDays(days, 1)),
    summarizeElectricLoader("Weekly", latestDays(days, 7)),
    summarizeElectricLoader("MTD", monthToDateDays(days)),
  ];
}

function summarizeElectricLoader(label: ElectricLoaderBasisRow["label"], days: SnapshotDay[]): ElectricLoaderBasisRow {
  const tracked = days.map((day) => day.electricLoader).filter((item): item is NonNullable<SnapshotDay["electricLoader"]> => Boolean(item));
  const dispatchMt = sum(tracked.map((item) => item.dispatchMt));
  const kwhUnits = sum(tracked.map((item) => item.kwhUnits));
  const kvahUnits = sum(tracked.map((item) => item.kvahUnits));
  const runningHours = sum(tracked.map((item) => item.runningHours));

  return {
    dispatchMt: roundDisplay(dispatchMt),
    kwhUnits: roundDisplay(kwhUnits),
    kvahUnits: roundDisplay(kvahUnits),
    label,
    runningHours: roundDisplay(runningHours),
    tph: roundDisplay(runningHours ? dispatchMt / runningHours : 0),
    unitsPerMt: roundDisplay(dispatchMt ? kvahUnits / dispatchMt : 0),
  };
}

function latestDays(days: SnapshotDay[], count: number) {
  return [...days].sort((a, b) => a.date.localeCompare(b.date)).slice(-count);
}

function monthToDateDays(days: SnapshotDay[]) {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted.at(-1);
  if (!latest) return [];
  const month = latest.date.slice(0, 7);
  return sorted.filter((day) => day.date.startsWith(month));
}

function weightedAverage(values: Array<[number, number]>) {
  const weightedTotal = values.reduce((total, [value, weight]) => total + (Number.isFinite(value) ? value : 0) * weight, 0);
  const weightTotal = values.reduce((total, [, weight]) => total + (Number.isFinite(weight) ? weight : 0), 0);
  return weightTotal ? weightedTotal / weightTotal : 0;
}

function lossCategoryLabel(category: LossCategory) {
  const labels: Record<LossCategory, string> = {
    quarryOversizeJams: "Over size Jam",
    quarryNoTippers: "No feed due to tippers",
    quarryNoMaterial: "No feed due to Material Not available",
    quarryBlasting: "Blasting",
    plantBreakdown: "Breakdown Hrs",
    plantScheduledMaintenance: "Schedule maintenance",
    plantIdle: "Idle Hours",
    plantOther: "Other reasons",
  };
  return labels[category];
}

function formatHours(value: number) {
  const safe = Number.isFinite(value) && value > 0 ? value : 0;
  const totalMinutes = Math.round(safe * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function parseHours(value: string) {
  const normalized = value.trim();
  if (!normalized) return 0;
  const [hoursRaw, minutesRaw = "0"] = normalized.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return Math.max(0, hours + Math.min(Math.max(minutes, 0), 59) / 60);
}

function dataset(label: string, data: number[], color: string) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: color,
    borderWidth: 2,
    tension: 0.25,
    pointRadius: 2,
  };
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function average(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value) && value > 0);
  return valid.length ? sum(valid) / valid.length : 0;
}

function roundDisplay(value: number, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function tabClass(active: WorkspaceTab, tab: WorkspaceTab) {
  return active === tab ? "btn primary" : "btn";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: "bottom" as const } },
  scales: { x: { grid: { display: false } }, y: { beginAtZero: true } },
};

const labelledBarOptions = {
  ...chartOptions,
  plugins: {
    ...chartOptions.plugins,
    valueLabel: true,
  },
};

const scatterOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { title: { display: true, text: "Jaw TPH" } },
    y: { title: { display: true, text: "Production MT" }, beginAtZero: true },
  },
};
