CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "username" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlantAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plantCode" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedById" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PlantAccess_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccessAuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT,
    "targetUserId" TEXT,
    "plantCode" TEXT,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppUser_username_key" ON "AppUser"("username");
CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");
CREATE INDEX "AppUser_role_isActive_idx" ON "AppUser"("role", "isActive");
CREATE INDEX "PlantAccess_plantCode_isActive_idx" ON "PlantAccess"("plantCode", "isActive");
CREATE INDEX "PlantAccess_userId_isActive_idx" ON "PlantAccess"("userId", "isActive");
CREATE INDEX "AccessAuditLog_plantCode_createdAt_idx" ON "AccessAuditLog"("plantCode", "createdAt");
CREATE INDEX "AccessAuditLog_targetUserId_createdAt_idx" ON "AccessAuditLog"("targetUserId", "createdAt");

CREATE UNIQUE INDEX "PlantAccess_one_active_user_per_plant" ON "PlantAccess"("plantCode") WHERE "isActive" = true;
CREATE UNIQUE INDEX "PlantAccess_one_active_plant_per_user" ON "PlantAccess"("userId") WHERE "isActive" = true;

ALTER TABLE "PlantAccess" ADD CONSTRAINT "PlantAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantAccess" ADD CONSTRAINT "PlantAccess_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlantAccess" ADD CONSTRAINT "PlantAccess_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccessAuditLog" ADD CONSTRAINT "AccessAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccessAuditLog" ADD CONSTRAINT "AccessAuditLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
