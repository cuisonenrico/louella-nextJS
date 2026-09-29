---
name: adding-e2e-coverage
description: Use when a task in louella-nextJS adds or changes anything a user can see or do — a page, form, label, button, figure, permission, lock or business rule — including small changes and bug fixes, before you say the task is done
---

# Adding e2e coverage

Every user-facing change ships with its Playwright test **in the same change**. Unit tests do not
count: they cannot see the UI, the API wiring and permissions together. "I can't run it here" is
not "I needn't write it".

## Steps

1. **Find what already covers it.** Open the coverage matrix (`docs/superpowers/specs/2026-09-29-e2e-playwright-design.md`
   §8) at your route. Then search for what your change touches — the old label, route or text:
   `grep -rn "<text>" e2e/`. Locators live in `e2e/pages/`; a changed label, button or flow breaks one.
2. **Fix what your change breaks:** locators, expected numbers, routes.
3. **Add the test for what is new or fixed.** New behaviour → `e2e/full/<feature>.spec.ts`. Bug fix → a
   regression test that would have failed before your fix. Put it in `e2e/smoke/` only if it guards login,
   money or stock and runs in under 20 s.
4. **Write it the suite's way** — read `e2e/README.md` (rules and gotchas). Use `test` and `buildWorld` from
   `e2e/fixtures/`, act through the UI, cross-check through the `api` fixture, compute expected numbers from
   the rule, take dates from `fixtures/dates.ts`.
5. **New route →** add it to `e2e/routes.ts`. **Update the matrix row.**
6. **Run it:** `npm run e2e:db`, then `npm run e2e -- <spec>` (`npm run e2e:stress -- <spec>` if it is `@stress`).
   If you really cannot run it, still write it and say so.

End your summary with one line:
`E2E: <spec files added or changed> · matrix: <route/row> · run: <result, or "not run — <reason>">`

## Red flags — write the test

| Thought | Reality |
|---|---|
| "I can't run anything here" | Write it anyway and report `not run`. Running and writing are separate. |
| "Unit tests are enough" / "the request said keep it small" | Unit tests miss the UI. Only an explicit "skip the e2e test for this task" waives it; "small" and "quick" do not. |
| "It's a one-word relabel" | A relabel breaks the page object that finds the field by its label. Grep `e2e/`. |
| "The demo starts soon" | The change is riskiest right before a demo. A minimal test takes minutes. |
| "I'll add it afterwards" | Afterwards is never; it ships in this change. |

**No e2e change needed** for: refactors with no visible change, docs, CI config, and server-only changes no
user can observe. Say so in the summary line: `E2E: none — <why>`.
