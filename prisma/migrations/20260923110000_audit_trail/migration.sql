-- DropIndex
DROP INDEX "ImportLog_branchId_fileHash_key";

-- AlterTable
ALTER TABLE "Production" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "updatedById" INTEGER;

-- AlterTable
ALTER TABLE "ImportLog" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" SERIAL NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "userId" INTEGER,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditEvent_entity_entityId_at_idx" ON "AuditEvent"("entity", "entityId", "at");

-- CreateIndex
CREATE INDEX "AuditEvent_userId_idx" ON "AuditEvent"("userId");

-- CreateIndex
CREATE INDEX "AuditEvent_at_idx" ON "AuditEvent"("at");

-- CreateIndex
CREATE INDEX "Production_updatedById_idx" ON "Production"("updatedById");

-- CreateIndex
CREATE INDEX "ImportLog_branchId_fileHash_idx" ON "ImportLog"("branchId", "fileHash");

-- AddForeignKey
ALTER TABLE "Production" ADD CONSTRAINT "Production_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- One file per branch among *live* import logs. A soft-deleted log no longer
-- blocks the corrected re-import it was deleted to allow, yet stays on record.
-- Prisma cannot express a partial unique index; see the note on ImportLog.
CREATE UNIQUE INDEX "ImportLog_live_file_key"
  ON "ImportLog" ("branchId", "fileHash")
  WHERE "deletedAt" IS NULL;
