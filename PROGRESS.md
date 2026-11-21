# Modernization progress

Branch `chore/modernization`. Resume: read this file and `git log`, then continue at the first unchecked item.
Audit and decisions: `MODERNIZATION_AUDIT.md`.

- [x] Phase 1 — audit, baseline build + bundle analysis (`scripts/measure-first-load.mjs`)
- [x] T1 Foundations — gitignore scratch output, commit audit + script
- [x] T2 Boundaries/data — no code change (logged)
- [x] T3 Loading — `(app)/loading.tsx` in-shell skeleton (delayed); `/branch-cash` skeleton; pending guards (CategoriesDialog, HolidaysCard)
- [x] T4 Errors — `(app)/error.tsx` keeps the shell, retry
- [x] T5 Performance — lazy-load recharts (dashboard, sales, rejections)
- [x] T6 UX/a11y — aria-current, skip link, document titles, prefetch on hover/focus, reduced motion
- [x] T7 Cleanup
- [x] Verification — typecheck, lint, unit, build, e2e; after-metrics table
- [x] `/ux-review/` screenshots (mobile + desktop, loading + error states)
- [x] Lighthouse before/after (login + landing)
- [x] Final deliverable in `MODERNIZATION_AUDIT.md`
- [x] Payroll UI revamp + dashboard (requested mid-run)
- [x] Deadlock fix (autofill lock order)
