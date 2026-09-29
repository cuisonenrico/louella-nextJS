-- Government ids on the employee. Stored as entered; nothing reads them yet.
ALTER TABLE "Employee"
  ADD COLUMN "sssNumber" TEXT,
  ADD COLUMN "philhealthNumber" TEXT,
  ADD COLUMN "pagibigNumber" TEXT;
