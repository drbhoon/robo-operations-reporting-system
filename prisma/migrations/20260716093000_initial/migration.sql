-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Plant" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyPlantRecord" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "plantCode" TEXT NOT NULL,
    "recordDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "reviewStatus" TEXT NOT NULL,
    "validationStatus" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "submittedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyPlantRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT,
    "summary" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSnapshot" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "sourceFileName" TEXT NOT NULL,
    "sourceChecksum" TEXT NOT NULL,
    "validationStatus" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationIssue" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "field" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidationIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedReport" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT true,
    "generatedBy" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plant_code_key" ON "Plant"("code");

-- CreateIndex
CREATE INDEX "DailyPlantRecord_plantId_recordDate_idx" ON "DailyPlantRecord"("plantId", "recordDate");

-- CreateIndex
CREATE INDEX "DailyPlantRecord_status_validationStatus_idx" ON "DailyPlantRecord"("status", "validationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "DailyPlantRecord_plantCode_recordDate_key" ON "DailyPlantRecord"("plantCode", "recordDate");

-- CreateIndex
CREATE INDEX "AuditLog_recordId_createdAt_idx" ON "AuditLog"("recordId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReportSnapshot_version_key" ON "ReportSnapshot"("version");

-- CreateIndex
CREATE INDEX "ReportSnapshot_plantId_periodStart_periodEnd_idx" ON "ReportSnapshot"("plantId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "ReportSnapshot_sourceChecksum_idx" ON "ReportSnapshot"("sourceChecksum");

-- CreateIndex
CREATE INDEX "ValidationIssue_snapshotId_severity_idx" ON "ValidationIssue"("snapshotId", "severity");

-- CreateIndex
CREATE INDEX "GeneratedReport_snapshotId_format_idx" ON "GeneratedReport"("snapshotId", "format");

-- AddForeignKey
ALTER TABLE "DailyPlantRecord" ADD CONSTRAINT "DailyPlantRecord_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "DailyPlantRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSnapshot" ADD CONSTRAINT "ReportSnapshot_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationIssue" ADD CONSTRAINT "ValidationIssue_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ReportSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedReport" ADD CONSTRAINT "GeneratedReport_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ReportSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

