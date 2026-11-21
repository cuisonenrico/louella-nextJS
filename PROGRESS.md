# Modernization progress

Branch `chore/modernization`. Resume: read this file and `git log`, then continue at the first unchecked item.
Audit and decisions: `MODERNIZATION_AUDIT.md`.

- [x] Phase 1 — audit, baseline build + bundle analysis (`scripts/measure-first-load.mjs`)
- [ ] T1 Foundations — gitignore scratch output, commit audit + script
- [ ] T2 Boundaries/data — no code change (logged)
- [ ] T3 Loading — `(app)/loading.tsx` in-shell skeleton (delayed); `/branch-cash` skeleton; pending guards (CategoriesDialog, HolidaysCard)
- [ ] T4 Errors — `(app)/error.tsx` keeps the shell, retry
- [ ] T5 Performance — lazy-load recharts (dashboard, sales, rejections)
- [ ] T6 UX/a11y — aria-current, skip link, document titles, prefetch on hover/focus, reduced motion
- [ ] T7 Cleanup
- [ ] Verification — typecheck, lint, unit, build, e2e; after-metrics table
- [ ] `/ux-review/` screenshots (mobile + desktop, loading + error states)
- [ ] Lighthouse before/after (login + landing)
- [ ] Final deliverable in `MODERNIZATION_AUDIT.md`
