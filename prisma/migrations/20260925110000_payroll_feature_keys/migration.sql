-- Register the Employees and Payroll screens from src/lib/rbac/features.ts.
--
-- RoleFeaturePermission / UserFeaturePermission reference Feature.key, so the
-- keys must exist before the permissions matrix can store an override.
--
-- Grants nothing: ADMIN holds both through ROLE_DEFAULTS in code, and every
-- payroll controller additionally requires @Roles(ADMIN).
INSERT INTO "Feature" (key, label, description, "createdAt") VALUES
  ('employees', 'Employees', 'Employee register, rates, deductions, absences and logins', NOW()),
  ('payroll', 'Payroll', 'Semi-monthly payroll runs and payslips', NOW())
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description;
