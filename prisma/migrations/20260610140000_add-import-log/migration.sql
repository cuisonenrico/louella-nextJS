-- CreateTable
CREATE TABLE "ImportLog" (
    "id"           SERIAL NOT NULL,
    "branchId"     INTEGER NOT NULL,
    "fileName"     TEXT NOT NULL,
    "fileHash"     TEXT NOT NULL,
    "importedBy"   INTEGER,
    "importedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sheetCount"   INTEGER NOT NULL DEFAULT 0,
    "rowCount"     INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "status"       TEXT NOT NULL DEFAULT 'SUCCESS',
    "notes"        TEXT,

    CONSTRAINT "ImportLog_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex (enforces one log per file per branch)
CREATE UNIQUE INDEX "ImportLog_branchId_fileHash_key" ON "ImportLog"("branchId", "fileHash");

-- CreateIndex
CREATE INDEX "ImportLog_importedAt_idx" ON "ImportLog"("importedAt");

-- AddForeignKey
ALTER TABLE "ImportLog" ADD CONSTRAINT "ImportLog_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportLog" ADD CONSTRAINT "ImportLog_importedBy_fkey"
    FOREIGN KEY ("importedBy") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
