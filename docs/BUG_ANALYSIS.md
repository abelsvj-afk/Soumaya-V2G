# Brain-Soumaya Bug Analysis

## 1. 🐢 Slow on Galaxy A37 5G

**Root cause:** `graphicsConfig.ts` `detectTier()` — the A37 5G likely has 4GB RAM and 8 cores, which scores borderline `balanced`. But the real problem is the **Timeline 3D scene** (`TimelineView.tsx`) has no graphics-config awareness at all — it always renders at `Math.min(2, devicePixelRatio)` regardless of device tier. Plus it spawns `N * 2` animated packet sprites + per-frame `bubbleCycles` forEach — no throttle. The main galaxy in `Graph3D` uses `graphicsConfig` properly; the Timeline doesn't.

**Secondary issue:** `graphicsConfig.ts` line 77 — score only subtracts 1 for small screen (`<= 480px`). The A37 5G has a ~720×1612px screen (minSide=720), so it gets **no penalty** and may land at `balanced` instead of `performance`. Also `mem <= 3` gives -2 but the A37 has 4GB so it gets 0 (neutral), not penalized.

**Fix plan:**
- In `TimelineView.tsx`: read `resolveGraphics()` and scale down `pixelRatio`, packets count, and skip `antialias` on low tier.
- In `graphicsConfig.ts`: lower the `balanced` threshold slightly — score ≤ 1 → performance, score ≥ 3 → quality.

---

## 2. 📦 Open Card (Details tab) — cards not scrollable, words pushed out of view

**Root cause:** On mobile, `.dock` is capped at `max-height: 62vh` (line 935 in `index.css`). The `dock-content` has `overflow-y: auto` (line 323) which *should* scroll — but `NodeInspector` renders several heavy sections in sequence (chip, celestial metadata, h2, content markdown, research questions box, node-meta, JourneyChips, Chronicle, MemoryAttachments, weight slider, buttons, Connected list) all in a single `div.dock-body` **with no individual card scroll containers**. The inner "small cards" like the research questions box, JourneyChips, Chronicle, and MemoryAttachments each have fixed heights or content that overflows *within* themselves but their parent (dock-body/dock-content) scroll is working — the issue is that **all these cards try to fit within 62vh** and the browser shrinks them to fit instead of letting them flow vertically. The `dock-content` scrolls as a whole block — so the sub-sections are not the ones scrolling, it's all one overflow. The real bug: **`dock-body` itself has no `min-height: 0`**, causing some flex children to refuse to shrink.

**Also:** The Chronicle component and MemoryAttachments are rendered inline inside `dock-content` with no size constraints, so on a 62vh-tall panel they blow the layout.

**Fix plan:**
- Ensure `dock-content` properly scrolls (check `min-height: 0` on flex ancestors).  
- Add `overflow-y: auto` to `.dock-body` and give it `min-height: 0; flex: 1`.
- On mobile, collapse some sections (Chronicle, research questions) into `<details>` accordions so the card starts short and the user expands what they need.

---

## 3. 🗓️ Memory tab (Browse → All) — no order, no times/dates visible by default

**Root cause:** `NodeList.tsx` — the default sort is `"mass"` (heaviest node first, line 80). Chronological timeline view is a *toggle* (`🕰 timeline` button, line 255-261) that's off by default. When toggled on it groups by rough buckets (today/yesterday/this week/this month/Month Year) but individual rows only show a relative time like `"3d ago"` — **no actual date** shown. When off, the sort=`"recent"` option shows relative times but users have to manually pick it.

**Fix plan:**
- Change default sort from `"mass"` to `"recent"` — memories most recently added/happened first.
- Show the actual date (not just relative) in each row when sort=recent or timeline=on — add an `<abbr title="full date">relative</abbr>` tooltip at minimum.
- Make `timeline` ON by default so you see date groups immediately.
- In grouped timeline view, show the exact `toLocaleDateString()` per item in the row meta.

---

## 4. 💀 Doesn't feel alive — not relevant to time & location

**Observations:**
- The app has no time-of-day awareness in the UI (no "good morning / good evening" greeting based on current time).
- `NodeList` sorts by mass by default — not what's recent or relevant NOW.
- `MindPanel` polls thoughts every 20s but nothing surfaces "what's relevant right now" contextually.
- No geolocation hook exists anywhere in the codebase.
- The Chronicle (3D river) is interesting but only opens as a full overlay — nothing on the main screen shows time-sensitive context.

**Fix plan:**
- Add a time-of-day greeting/ambient message in the dock or a persistent header strip.
- Change `NodeList` default sort to `"recent"`.
- Surface "memories from today" or "upcoming reminders" as a sticky strip at the top of the Browse tab.
- (Stretch) Add a `useLocation` hook + store a rough location label (city only) for new memories.

---

## 5. 🏷️ Tags — no "alive view feel"

**Root cause:** `NodeInspector.tsx` renders tags as static `.tag-chip.readonly` spans (line 256-262) — they're display-only, no click action, no glow, no count, no pulse animation. The `NodeList` tag row is clickable but styled the same as regular chips — no visual differentiation. Tags have no dedicated panel or summary view.

**Fix plan:**
- In `NodeInspector`: make tag chips **clickable** (navigate to Browse tab filtered to that tag).
- Add a pulse/glow animation to tags that are "hot" (appear on many recent memories).
- In `MindPanel` or `NodeList`: add a Tags overview section showing all tags with counts as a cloud-style grid, with size proportional to frequency.
- Give `.tag-chip` a subtle `box-shadow` glow animation on hover.

---

## Priority Order

| # | Bug | Effort | Impact |
|---|-----|--------|--------|
| 1 | Memory tab: default to recent + show dates | Low | High |
| 2 | Open card scroll fix on mobile | Low-Med | High |
| 3 | Tags: make interactive + alive | Med | High |
| 4 | Timeline perf (A37 5G) | Med | Med |
| 5 | Time/location alive feel | High | Med |
| 6 | DigestPanel: 9 waterfall API calls on mount | Low | Med |
| 7 | ChatDock: only last 8 messages sent to AI | Low | Med |
| 8 | Agenda: reminders show no real time/date | Low | High |
| 9 | Chat textarea: single row, doesn't grow on mobile | Low | High |

---

## 6. 🌊 DigestPanel (Insights tab) — 9 waterfall API calls on mount

**Root cause:** `DigestPanel.tsx` `useEffect` (lines 83–113) fires 9 separate `fetch` calls sequentially via individual `.then()` chains — `getDigest`, `getDailyDigest`, `getConstellations`, `getEmotionalTrajectory`, `getDormant`, `getEvolutionLinks`, `getLifeAreas`, `getSelfReview`, `getDailyLog`, `getBeliefs`. On a slow mobile connection or cold backend these all queue up independently. None are parallelized with `Promise.all`. On an A37 5G on a weak connection this means the Insights tab feels broken for several seconds with nothing visible.

**Fix plan:**
- Wrap all initial fetches in a single `Promise.all([...])` so they run concurrently.
- Add a loading skeleton/shimmer state instead of blank content during load.

---

## 7. 💬 ChatDock — history window too small (last 8 messages only)

**Root cause:** `ChatDock.tsx` line 124: `const trimmed = history.slice(-8)` — only the last 8 message turns are sent to the AI. With the ask-back bubble merging (lines 120-122), this can be as few as 4 real exchanges. On a long conversation she loses context of what was said early on, making her feel forgetful and non-continuous.

**Secondary:** Line 93 stores only `messages.slice(-60)` in localStorage — fine for storage, but the `-8` trim on send is too aggressive.

**Fix plan:**
- Increase the history window from `-8` to `-16` or `-20` (still bounded for token budget).
- Alternatively send a summarized context block of older turns instead of hard-cutting them.

---

## 8. ⏰ Agenda (Actions tab) — reminders show no real time or date

**Root cause:** `ActionsPanel.tsx` lines 133-141 — upcoming reminders render only the countdown string (e.g. `"in 3d"`) with no actual date shown. If a reminder is `"in 3d"` a user has no idea if that means Saturday or Tuesday. The `at` timestamp is available but never formatted into a readable date. Same for due action items — `countdown()` only returns relative strings.

**Fix plan:**
- Add `new Date(at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })` displayed beneath the countdown pill.
- Show `"Sat, Aug 10 · in 3d"` format so the user knows exactly when.

---

## 9. 📱 ChatDock — textarea is `rows={1}`, doesn't auto-grow on mobile

**Root cause:** `ChatDock.tsx` line 446: `<textarea rows={1} .../>`. On mobile (Galaxy A37), typing a long message shows just one line with hidden overflow — you can't see what you wrote. There's no `auto-resize` logic (no `onInput` height calculation). The CSS (`chatdock-input textarea`) likely sets a fixed height. This makes composing longer messages frustrating — you're typing blind.

**Fix plan:**
- Add an `onInput` handler that sets `e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'`.
- Cap at `max-height: 120px` with `overflow-y: auto` so it doesn't expand infinitely.
- Reset height to `auto` after send.
