-- Payroll holidays. See docs/superpowers/specs/2026-09-29-payroll-holidays-design.md.

-- CreateEnum
CREATE TYPE "HolidayType" AS ENUM ('REGULAR', 'SPECIAL');

-- AlterEnum
ALTER TYPE "PayslipLineType" ADD VALUE 'HOLIDAY';

-- AlterTable
ALTER TABLE "Payslip" ADD COLUMN     "holidayPay" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Holiday" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "type" "HolidayType" NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HolidayRestDayWork" (
    "id" SERIAL NOT NULL,
    "holidayId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "HolidayRestDayWork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "regularHolidayMultiplier" DECIMAL(4,2) NOT NULL DEFAULT 2.00,
    "specialHolidayMultiplier" DECIMAL(4,2) NOT NULL DEFAULT 1.30,
    "updatedById" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Holiday_date_idx" ON "Holiday"("date");

-- CreateIndex
CREATE INDEX "HolidayRestDayWork_holidayId_idx" ON "HolidayRestDayWork"("holidayId");

-- CreateIndex
CREATE INDEX "HolidayRestDayWork_employeeId_idx" ON "HolidayRestDayWork"("employeeId");

-- AddForeignKey
ALTER TABLE "HolidayRestDayWork" ADD CONSTRAINT "HolidayRestDayWork_holidayId_fkey" FOREIGN KEY ("holidayId") REFERENCES "Holiday"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HolidayRestDayWork" ADD CONSTRAINT "HolidayRestDayWork_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Not expressible in Prisma: one live holiday per date, one live mark per
-- holiday and employee, multiplier bounds, and the singleton row.
CREATE UNIQUE INDEX "Holiday_live_date_key"
  ON "Holiday"("date") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "HolidayRestDayWork_live_key"
  ON "HolidayRestDayWork"("holidayId", "employeeId") WHERE "deletedAt" IS NULL;
ALTER TABLE "PayrollSettings"
  ADD CONSTRAINT "PayrollSettings_multipliers_check"
  CHECK ("regularHolidayMultiplier" BETWEEN 1.00 AND 5.00
     AND "specialHolidayMultiplier" BETWEEN 1.00 AND 5.00),
  ADD CONSTRAINT "PayrollSettings_singleton_check" CHECK ("id" = 1);
INSERT INTO "PayrollSettings" ("id", "updatedAt") VALUES (1, now());
