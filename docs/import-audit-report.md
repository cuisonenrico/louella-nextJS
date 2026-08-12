> **⚠️ PARTIAL SMOKE-TEST RUN — NOT THE FULL ARCHIVE ⚠️**
>
> The full archive directory referenced by the task brief
> (`D:/Downloads/louella-history`) does not exist on this machine. Only two
> real workbooks were available on disk (`D:/Downloads/Apr14-28-2026.xlsx`
> and `D:/Downloads/Apr29-May13-2026.xlsx`). This report covers **only those
> 2 of N workbooks**, copied into a smoke-test directory
> (`C:/Users/Enrico/AppData/Local/Temp/claude/audit-smoke/`) and run through
> `scripts/audit-import-workbooks.mjs` as a parser smoke test.
>
> **This report MUST be regenerated against the full archive before taking
> it to the client.** No data below has been fabricated or extrapolated —
> everything is a direct parse of the two files listed. Do not treat the
> "Names that ever collide" or "Price drift" sections as complete until the
> full run has been done.

# Import audit report

Files scanned: 2

## Per-file summary

| File | First date | SKUs | Colliding names |
|---|---|---|---|
| Apr14-28-2026.xlsx | 2026-04-13 | 181 | pandesal pack (40/1000); bonette (30/8); litro (10/45); kasalo (10/35); cobra (5/20); vitamilk (5/25) |
| Apr29-May13-2026.xlsx | 2026-04-28 | 181 | pandesal pack (40/1000); bonette (30/8); litro (10/45); kasalo (10/35); cobra (5/20); vitamilk (5/25) |

## Names that ever collide (need an alias decision)

- **bonette** — variants over time: 2026-04-13:[8,30] 2026-04-28:[8,30]
- **cobra** — variants over time: 2026-04-13:[5,20] 2026-04-28:[5,20]
- **kasalo** — variants over time: 2026-04-13:[10,35] 2026-04-28:[10,35]
- **litro** — variants over time: 2026-04-13:[10,45] 2026-04-28:[10,45]
- **pandesal pack** — variants over time: 2026-04-13:[40,1000] 2026-04-28:[40,1000]
- **vitamilk** — variants over time: 2026-04-13:[5,25] 2026-04-28:[5,25]

## Price drift (single-variant names whose price changed)

- **choco buns**: 2026-04-13=17 → 2026-04-28=15
- **ham pork floss**: 2026-04-13=25 → 2026-04-28=42
- **lambingan**: 2026-04-13=10 → 2026-04-28=15
- **merengue**: 2026-04-13=12 → 2026-04-28=8
- **mushroom**: 2026-04-13=15 → 2026-04-28=35
- **otap**: 2026-04-13=12 → 2026-04-28=35
