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

## GREEN — with the skill and the AGENTS.md rule

_(filled in after the skill is written)_
