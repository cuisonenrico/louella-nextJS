-- CreateEnum
CREATE TYPE "PayrollAdjustmentKind" AS ENUM ('ADDITION', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "PayrollAdjustmentCategory" AS ENUM ('OVERTIME', 'BONUS', 'HOLIDAY', 'ALLOWANCE', 'OFFENSE', 'OTHER');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('FINALIZED', 'PAID', 'VOIDED');

-- CreateEnum
CREATE TYPE "PayslipLineType" AS ENUM ('BASIC', 'ADDITION', 'DEDUCTION', 'EMPLOYER_SHARE');

-- CreateTable
CREATE TABLE "JobRole" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" SERIAL NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "jobRoleId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "restDays" INTEGER[] DEFAULT ARRAY[0]::INTEGER[],
    "hiredOn" DATE NOT NULL,
    "separatedOn" DATE,
    "userId" INTEGER,
    "phone" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeRate" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "dailyRate" DECIMAL(12,2) NOT NULL,
    "effectiveOn" DATE NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EmployeeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringDeduction" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "employeeShare" DECIMAL(12,2) NOT NULL,
    "employerShare" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Absence" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "note" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Absence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollAdjustment" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "periodStart" DATE NOT NULL,
    "kind" "PayrollAdjustmentKind" NOT NULL,
    "category" "PayrollAdjustmentCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PayrollAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringDeductionSkip" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "recurringDeductionId" INTEGER NOT NULL,
    "periodStart" DATE NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RecurringDeductionSkip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" SERIAL NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'FINALIZED',
    "employeeCount" INTEGER NOT NULL,
    "totalNetPay" DECIMAL(14,2) NOT NULL,
    "totalEmployerShare" DECIMAL(14,2) NOT NULL,
    "finalizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedById" INTEGER,
    "paidAt" TIMESTAMP(3),
    "paidById" INTEGER,
    "voidedAt" TIMESTAMP(3),
    "voidedById" INTEGER,
    "voidReason" TEXT,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payslip" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "employeeName" TEXT NOT NULL,
    "jobRoleName" TEXT NOT NULL,
    "branchName" TEXT,
    "workingDays" INTEGER NOT NULL,
    "absenceDays" INTEGER NOT NULL,
    "daysWorked" INTEGER NOT NULL,
    "basicPay" DECIMAL(12,2) NOT NULL,
    "totalAdditions" DECIMAL(12,2) NOT NULL,
    "totalDeductions" DECIMAL(12,2) NOT NULL,
    "netPay" DECIMAL(12,2) NOT NULL,
    "totalEmployerShare" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayslipLine" (
    "id" SERIAL NOT NULL,
    "payslipId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "type" "PayslipLineType" NOT NULL,
    "label" TEXT NOT NULL,
    "quantity" DECIMAL(12,2),
    "rate" DECIMAL(12,2),
    "amount" DECIMAL(12,2) NOT NULL,
    "sourceType" TEXT,
    "sourceId" INTEGER,

    CONSTRAINT "PayslipLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobRole_name_key" ON "JobRole"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

-- CreateIndex
CREATE INDEX "Employee_jobRoleId_idx" ON "Employee"("jobRoleId");

-- CreateIndex
CREATE INDEX "Employee_branchId_idx" ON "Employee"("branchId");

-- CreateIndex
CREATE INDEX "EmployeeRate_employeeId_effectiveOn_idx" ON "EmployeeRate"("employeeId", "effectiveOn");

-- CreateIndex
CREATE INDEX "RecurringDeduction_employeeId_idx" ON "RecurringDeduction"("employeeId");

-- CreateIndex
CREATE INDEX "Absence_date_idx" ON "Absence"("date");

-- CreateIndex
CREATE INDEX "Absence_employeeId_date_idx" ON "Absence"("employeeId", "date");

-- CreateIndex
CREATE INDEX "PayrollAdjustment_periodStart_idx" ON "PayrollAdjustment"("periodStart");

-- CreateIndex
CREATE INDEX "PayrollAdjustment_employeeId_idx" ON "PayrollAdjustment"("employeeId");

-- CreateIndex
CREATE INDEX "RecurringDeductionSkip_periodStart_idx" ON "RecurringDeductionSkip"("periodStart");

-- CreateIndex
CREATE INDEX "PayrollRun_periodStart_idx" ON "PayrollRun"("periodStart");

-- CreateIndex
CREATE INDEX "Payslip_employeeId_idx" ON "Payslip"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_runId_employeeId_key" ON "Payslip"("runId", "employeeId");

-- CreateIndex
CREATE INDEX "PayslipLine_payslipId_idx" ON "PayslipLine"("payslipId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_jobRoleId_fkey" FOREIGN KEY ("jobRoleId") REFERENCES "JobRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeRate" ADD CONSTRAINT "EmployeeRate_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringDeduction" ADD CONSTRAINT "RecurringDeduction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringDeductionSkip" ADD CONSTRAINT "RecurringDeductionSkip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringDeductionSkip" ADD CONSTRAINT "RecurringDeductionSkip_recurringDeductionId_fkey" FOREIGN KEY ("recurringDeductionId") REFERENCES "RecurringDeduction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayslipLine" ADD CONSTRAINT "PayslipLine_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "Payslip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Constraints Prisma cannot express. Soft-deleted rows stay on record without
-- blocking the corrected row that replaces them.

-- One live rate per employee per day.
CREATE UNIQUE INDEX "EmployeeRate_live_effective_key"
  ON "EmployeeRate" ("employeeId", "effectiveOn")
  WHERE "deletedAt" IS NULL;

-- One live absence per employee per day.
CREATE UNIQUE INDEX "Absence_live_day_key"
  ON "Absence" ("employeeId", "date")
  WHERE "deletedAt" IS NULL;

-- One live skip per recurring deduction per cutoff.
CREATE UNIQUE INDEX "RecurringDeductionSkip_live_key"
  ON "RecurringDeductionSkip" ("recurringDeductionId", "periodStart")
  WHERE "deletedAt" IS NULL;

-- At most one non-voided run per cutoff. Voided runs are kept as history.
CREATE UNIQUE INDEX "PayrollRun_active_period_key"
  ON "PayrollRun" ("periodStart")
  WHERE "status" <> 'VOIDED';

-- Rest days are weekday numbers.
ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_restDays_check"
  CHECK ("restDays" <@ ARRAY[0, 1, 2, 3, 4, 5, 6]);
