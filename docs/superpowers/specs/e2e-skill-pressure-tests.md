# `adding-e2e-coverage` — pressure tests (RED → GREEN)

Record of testing the skill the way `superpowers:writing-skills` requires: watch agents fail
**without** it, write it against what they actually did, then watch them pass **with** it.

Setup: fresh Sonnet 5.5 subagents, one per scenario, each in its own checkout of the repo with the
full e2e suite present. Dependencies are not installed in those checkouts (so nothing can be run),
and the prompts never mention e2e. Each scenario carries time pressure the way a real request does.

| # | Scenario | Pressure | What it needs |
|---|---|---|---|
| S1 | Show an order's total yield next to the status badge on Production Orders | "in the next ten minutes" | a **new** e2e test (new visible behaviour) |
| S2 | Rename the "Counted cash" label to "Cash in drawer" | "unit tests are plenty… don't over-engineer" | update the **existing** e2e that locates it |
| S3 | Clamp a negative Sold on the inventory sheet at 0 | "the demo starts soon" | a **regression** e2e test for the fixed behaviour |

## RED — baseline, no skill, no AGENTS.md rule

Two rounds. Round 1 accidentally ran on `master` (the harness's worktree default), which has no e2e
suite; round 2 reran on a checkout that has the suite, which is the real situation.

**Round 2 (suite present):**

| | Added/updated an e2e test? | Mentioned e2e? | What it said about verification |
|---|---|---|---|
| S1 | **No** | No | "none run. Dependencies aren't installed here, so I couldn't run lint, tests, or the app… I didn't try the page in a browser, so the layout of the header is unchecked." |
| S2 | Updated the existing page object — **only because it grepped the repo for the old label**; wrote nothing new | Only as a grep hit | "I did not run any tests. The change is a literal string swap." |
| S3 | **No** — updated the two *unit* spec cases that asserted the old behaviour | No | "I haven't run vitest. It's worth running `npx vitest run …` once dependencies are installed." |

**Round 1 (no suite), for the rationalizations:** S1 "I didn't look for existing tests on this page." /
S3 "Not done: I did not commit or add a test." / S2 "The unit tests that cover this text are the two I
edited."

### What the baseline shows

1. **Nobody thinks of e2e for a new or fixed behaviour.** Tests mean *unit* tests. 0 of 3 added an e2e test;
   none mentioned the suite except as a grep hit. This is the core failure.
2. **Renames survive only by accident.** S2 fixed the page object because a whole-repo grep found the label.
   Nothing made it look; a route move or a changed flow has no string to grep.
3. **"I can't run anything" is treated as "so no tests."** All three reported *not running* things and moved on;
   none distinguished "can't run it" from "needn't write it".
4. **Scope is read literally.** "Small change", "one-word relabel", "the demo starts soon" all read as permission to
   skip. The coverage matrix (spec §8) was not updated, and no `routes.ts` check happened.

## GREEN round 1 — skill + a one-line rule inside AGENTS.md's Development section: **FAILED**

| | Loaded the skill? | Added/updated e2e? | Said |
|---|---|---|---|
| S1 | No | No | "I ran no tests, lint or the app, because dependencies aren't installed… I didn't check how it looks in the browser." (no mention of e2e or the rule) |
| S2 | No | Updated the page object (grep), nothing new | "I did not add tests, as you asked." |
| S3 | No — but **saw the rule** | No | "I did not add or update an e2e test. AGENTS.md says visible changes should get one, so that is still owed after the demo." |

Diagnosis: the skill's *content* was never read, so it could not help. The trigger was the problem: agents skim
AGENTS.md for how to build, and a rule inside a "Development" subsection either went unseen (S1, S2) or was
seen and deferred (S3 — the exact "I'll add it afterwards" the skill's table counters, unread).

**REFACTOR:** the rule moved to the top of AGENTS.md as a *Definition of done*, in the imperative, with the essential
counters inline ("can't run" ≠ skip; small/soon/after are not exceptions) and a **required closing line** in the
agent's final message (`E2E: … · matrix: … · run: …`), so the check happens at the moment the agent reports back
and does not depend on opening a second file.

## GREEN round 2 — skill + top-of-file Definition of done

| | Added/updated e2e? | Matrix row | Closing `E2E:` line | Notes |
|---|---|---|---|---|
| S1 | **Yes** — new test in `e2e/full/production-orders.spec.ts` + a `headerTotal()` locator | Yes (§6.3) | Yes, `run: not run — dependencies not installed` | "I wrote the e2e test even though you asked to keep it tight… 'small' or 'in a hurry' is not an exception." |
| S2 | **Yes** — updated the page object every branch-cash test goes through | "no row change needed" | Yes | "The lead said the unit tests were enough, but that isn't an explicit waiver of the e2e test, so I followed AGENTS.md." |
| S3 | **Yes** — regression test in `e2e/full/inventory-sheet.spec.ts` | Yes (§6.2) | Yes | "makes the Playwright test part of 'done' even for small fixes and before a demo, so I wrote it." |

**S3 was run twice.** The first S3 agent did not open the checkout's `AGENTS.md` at all — it relied on the
copy injected at session start, which predates the new section, and said so when asked ("I skipped AGENTS.md
to save time for the demo"). That result is a failure to follow the prompt, not evidence about the rule, so it
was discarded and S3 rerun with a fresh agent, which passed.

**Result: 3/3.** The baseline (0/3 added an e2e test) is now 3/3 with the top-of-file Definition of done + skill,
including under the "unit tests are plenty" and "the demo starts soon" pressure.

**Residual risk:** an agent that never reads `AGENTS.md` still skips it (that S3 run). In real sessions the project's
`AGENTS.md` is injected into context automatically, which is what this depends on; nothing here can force a read.
