-- Payroll companies: each branch trades under its own business name, so an
-- employee belongs to a company and a finalized run exports per company.
CREATE TABLE "Company" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "paymasterName" TEXT,
    "approverName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");

ALTER TABLE "Employee" ADD COLUMN "companyId" INTEGER;
CREATE INDEX "Employee_companyId_idx" ON "Employee"("companyId");
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Snapshot taken at finalize; runs finalized before this have none.
ALTER TABLE "Payslip" ADD COLUMN "companyName" TEXT;
ALTER TABLE "Payslip" ADD COLUMN "companyId" INTEGER;
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Night shift differential, the NSD PAY column of the client's payroll sheet.
ALTER TYPE "PayrollAdjustmentCategory" ADD VALUE 'NIGHT_DIFF';
