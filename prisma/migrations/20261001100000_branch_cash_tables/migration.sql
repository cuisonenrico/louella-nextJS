-- CreateEnum
CREATE TYPE "BranchCashDayStatus" AS ENUM ('OPEN', 'VERIFIED');

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "requiresNote" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchExpense" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "createdById" INTEGER NOT NULL,
    "updatedById" INTEGER,
    "deletedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BranchExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchVale" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "createdById" INTEGER NOT NULL,
    "updatedById" INTEGER,
    "deletedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BranchVale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchCashDay" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "actualCash" DECIMAL(12,2),
    "note" TEXT,
    "status" "BranchCashDayStatus" NOT NULL DEFAULT 'OPEN',
    "verifiedById" INTEGER,
    "verifiedAt" TIMESTAMP(3),
    "salesAtVerify" DECIMAL(12,2),
    "expensesAtVerify" DECIMAL(12,2),
    "valeAtVerify" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchCashDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_name_key" ON "ExpenseCategory"("name");

-- CreateIndex
CREATE INDEX "BranchExpense_branchId_date_idx" ON "BranchExpense"("branchId", "date");

-- CreateIndex
CREATE INDEX "BranchExpense_categoryId_idx" ON "BranchExpense"("categoryId");

-- CreateIndex
CREATE INDEX "BranchVale_branchId_date_idx" ON "BranchVale"("branchId", "date");

-- CreateIndex
CREATE INDEX "BranchVale_employeeId_date_idx" ON "BranchVale"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "BranchCashDay_branchId_date_key" ON "BranchCashDay"("branchId", "date");

-- AddForeignKey
ALTER TABLE "BranchExpense" ADD CONSTRAINT "BranchExpense_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchExpense" ADD CONSTRAINT "BranchExpense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchVale" ADD CONSTRAINT "BranchVale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchVale" ADD CONSTRAINT "BranchVale_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchCashDay" ADD CONSTRAINT "BranchCashDay_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Amounts are positive. The DTOs enforce this too; the database is the backstop.
ALTER TABLE "BranchExpense"
  ADD CONSTRAINT "BranchExpense_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "BranchVale"
  ADD CONSTRAINT "BranchVale_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "BranchCashDay"
  ADD CONSTRAINT "BranchCashDay_actualCash_nonnegative" CHECK ("actualCash" IS NULL OR "actualCash" >= 0);

-- The starting category list. Admins manage it from Cash Reports.
INSERT INTO "ExpenseCategory" ("name", "sortOrder", "requiresNote", "updatedAt") VALUES
  ('Utilities', 10, false, NOW()),
  ('Transport', 20, false, NOW()),
  ('Supplies',  30, false, NOW()),
  ('Repairs',   40, false, NOW()),
  ('Other',     90, true,  NOW())
ON CONFLICT ("name") DO NOTHING;
