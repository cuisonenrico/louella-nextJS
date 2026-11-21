-- Payroll companies: each branch trades under its own business name, so an
-- employee belongs to a company and a finalized run exports per company.
CREATE TABLE "Company" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
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
