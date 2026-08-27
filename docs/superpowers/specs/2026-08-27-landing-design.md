# A front door — the public landing page

## The problem this solves

`pagefly-design.pagefly.io/` redirects to `/design`, which is guarded, so the
first thing anyone who has not signed in sees is a login form. Nothing on the
way in says what the product does, shows a page it has built, or explains how to
use it. A merchant sent a link has to take it on trust and hand over a domain
before they learn anything.

## What it is

One public route, `/`, with five sections and one job: make someone want to
press **Design Now**, and let them see what they would get before they do.

```
1  Hero        Design Now, and one sentence saying what this makes
2  Showcase    two marquees of real pages, hover to read, click to preview
3  How it works 4 steps, each a real screenshot, hover for what to press
4  What it has done  counts, from the database, and only the true ones
5  Design Now  again, at the bottom
```

## Routing and the sign-in gate

`proxy.ts` already guards `/design` and `/design/library`, redirecting to
`/design/login?next=…` when the session cookie is missing. So the gate is
already built: **Design Now is a link to `/design`**, and a signed-out visitor
lands on login and is returned to the brief afterwards. Nothing new is needed
and nothing about auth changes.

`/` must NOT be added to the proxy matcher. The logo, everywhere it appears,
links to `/`.

## The showcase, and the one risk worth naming

The pages in the database belong to real stores. Publishing them on a page
anyone can open is publishing a merchant's work without asking, and a mechanism
that reaches for "the most recent runs" would do that by default and silently.

So the showcase is an **explicit opt-in list**:

```
SHOWCASE_RUNS=xuyzjaea95sx,itoai81mx3d1t,bqjcr599d6i8
```

`GET /api/showcase` returns pages only for runs named there, and returns only
what a card needs to draw itself — the page label, category, tokens and design
tree. Never the brief, the domain, the merchant's own words, or anything about
the account. Unset or empty means no showcase section renders at all, which is
the correct behaviour for a fresh deploy rather than a bug.

`buildPage` is a pure function of the brief and the variant and the tree is
stored in the run's snapshot, so the endpoint costs no model calls and returns
the same pages every time.

## The cards

`ResultCard` already does the work: a tall page auto-scrolls inside the card on
hover, and clicking opens the preview. It gains one prop.

```tsx
readOnly?: boolean
```

`readOnly` drops `<CardActions>` — the import-to-editor and export buttons,
both of which need an account — and keeps everything else. Inside the preview
overlay the same flag hides PNG and Regenerate for the same reason. Breakpoints,
Scrub and Brief all stay: a visitor should be able to look at the thing properly.

## The marquees

Two rows. The top scrolls right-to-left, the bottom left-to-right. Rounded
corners, and the row pauses while the pointer is on it so a card can be read.

`prefers-reduced-motion` stops both rows outright rather than slowing them. Two
rows moving in opposite directions is a genuine trigger, not a stylistic
preference, and a paused marquee is still a legible grid of pages.

The content is duplicated once in the DOM so the loop is seamless; the copy is
`aria-hidden` so a screen reader hears each page once.

## How it works

Four steps, because four is what the product has:

1. **Say what you sell** — the brief's first card, with the trade chips.
2. **Pick a look** — the fifteen visual styles.
3. **Choose your pages** — the page picker with its counters.
4. **Get mockups back** — the results grid.

Each is a real screenshot taken from the running app, not an illustration. A
drawing of a UI is wrong the first time that UI changes and nobody notices;
a screenshot is at least wrong visibly.

Hover shows a short tooltip naming what to press and what it does. Click opens
the shot full-size over a scrim, closed by the button, by clicking the backdrop,
or by Escape.

## The counts

Read from the database and shown only where true:

- stores with an account
- pages built, all time
- reviews, and their average — **omitted entirely when there are none**

A landing page claiming "4.9 from 200 reviews" before anyone has reviewed
anything is the one thing on it that cannot be undone once a visitor notices.
If a number does not exist, its tile does not render.

## Failure

The showcase endpoint failing, returning nothing, or naming runs that no longer
exist leaves the section out and the rest of the page intact. A marketing page
that 500s because a demo run was deleted is worse than one with a section
missing.

## Testing

`scripts/test-showcase.ts` — no network, no model:

- an unset `SHOWCASE_RUNS` yields no pages rather than every page
- a run id not on the list is not returned even when it exists
- the payload carries no `domain`, no `prompt`, no `whatYouSell`
- a named run that has been deleted is skipped, and the others still return
- counts read as zero on an empty database instead of throwing

## Out of scope

The brief, the build pipeline, the export, and the Library are untouched.
Nothing about authentication changes. No new model calls anywhere.
