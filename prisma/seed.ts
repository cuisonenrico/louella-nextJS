import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const features = [
  { key: 'quick-entry',       label: 'Quick Entry',          description: 'Daily inventory submission form (mobile)' },
  { key: 'inventory-history', label: 'Inventory History',    description: 'View past inventory submissions' },
  { key: 'dashboard',         label: 'Dashboard',            description: 'Revenue and KPI summary cards' },
  { key: 'branch-comparison', label: 'Branch Comparison',    description: 'Side-by-side branch performance view' },
  { key: 'waste-report',      label: 'Waste Rate Report',    description: 'Waste trend analytics' },
  { key: 'low-stock',         label: 'Low Stock List',       description: 'Materials below reorder level' },
  { key: 'notifications',     label: 'Notification History', description: 'Push notification log' },
  { key: 'approval-queue',    label: 'Approval Queue',       description: 'Approve/reject large adjustments' },
  { key: 'analytics',         label: 'Analytics',            description: 'Full analytics suite' },
  { key: 'user-management',   label: 'User Management',      description: 'Create and manage user accounts' },
];

async function main() {
  for (const f of features) {
    await prisma.feature.upsert({ where: { key: f.key }, update: {}, create: f });
  }
  console.log('Seeded features:', features.length);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
