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
  FileUp,
  Lock,
  Presentation,
  RefreshCw,
  Save,
  Send,
} from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { calculateDailyRecord } from "@/src/lib/capture/calculations";
import {
  CAPTURE_PRODUCTS,
  LOSS_CATEGORIES,
  PHOTO_CATEGORIES,
  type CapturePayload,
  type DailyPlantRecord,
  type EvidencePhoto,
  type LossCategory,
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
  initialSnapshot: ReportSnapshot | null;
  initialRecords: DailyPlantRecord[];
};

type WorkspaceTab = "capture" | "dashboard" | "reports";
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

const fmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1, style: "percent" });

export function DashboardShell({ initialSnapshot, initialRecords }: Props) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("capture");
  const [dashboardView, setDashboardView] = useState<DashboardView>("daily");
  const [records, setRecords] = useState(initialRecords);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [form, setForm] = useState<CapturePayload>(() => defaultPayload());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(initialSnapshot?.period.start ?? todayIso());
  const [endDate, setEndDate] = useState(initialSnapshot?.period.end ?? todayIso());
  const [reportType, setReportType] = useState<"DAILY" | "WEEKLY" | "MONTHLY">("WEEKLY");
  const fileRef = useRef<HTMLInputElement>(null);

  const previewRecord = useMemo(() => {
    const calculations = calculateDailyRecord(form);
    const draft: DailyPlantRecord = {
      ...form,
      id: form.id || "preview",
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
        body: JSON.stringify({ action, record: form, actor: "operations-head" }),
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

  async function buildSnapshot() {
    setBusy(true);
    setStatus("Building locked report snapshot from validated daily records...");

    try {
      const response = await fetch("/api/snapshots/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plantCode: form.plantCode,
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

  const labels = visibleDays.map((d) => d.label);
  const productMix = aggregateProducts(visibleDays);
  const lossBuckets = aggregateLosses(visibleDays);

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Robo Silicon operations</p>
          <h1>Daily plant reality capture before reporting</h1>
          <p className="subtitle">
            Operators capture plant data once. Validation blocks weak data before it reaches
            dashboards, locked snapshots, PowerPoint, PDF, or management summaries.
          </p>
        </div>
        <div className="toolbar">
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
        </div>
      </section>

      {activeTab === "capture" ? (
        <CaptureWorkspace
          busy={busy}
          form={form}
          previewRecord={previewRecord}
          records={records}
          setForm={setForm}
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
          busy={busy}
          buildSnapshot={buildSnapshot}
          endDate={endDate}
          fileRef={fileRef}
          generatePpt={generatePpt}
          importWorkbook={importWorkbook}
          reportType={reportType}
          setEndDate={setEndDate}
          setReportType={setReportType}
          setStartDate={setStartDate}
          snapshot={snapshot}
          startDate={startDate}
        />
      ) : null}

      {status ? <p className="status-line">{status}</p> : null}
    </main>
  );
}

function CaptureWorkspace({
  busy,
  form,
  previewRecord,
  records,
  setForm,
  saveDraft,
  submitFinal,
}: {
  busy: boolean;
  form: CapturePayload;
  previewRecord: DailyPlantRecord;
  records: DailyPlantRecord[];
  setForm: (updater: CapturePayload | ((current: CapturePayload) => CapturePayload)) => void;
  saveDraft: () => void;
  submitFinal: () => void;
}) {
  return (
    <section className="capture-layout">
      <div className="capture-form">
        <Section title="Plant and date" meta="Mandatory">
          <div className="form-grid four">
            <TextField label="Plant code" value={form.plantCode} onChange={(value) => setField(setForm, "plantCode", value)} />
            <TextField label="Plant name" value={form.plantName} onChange={(value) => setField(setForm, "plantName", value)} />
            <TextField label="Date" type="date" value={form.date} onChange={(value) => setField(setForm, "date", value)} />
            <NumberField label="Target MT" value={form.targetMt} onChange={(value) => setField(setForm, "targetMt", value)} />
          </div>
        </Section>

        <Section title="Production and product mix" meta="Production must equal mix total">
          <div className="form-grid two">
            <NumberField label="Production MT" value={form.productionMt} onChange={(value) => setField(setForm, "productionMt", value)} />
            <ReadOnlyMetric label="Product mix total" value={previewRecord.calculations.productMixTotal} suffix="MT" />
          </div>
          <ProductGrid values={form.productMix} onChange={(product, value) => setProduct(setForm, "productMix", product, value)} />
        </Section>

        <Section title="Dispatch, opening and closing stock" meta="Closing = opening + production - dispatch">
          <h3 className="section-subtitle">Dispatch</h3>
          <ProductGrid values={form.dispatch} onChange={(product, value) => setProduct(setForm, "dispatch", product, value)} />
          <h3 className="section-subtitle">Opening stock</h3>
          <ProductGrid values={form.openingStock} onChange={(product, value) => setProduct(setForm, "openingStock", product, value)} />
          <h3 className="section-subtitle">Closing stock</h3>
          <ProductGrid values={form.closingStock} onChange={(product, value) => setProduct(setForm, "closingStock", product, value)} />
        </Section>

        <Section title="Machine running hours and TPH" meta="Machine hours cannot exceed available hours">
          <div className="form-grid three">
            <NumberField label="Jaw hours" value={form.machineHours.jaw} onChange={(value) => setNested(setForm, "machineHours", "jaw", value)} />
            <NumberField label="Cone hours" value={form.machineHours.cone} onChange={(value) => setNested(setForm, "machineHours", "cone", value)} />
            <NumberField label="VSI hours" value={form.machineHours.vsi} onChange={(value) => setNested(setForm, "machineHours", "vsi", value)} />
            <NumberField label="Jaw TPH" value={form.tph.jaw} onChange={(value) => setNested(setForm, "tph", "jaw", value)} />
            <NumberField label="Cone TPH" value={form.tph.cone} onChange={(value) => setNested(setForm, "tph", "cone", value)} />
            <NumberField label="VSI TPH" value={form.tph.vsi} onChange={(value) => setNested(setForm, "tph", "vsi", value)} />
          </div>
        </Section>

        <Section title="Plant available hours, stoppages and loss hours" meta="Hours must reconcile">
          <div className="form-grid four">
            <NumberField label="Available hours" value={form.plantHours.available} onChange={(value) => setNested(setForm, "plantHours", "available", value)} />
            <NumberField label="Production hours" value={form.plantHours.production} onChange={(value) => setNested(setForm, "plantHours", "production", value)} />
            <NumberField label="Scheduled stoppage" value={form.plantHours.scheduledStoppage} onChange={(value) => setNested(setForm, "plantHours", "scheduledStoppage", value)} />
            <NumberField label="Loss hours" value={form.plantHours.loss} onChange={(value) => setNested(setForm, "plantHours", "loss", value)} />
          </div>
          <div className="form-grid loss-grid">
            {LOSS_CATEGORIES.map((category) => (
              <NumberField
                key={category}
                label={category}
                value={form.lossHours[category]}
                onChange={(value) => setLoss(setForm, category, value)}
              />
            ))}
          </div>
        </Section>

        <Section title="Electrical readings and units" meta="Units/MT auto-calculated">
          <div className="form-grid four">
            <NumberField label="Opening kWh" value={form.electrical.openingKwh} onChange={(value) => setNested(setForm, "electrical", "openingKwh", value)} />
            <NumberField label="Closing kWh" value={form.electrical.closingKwh} onChange={(value) => setNested(setForm, "electrical", "closingKwh", value)} />
            <NumberField label="Units consumed" value={form.electrical.unitsConsumed} onChange={(value) => setNested(setForm, "electrical", "unitsConsumed", value)} />
            <NumberField label="Power factor" value={form.electrical.powerFactor} step="0.001" onChange={(value) => setNested(setForm, "electrical", "powerFactor", value)} />
            <ReadOnlyMetric label="Units / MT" value={previewRecord.calculations.unitsPerMt} />
          </div>
        </Section>

        <Section title="Loader and COP inputs" meta="Litres/MT and COP/MT auto-calculated">
          <div className="form-grid four">
            <NumberField label="Loader hours" value={form.loader.hours} onChange={(value) => setNested(setForm, "loader", "hours", value)} />
            <NumberField label="Loader diesel L" value={form.loader.dieselLitres} onChange={(value) => setNested(setForm, "loader", "dieselLitres", value)} />
            <NumberField label="Loader dispatch MT" value={form.loader.dispatchMt} onChange={(value) => setNested(setForm, "loader", "dispatchMt", value)} />
            <ReadOnlyMetric label="Loader L / MT" value={previewRecord.calculations.loaderLitresPerMt} />
            <NumberField label="Power cost" value={form.cop.powerCost} onChange={(value) => setNested(setForm, "cop", "powerCost", value)} />
            <NumberField label="Diesel cost" value={form.cop.dieselCost} onChange={(value) => setNested(setForm, "cop", "dieselCost", value)} />
            <NumberField label="Consumables cost" value={form.cop.consumablesCost} onChange={(value) => setNested(setForm, "cop", "consumablesCost", value)} />
            <NumberField label="Maintenance cost" value={form.cop.maintenanceCost} onChange={(value) => setNested(setForm, "cop", "maintenanceCost", value)} />
            <ReadOnlyMetric label="COP / MT" value={previewRecord.calculations.copPerMt} />
          </div>
        </Section>

        <Section title="Remarks and evidence photos" meta="Required for exceptions">
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
              ["Units/MT", fmt.format(previewRecord.calculations.unitsPerMt)],
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
                <span>{record.date}</span>
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
        <Kpi title="Units / MT" value={fmt.format(totals.unitsMt)} detail="Auto-calculated" />
        <Kpi title="Loader L / MT" value={fmt.format(loaderRows[0]?.litresPerMt ?? 0)} detail={`${fmt.format(totals.diesel)} L diesel`} />
      </section>

      <section className="grid dashboard-summary-grid">
        <Panel title="Production and product ratios" meta="Linked to total production">
          <RatioTable rows={productRatios} />
        </Panel>
        <Panel title="Daily / Weekly / MTD KPI basis" meta="TPH and Units/MT">
          <BasisTable rows={basisRows} />
        </Panel>
      </section>

      {dashboardView === "exceptions" ? (
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
                    <td>{record.date}</td>
                    <td>{record.status}</td>
                    <td>{record.reviewStatus}</td>
                    <td>{record.validation.issues.map((issue) => issue.code).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : (
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
                    datasets: [{ data: productMix.map((p) => p.value), backgroundColor: ["#087f8c", "#f3a712", "#2f855a", "#d1495b", "#183153", "#7a5195"] }],
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
              <Panel title="Electrical efficiency" meta="Units / MT">
                <Line
                  data={{
                    labels,
                    datasets: [
                      dataset("Units / MT", visibleDays.map((d) => d.electrical.unitsPerMt), "#f3a712"),
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
            </div>
            <Panel title="Loader Daily / Weekly / MTD trends" meta="Running hours, Ltr/MT, TPH and dispatch">
              <LoaderTable rows={loaderRows} />
            </Panel>
          </div>

          <aside className="grid side-stack">
            <Panel title="Locked snapshot" meta={snapshot.status}>
              <div className="commentary">
                <ul>
                  <li>
                    <Lock size={14} /> {snapshot.version}
                  </li>
                  <li>Period: {snapshot.period.start} to {snapshot.period.end}</li>
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
      )}

      <section className="panel table-panel">
        <div className="panel-header">
          <h2>Daily operations log</h2>
          <span>{visibleDays.length} rows</span>
        </div>
        <DailyTable days={visibleDays} />
      </section>
    </>
  );
}

function ReportsWorkspace({
  busy,
  buildSnapshot,
  endDate,
  fileRef,
  generatePpt,
  importWorkbook,
  reportType,
  setEndDate,
  setReportType,
  setStartDate,
  snapshot,
  startDate,
}: {
  busy: boolean;
  buildSnapshot: () => void;
  endDate: string;
  fileRef: React.RefObject<HTMLInputElement | null>;
  generatePpt: () => void;
  importWorkbook: () => void;
  reportType: "DAILY" | "WEEKLY" | "MONTHLY";
  setEndDate: (value: string) => void;
  setReportType: (value: "DAILY" | "WEEKLY" | "MONTHLY") => void;
  setStartDate: (value: string) => void;
  snapshot: ReportSnapshot | null;
  startDate: string;
}) {
  return (
    <section className="reports-grid">
      <Panel title="Generate locked dashboard snapshot" meta="Database to report">
        <div className="form-grid two report-controls">
          <TextField label="Start date" type="date" value={startDate} onChange={setStartDate} />
          <TextField label="End date" type="date" value={endDate} onChange={setEndDate} />
          <label className="field">
            <span>Report type</span>
            <select value={reportType} onChange={(event) => setReportType(event.target.value as "DAILY" | "WEEKLY" | "MONTHLY")}>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </label>
          <div className="required-photo-list">
            <strong>Required photo categories</strong>
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

      <Panel title="Current locked snapshot" meta={snapshot ? snapshot.status : "None"}>
        {snapshot ? (
          <MetricList
            items={[
              ["Plant", snapshot.plantCode],
              ["Period", `${snapshot.period.start} to ${snapshot.period.end}`],
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

function Section({ title, meta, children }: { title: string; meta: string; children: ReactNode }) {
  return (
    <section className="form-section">
      <div className="panel-header">
        <h2>{title}</h2>
        <span>{meta}</span>
      </div>
      <div className="section-body">{children}</div>
    </section>
  );
}

function TextField({
  label,
  onChange,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberField({
  label,
  onChange,
  step = "0.01",
  value,
}: {
  label: string;
  onChange: (value: number) => void;
  step?: string;
  value: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" step={step} value={String(value)} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function ReadOnlyMetric({ label, suffix, value }: { label: string; suffix?: string; value: number }) {
  return (
    <div className="readonly-metric">
      <span>{label}</span>
      <strong>{fmt.format(value)}{suffix ? ` ${suffix}` : ""}</strong>
    </div>
  );
}

function ProductGrid({
  onChange,
  values,
}: {
  onChange: (product: (typeof CAPTURE_PRODUCTS)[number], value: number) => void;
  values: CapturePayload["productMix"];
}) {
  return (
    <div className="form-grid product-grid">
      {CAPTURE_PRODUCTS.map((product) => (
        <NumberField key={product} label={product} value={values[product]} onChange={(value) => onChange(product, value)} />
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
            <th>Units/MT</th>
            <th>Loader L/MT</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <td>{day.date}</td>
              <td>{fmt.format(day.targetMt)}</td>
              <td>{fmt.format(day.production.mt)}</td>
              <td>{fmt.format(day.dispatch.totalMt)}</td>
              <td>{fmt.format(day.machine.jawTph)}</td>
              <td>{fmt.format(day.machine.vsiTph)}</td>
              <td>{fmt.format(day.plantHours.productionHours)}</td>
              <td>{fmt.format(day.plantHours.lossHours)}</td>
              <td>{fmt.format(day.electrical.unitsPerMt)}</td>
              <td>{fmt.format(day.loader.litresPerMt)}</td>
            </tr>
          ))}
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
            <th>Units/MT</th>
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
              <td>{fmt.format(row.runningHours)}</td>
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

function defaultPayload(): CapturePayload {
  return {
    plantCode: "GIR-1",
    plantName: "GIR 1",
    date: todayIso(),
    targetMt: 1700,
    productionMt: 0,
    productMix: emptyProducts(),
    dispatch: emptyProducts(),
    openingStock: emptyProducts(),
    closingStock: emptyProducts(),
    machineHours: { jaw: 0, cone: 0, vsi: 0 },
    tph: { jaw: 0, cone: 0, vsi: 0 },
    plantHours: { available: 24, production: 0, scheduledStoppage: 0, loss: 0 },
    lossHours: emptyLosses(),
    electrical: { openingKwh: 0, closingKwh: 0, unitsConsumed: 0, powerFactor: 0.98 },
    loader: { hours: 0, dieselLitres: 0, dispatchMt: 0 },
    cop: { powerCost: 0, dieselCost: 0, consumablesCost: 0, maintenanceCost: 0 },
    remarks: "",
    evidencePhotos: [],
    submittedBy: "operations-head",
  };
}

function emptyProducts() {
  return Object.fromEntries(CAPTURE_PRODUCTS.map((product) => [product, 0])) as CapturePayload["productMix"];
}

function emptyLosses() {
  return Object.fromEntries(LOSS_CATEGORIES.map((category) => [category, 0])) as CapturePayload["lossHours"];
}

function recordToPayload(record: DailyPlantRecord): CapturePayload {
  const { id, plantCode, plantName, date, targetMt, productionMt, productMix, dispatch, openingStock, closingStock, machineHours, tph, plantHours, lossHours, electrical, loader, cop, remarks, evidencePhotos, submittedBy } = record;
  return { id, plantCode, plantName, date, targetMt, productionMt, productMix, dispatch, openingStock, closingStock, machineHours, tph, plantHours, lossHours, electrical, loader, cop, remarks, evidencePhotos, submittedBy };
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
  section: "productMix" | "dispatch" | "openingStock" | "closingStock",
  product: (typeof CAPTURE_PRODUCTS)[number],
  value: number,
) {
  setForm((current) => ({ ...current, [section]: { ...current[section], [product]: value } }));
}

function setLoss(
  setForm: (updater: (current: CapturePayload) => CapturePayload) => void,
  category: LossCategory,
  value: number,
) {
  setForm((current) => ({ ...current, lossHours: { ...current.lossHours, [category]: value } }));
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
