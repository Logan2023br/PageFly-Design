# Claude Review — runbook for the scheduled run

The admin presses **Claude Review** on `/design/admin/collections`; that only sets the run's state
to `requested`. A scheduled Claude task (hourly) follows this runbook. Everything the admin sees
comes from `runner.py` calls — call `step` before every stage so the panel is never stale.

The sets were imported by Tu into the PageFly store **loganpagefly** before the run (the
`.pagefly` files from admin). PageFly MCP reads them: `list_pages`, `screenshot_page`.

## 0. Setup (every run)

The scheduled routine follows `ROUTINE.md` (one subagent per set); this file is the per-set procedure.
Work in `scripts/claude-review`. The key is in the environment variable `COLLECTIONS_API_KEY`.
Run every script through `./cr` — it finds a Python with the packages and the Playwright that matches the
preinstalled Chromium (never run `playwright install`). Below, `python3 x.py` means `./cr x.py`.

```bash
./cr runner.py begin      # GO <n> sets  |  NOOP <why>  -> on NOOP stop here, nothing to do
```

## 1. Per set — loop until `runner.py next` prints NONE

Before each set: `./cr runner.py stop?` — on STOP, end the run.

```bash
S=$(./cr runner.py next)
./cr runner.py run $S "pipeline + offline verify" -- python3 review.py prep $S --redo
./cr looks.py $S                      # sections that need a look, each with a side-by-side PNG
```

**a. Offline look.** Read every PNG `looks.py` lists (left = HTML mockup, right = emulated .pagefly).
Store-data sections (products, articles, forms) and 0px layers are already filtered out. For a real
difference: fix the page JSON in `$CR_WORK/$S/full/out/work/` surgically (the element's `styles[]` or
customCSS — follow the review-collection-pages skill rules and its `pagefly-runtime-facts.md`), then
`./cr review.py verify $S "<page name>"` and look again. A recurring cause belongs in
`extra_fixes.py`, not in one set.

**b. Real render.** `./cr runner.py step $S "real render check (PageFly MCP)"`.
Find the imported pages — never by guessing from the number in the title (it is only the order in the
imported file, e.g. `204 - Deepa Diwali - Home - 2026-10-19 17:33:10`):
1. `./cr imports.py $S` prints, per page, the title keys to look for.
2. For each page call `PageFly:list_pages` with `query` = that page's key, limit 20, and save every
   result of the set into one JSON array file (`[{"id","title"},…]`).
3. `./cr imports.py $S --pick <that file>` prints `{page slug: [pageId, title]}` — the newest import
   whose title matches the key exactly. A page with `null` was not imported: log it with
   `runner.py error` and treat the set as `reimport`.
For each page `PageFly:screenshot_page(pageId)` (desktop 1440 + mobile 375) and compare with the
HTML mockup (`$CR_WORK/$S/html/<page>.html` — render it at 1440 and 390 with playwright and Read the PNG),
section by section: layout, fonts, spacing, image frames, icons, countdown, product media.
Product cards show the store's sample products — judge their style only.
- The imported page is the version BEFORE this run's fixes. A difference the offline fixes already
  cover (font, countdown, gallery…) is fixed; say so in the note.
- A difference only the real render shows: fix it in the JSON, verify offline, and mark the set
  `reimport` (it must be imported again to confirm).
- No import found for the set: note "not imported in loganpagefly", result `reimport`.
- Hourly screenshot limit hit: `sleep 600` and retry; keep calling `runner.py step` so the
  heartbeat stays fresh.

**c. Ship.**
```bash
./cr runner.py run $S "upload .pagefly" -- python3 review.py ship $S               # result done  -> "Claude Done · <time>"
./cr runner.py run $S "upload .pagefly" -- python3 review.py ship $S --reviewing   # result reimport -> stays "Claude Reviewing"
```
`ship` re-zips each page from its JSON, checks it is that page's own entry, checks the validator
did not get worse, uploads to that page only, downloads it back and compares bytes.

**d. Deliver to Tu's Mac.**
```bash
SEQ=$(./cr runner.py seq); ./cr runner.py run $S "build delivery folder" -- ./cr export.py $S $SEQ   # prints {group, folder, files}
```
Write each file with `device_commit_files` (stagedPath = the printed path, under
`/mnt/user-data/outputs/claude-review/`) to
`/Users/bbuser/Documents/<group>/<folder>/<file name>` — 20 sets per group folder
(`21-40 collection pages`, `41-60 collection pages`, …). No zip: Tu zips after checking.

**e. Record.**
```bash
./cr runner.py finish $S done|reimport --folder "<group>/<folder>" --note "<one line: what was fixed / what to check>"
```
On an error you cannot fix for this set: `runner.py finish $S failed --note "<why>"` and go on.

## Errors — always write them down

Tu reads errors on the admin panel (red box), not in this session. So:
- Every script step goes through `runner.py run <slug> "<step>" -- <command>`: a failing command is
  logged automatically with the last lines of its output.
- Anything else that goes wrong is logged by hand, in one line that says what failed and what you did:
  `./cr runner.py error <slug> "<step>" "<what happened>"` — e.g. `list_pages` finds no import of the
  set, `screenshot_page` fails or hits the hourly limit, `device_commit_files` rejects a file, a real-render
  difference you could not fix, an unexpected API answer. Use `-` as the slug for run-level problems.
- A set you give up on: `runner.py finish <slug> failed --note "<why>"` (also logged as an error), then go on.
- If the run itself must stop (key missing, API down), log it with slug `-` before ending, when the API
  is reachable.

## 2. Rules that do not bend

- The HTML mockup is the truth. Reproduce it; do not improve it (name a flaw in the note).
- Never claim "identical" for anything only checked offline.
- Upload only to the set and page you downloaded; `ship` enforces it — never bypass it.
- One set at a time; the panel must always say which set and which step.
