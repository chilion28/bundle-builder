# AGENTS.md — CityLocs theme working agreement

Instructions for AI coding agents (Codex, Claude Code, and any others) working in this
repo. **Read this before editing anything.** These rules exist because we have already
been burned by ignoring them (see "Incidents" below).

---

## 1. Golden rule: the LIVE theme is the source of truth — NOT git

The deployed **live OG-Empire theme (`#121696682072`, store `citylocs` / `5196401`)** is
the real state of the world. GemPages, the Shopify theme editor, installed apps, and other
agent sessions all edit it **out-of-band**. Git only mirrors + pushes our custom files; it
cannot "drive" the store. The local repo drifts from live constantly.

**Consequence:** the local copy of a theme file may be stale. Live files often carry
hand-written CSS/JS that exists **nowhere** in this repo, git history, or GemPages' inline
config. Pushing a stale local file to live **erases** that live-only work.

### Before editing ANY theme file
```bash
shopify theme pull --store citylocs --theme 121696682072 --only <path> --path <tmp>
```
Compare against the local copy. Do not trust that the local file is current.

### After editing
```bash
shopify theme push --store citylocs --theme 121696682072 --allow-live --only <path> --nodelete
```
Then **re-pull to verify** — the CDN serves stale asset bytes for minutes, so a re-pull is
the only remote truth. Push only the file(s) you touched. Never a bulk push.

### After any theme rollback / republish
They republish the theme after security incidents. Only files pushed **after** the
rollback survive, so re-push our whole custom file set when this happens.

---

## 2. Multi-agent coordination (Codex + Claude at the same time)

Both agents operate on this same repo and machine. To avoid clobbering each other:

- **Divide by area/file, not just "both on the branch."** Agree who owns what before
  starting. Suggested split lives in section 5.
- **`shopify theme pull --only <path>` before editing** protects you from BOTH the other
  agent's edits and live out-of-band edits. This is the single most important habit.
- **Do not edit the same file simultaneously.** If you must touch a shared file, say so.
- **One logical change per commit**, with a clear message, so the other agent can follow.

### Stale git lock gotcha
Crashed Codex/git processes leave `*.lock` files (e.g.
`.git/packed-refs.lock`, `.git/refs/codex/turn-diffs/captures/**/base.lock`) that block
commits and cause `git fsck` badRefContent errors. Fix:
```bash
find .git -name "*.lock" -type f -delete
```

---

## 3. Git & deploy constraints

- **This shell CANNOT push to GitHub** (`could not read Username for https://github.com`
  — no creds/TTY, https remote). **Diane pushes via GitHub Desktop.** Stage and commit
  locally; do not attempt `git push`.
- **Branches:** `pack-builder-cart-fixes` is the de-facto trunk (~121+ commits ahead of
  `main`). Confirm the target branch before committing; do not merge to `main` without
  asking.
- Deploys to the store go through the **Shopify CLI** (`shopify theme pull/push`), never
  through git.

---

## 4. GemPages files — extra caution

For any `sections/gp-section-*.liquid` or `templates/product.gem-*.json`:

- **Always `shopify theme pull --only <path>` first** — live carries hand-CSS the repo
  never sees (e.g. golf grass footer, golf-ball background).
- **Do NOT "Publish" from the GemPages editor to recover visuals.** GemPages sections
  often also hold custom JS/CSS for our builders (pack-builder cart fixes:
  `.cl-add-to-bundle`, `.cl-golf-checkout`, `.cl-golf-summary`). Publishing can revert
  that work. Restore surgically in the theme file instead.

---

## 5. Project map (areas of ownership)

Ownership is split **by area/feature** to avoid file conflicts. The owner leads changes in
their area; the other agent asks before editing there. Shared/handoff work is called out
explicitly. Adjust this table as priorities shift.

| Area | Owner | Where it lives |
|------|-------|----------------|
| Empire 13 migration | Codex | flex-PDP variant picker, gallery, product-form; `Empire 13 Migration Clean/` |
| Pack-builder ("Buy More Save More") | Claude | `snippets/cl-pack-grid*`, GemPages golf/pins sections |
| AI-hat / image-hat customizers | Claude | Cloudinary-backed; `templates/product.image-hat-upload.json`, related assets |
| Plate preview | Claude | `CL_PLATE_CFG` / `window.CLPlatePreview` |
| Fixed 3-hat bundle | Codex | cart-transform Shopify Function (`citylocs-functions` app) |
| Tiered discounts | Codex | tag-based CityLocs custom app |
| Crawler / bot mitigation | Codex | `templates/robots.txt.liquid` |

Detailed context for each lives in Claude's memory index; ask before deep work in an
unfamiliar area.

### Handoff → Codex: Empire 13 migration (start here)

Codex owns the Empire 13 migration. Starting state:

- **Latest work:** commit `a94e606` — "Empire 13 migration: flex-PDP variant picker,
  gallery, product-form updates". This is mid-flight, not finished.
- **Working folder:** `Empire 13 Migration Clean/` — the Empire 13 theme copy being
  migrated into. Read `Empire 13 Migration Clean/MIGRATION_AUDIT.md` first for scope and
  status; `.migration-tools/` holds the helper scripts.
- **Files touched in `a94e606`** (the live edge of the migration):
  - `Empire 13 Migration Clean/snippets/section.flex-pdp.variant-picker.liquid` (bulk of it)
  - `Empire 13 Migration Clean/snippets/section.flex-pdp.liquid`
  - `Empire 13 Migration Clean/snippets/section.flex-pdp.media-gallery.liquid`
  - `Empire 13 Migration Clean/snippets/product-form.liquid`
  - `Empire 13 Migration Clean/snippets/product.hot-reload.liquid`
  - `Empire 13 Migration Clean/assets/cl-pack-grid.js`
- **Reminders:** honor §1 (pull-before-edit / push-only-your-file) and §4 (GemPages
  caution) even inside this folder. Coordinate before touching pack-builder files
  (`cl-pack-grid*`) — those overlap with Claude's area.

### Handoff → Codex: OPEN TASK — golf-section 3-way merge (DEV theme only)

**Status: not started.** Do this on a DEV theme; do NOT push to live (`153643909208`).

Empire 13 was published to production on 2026-08-13. Republishing the golf-hats GemPages
page (`623565268597080822`) reverts our pack-builder summary code, because
`sections/gp-section-623576563790643742.liquid` holds BOTH the grass footer AND the
pack-builder cart JS/CSS. Live currently has our summary code restored wholesale (a
stopgap that re-reverts on every GemPages republish).

**Goal:** one merged `sections/gp-section-623576563790643742.liquid` keeping BOTH
(a) GemPages' newer native boilerplate/golf-ball markup, and (b) our reward-tracks /
locked-gift / per-swatch count-badge summary code.

- **OURS** (our code = git HEAD = backup):
  `.cl-backups/golf-sections-20260813-110407/sections/gp-section-623576563790643742.liquid`
- **THEIRS** (GemPages new boilerplate): pull fresh from live `153643909208` (read only).
- **BASE** (pre reward-tracks): `git show e7cc0ba^:sections/gp-section-623576563790643742.liquid`
- `git merge-file -p OURS BASE THEIRS` → **2 conflicts**:
  1. Mobile `@media` block: OURS is clean; THEIRS is a malformed CSS comment
     `/*…{visibility:hidden;}* 8-12-2026/` that never closes `*/` (breaks following CSS).
     → **take OURS.**
  2. JS card-data: OURS `stock: getCardStock(card)` vs THEIRS
     `available: isVariantAvailable(variantId)` — two inventory models. Reconcile into one
     internally-consistent model; **this is the part that needs real testing.**
- **Test on an unpublished dev theme** (`Dev 8-10-2026` = `153606324312`, or
  `citylocsdev.myshopify.com` per MIGRATION_AUDIT.md), `--nodelete`, never `--allow-live`.
  Smoke-test: add/remove hats, 4-pack reward unlock, free-gift lock→unlock, count badge,
  sold-out variants, Add Selected to Cart, grass/golf-ball footer (desktop + ≤812px).
- Hand the verified file back — **Claude owns the live push** for pack-builder.
- **Durable fix (the real point):** move the reward-tracks/locked-gift/badge code INTO
  GemPages as a Custom Code element on page `623565268597080822` so republishes preserve
  it. If infeasible, document that this section must be re-merged after any golf-page
  republish. See the [[empire13-golive-2026-08-13]] context in Claude's memory.

---

## 6. Guardrails

- Match surrounding code style; don't reformat files you're not changing.
- Test/verify changes against the live preview before declaring done.
- Don't add dependencies, tracking, or third-party scripts without asking.
- Surface anything that looks like out-of-band tampering rather than "fixing" it silently
  (we've had a checkout-hijack injection incident via app data).

---

## Incidents that shaped these rules

- **2026-08-12** — Pushed a stale local `gp-section-623576563790643742.liquid`, erasing
  live-only grass-footer + golf-ball CSS on desktop and mobile. Recovered by hand.
  Lesson: pull-before-edit on every GemPages file.
- **2026-08-10** — A theme republish wiped a `theme.liquid` include and a local working
  file mid-session. Lesson: re-push the custom file set after any rollback.
- **2026-07-22** — Checkout-hijack injection via Qikify app data. Lesson: treat unexpected
  injected content as hostile; report, don't absorb.
