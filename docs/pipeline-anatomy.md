# One page, every stage, measured

**What this answers.** What goes in, what Opus sends DeepSeek, what DeepSeek
returns, and what becomes a `.pagefly`. Measured by building the real prompts,
not described from memory — `__designPromptsForTest` calls the same assembly the
live path uses, so nothing here can drift from what production sends.

**The worked example** is a product page for `mxhxua-6i.myshopify.com`, whose
export is the one taken apart in `product-page-teardown.md`.

---

## 0 · What is NOT recoverable, and why

The run that built that page happened. Its prompts are gone. This is not an
oversight — `scripts/trace-build.ts` says so at the top:

> The database keeps the brief and the finished page and **nothing in between** —
> no prompt, no model reply, no intermediate plan.

So for any past build the database can answer two questions and no others:

| Question | Where |
|---|---|
| What did the merchant ask for? | `runs.payload` — the encoded brief |
| What did they get? | `runs.snapshot` — the finished pages |
| What did Opus plan? | **gone** |
| What was DeepSeek sent? | **gone** |
| What did DeepSeek reply? | **gone** |

To see the middle, the build has to be **run again with something listening**:

```
BRIEF=/tmp/brief.json OUT=/tmp/trace.json npx tsx scripts/trace-build.ts
```

That taps `fetch` itself, so what it records is the JSON body the vendor was
actually sent — no prompt is rebuilt anywhere in that file, so none can drift.

**And it must run where the data is.** `scripts/dump-runs.ts` carries the
warning: *"RUN THIS ON THE SERVER… on a laptop it answers about the laptop,
which is the mistake that made this script necessary."* The laptop's store ends
at 2026-08-30 and has never heard of `mxhxua-6i`.

---

## 1 · Two models, three stages

```
merchant's brief
      │
      ▼
  STAGE 1   deck plan          Opus 5      lib/design/deckPlan.ts
            which sections, which rhythm, for every page in the deck at once
      │
      ▼
  STAGE 2   section specs      Opus 5      lib/design/sectionSpec.ts
            what goes inside each band, as a spec the builder must satisfy
      │
      ▼
  STAGE 3   the page tree      DeepSeek    lib/ai/designServer.ts
            the actual nodes, copy, colours and CSS
      │
      ▼
  toPagefly.ts → builder.ts → .pagefly
            deterministic. No model. This is where the import bugs live.
```

Read off `lib/ai/provider.ts`: stages 1 and 2 call `getProvider("design")`,
which is pinned in code — `DESIGN_PROVIDER = "anthropic"`, `DESIGN_MODEL =
"claude-opus-5-5"`. Stage 3 calls `getProvider()` with no role, which is
`AI_PROVIDER=deepseek`.

The designing model has moved — Opus 5, then Sonnet 5 on cost, now Opus 5.5 on
trial. The note beside the constant carries the measured cost of each and what
would settle it; this file only promises to name the one in force. Check the
constant, or `/api/health`, before quoting a model in a bug report.

**So the designing model decides and DeepSeek builds.** The division matters
for every bug report: a section in the wrong place is the designing model,
wrong copy or a collapsed column is DeepSeek, and an element that will not
render is neither.

---

## 2 · What Opus sends DeepSeek, measured

Built for a real product page brief:

```
SYSTEM : 41,567 characters · ~6,684 words · ~11,546 tokens
USER   :  1,176 characters ·   ~187 words ·    ~327 tokens
TOTAL  : ~11,873 tokens per page
```

### The system prompt — 97% of what is sent

Assembled by `loadSkills("design")` from `skills/`, and it is not the whole
folder. Three files are **sliced**: only the blocks this page's resolver asked
for are included.

| File | On disk | In the prompt |
|---|---|---|
| `00-contract.md` | 27.5 KB | whole — the element vocabulary and the rules |
| `10-composition.md` | 6.3 KB | whole |
| `50-copy.md` | 4.2 KB | whole |
| `_sliced/20-patterns.md` | 23.0 KB | **only the patterns this page uses** |
| `_sliced/30-verticals.md` | 21.4 KB | **only this vertical** |
| `_sliced/40-motion.md` | 8.7 KB | **only the chosen effects** |
| `_sliced/60-markets.md` | 9.7 KB | **only this market** |
| | **104 KB total** | **33.4 KB loaded** |

Whole, the three sliced files are ~12,400 tokens on every call; sliced, about
1,400. `skills.ts` says why that is not only a bill:

> DeepSeek bills its own reasoning against the same ceiling as its answer, so a
> pattern the page will never use is still a pattern weighed.

**Concatenation order is load-bearing.** `designServer.ts:964`:

> DeepSeek caches by prefix, and the cached prefix ends at the first byte that
> differs. `00-contract` and `10-composition` are byte-identical on every page
> ever built, so they come first and stay cached for ever; the slices change
> with the page type and go after. A slice placed before them would throw the
> whole prefix away — it would look like it works, and the bill would be several
> times what it should be. Measured in v1: 4,864 of 4,892 input tokens were
> cache hits.

Section headings of the assembled system prompt, in order:

```
## Output            ## css              ## Responsive      ## Design discipline
## Structure         ## Copy             ## Chrome
# What you return    # Node vocabulary   ## The four you must not get wrong
# One node, or several?                  ## Controls that do nothing
## Backgrounds       ## What the exporter settles, so you do not have to
# css                # Responsive        # Copy             # The numbers
## Type roles        ## Spacing          ## Colour          ## Images
# Rhythm             # The ban list      # Before you emit
```

### The user prompt — the whole of it

This is everything about this particular merchant that reaches the model. 1,176
characters:

```
TODAY IS 2026-09-18. Any date you write — a countdown's "endsAt", a sale
ending, a shipping cut-off — must be after it.
Store sells: Linnen jurken, handgemaakt in Portugal
Store type: fashion
Merchant's own words: Een editorial product page voor De Rechte Jurk. Premium,
rustig, Nederlands.
Visual style: Editorial — Serif headlines, generous white space
Design this page: Product
Palette and faces — work inside these, do not introduce others.
Each colour has a job. Use it for that job.
  background  #FBFAF7
  text        #12100C
  accent      #7A1F22   buttons, prices, badges, the one highlighted thing …
  band        #EFEDE7   background of sections that step away from the page …
  border      #DCD7CC   card and section outlines, dividers. The merchant chose
                        this colour, so cards and bands DO carry a visible 1px
                        outline in it.
  heading font-family: Gelasio
  body font-family: Inter
  corner radius 2px
Section count: 8-11, never more than 12. 8 is a floor on REAL content, not a
quota — if the brief cannot fill it, go under and add nothing. A 7-section page
of real content beats an 8-section page carrying filler.
Return the JSON object now.
```

**Note what is absent.** No store domain — `DesignInput.storeDomain` is
documented "Never sent to the model", it only seeds the pattern roll. No
products, no images: the model writes search phrases and `lib/images/stock.ts`
resolves them afterwards.

---

## 3 · What DeepSeek returns

One JSON object in the design-tree vocabulary — 24 node types, defined in
`lib/design/schema.ts`. Not HTML, not PageFly elements: our own alphabet, chosen
so that "a valid tree cannot fail to export".

The schema **never rejects**. Its own header:

> COERCE, CLAMP, TRUNCATE, DROP — in that order — and never reject… A malformed
> value costs itself; a malformed node costs itself; only a document with no
> sections left is a failure.

That is a deliberate trade made after three pages were thrown away over one leaf
each (`image.query` two words too long; `perView` 2.5 where an integer was
wanted; `fields[].kind` "textarea", not in the enum — 34,961 and 30,268 tokens
lost). It also means a structurally odd page now flows through instead of
failing loudly, which is worth remembering when a build looks wrong rather than
broken.

For the worked example the tree became eleven sections. What each turned into:

| # | Section | Elements | Composites |
|---|---|---|---|
| 1 | hero / buy box | 110 | Slideshow ×1, **ProductBox ×1**, CountDown, Accordion3 |
| 2 | trust row | 19 | — |
| 3 | fabric story | 36 | ImageComparison |
| 4 | fit + size table | 92 | **Tabs3**, ContentList2 |
| 5 | styling | 27 | — |
| 6 | reviews | 37 | — |
| 7 | brand line | 12 | — |
| 8 | related products | 16 | ProductList2 + ProductBox |
| 9 | FAQ | 39 | Accordion3 ×6 rows |
| 10 | signup | 15 | **Form2**, ProductATC2 |
| 11 | sticky bar | 7 | ProductATC2 |

---

## 4 · What happens after the model, and where the bugs were

`toPagefly.ts` and `builder.ts` are deterministic. No model runs here. Every
fault in `product-page-teardown.md` was in this stage, which is why no prompt
change fixed any of them:

| Fault | Stage | Fixed by |
|---|---|---|
| Tabs "Something went wrong" | builder | `Tabs3` was missing three of its five slots |
| Form inspector crash | builder | `label` shape, `FormLabel` data, `context`, `id` |
| Text one letter per line | builder | floor missing on composite-built elements |
| Motion never ran | builder | every class went to `className`, a key PageFly ignores |
| Two galleries in the buy box | **DeepSeek** | contract + `audit.ts` rule |
| Filter rail on a collection page | **DeepSeek** | contract ban |

Only the last two are prompt problems. The first four are code, and `scripts/
test-conformance.ts` now guards them against the editor's own export.

---

## 5 · Getting the real numbers for one run

On the server, with `DATABASE_URL` set:

```bash
# what the database does keep for that store
DOMAIN=mxhxua-6i.myshopify.com npx tsx scripts/dump-runs.ts

# and the middle, by running it again with the tap on
BRIEF=/tmp/brief.json OUT=/tmp/trace.json npx tsx scripts/trace-build.ts
```

The first prints every run and page with its section count, whether the design
tree survived, and which element types it holds. The second costs one real page
build and records every byte both models were sent and returned.
