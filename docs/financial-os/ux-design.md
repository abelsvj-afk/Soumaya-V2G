# Financial OS — UX Design (Phase 4.5)

> **Mobile-first** UX spec. Required by the workflow before any screen is built. Depends on
> [requirements.md](./requirements.md), [user-stories.md](./user-stories.md), [decisions.md](./decisions.md).
> The primary user is on a **Galaxy A-class phone** — every control must be reachable and legible on a
> small portrait screen with one thumb. This spec defines screens, states, and components; visual polish
> is validated against a real render before a UI task is "done."

## 0. Principles
- **Mobile-first, one-thumb.** Primary actions sit in the thumb zone (bottom half). No control may overflow
  off-screen (the FAB-overflow lesson from the galaxy UI). Content scrolls; the header + primary action stay
  pinned.
- **Zero-typing by default.** The biggest, most obvious action is **"Add" → camera/screenshot**. Manual
  numeric entry is present but secondary.
- **One number, always honest.** "Safe to Spend" is the hero. A shortfall is shown with **icon + label +
  number**, never color alone (accessibility).
- **Confirm, don't trust.** Every AI extraction is a *draft* the user confirms; nothing commits silently.
- **Calm coaching.** Nudges are gentle toasts in Soumaya's voice, dismissible, never blocking.
- **Reduced-motion + contrast honored** (inherited house rules).

## 1. Entry point
A **Financial tab** in the existing dock/tab system (behind the per-space enable flag, D7). Icon: 💵/📊
paired with the label "Money" (never icon-only). First open with the flag off shows a one-screen intro +
"Enable" CTA.

## 2. Screen: Home — "Safe to Spend" (the hero)
Mobile portrait, top-to-bottom:

```
┌───────────────────────────────┐
│  Money                    ⚙️  │  header (pinned): title + settings
├───────────────────────────────┤
│      Safe to Spend            │
│        $10                    │  hero number, large, high-contrast
│   ⚠ short by $18 on Friday    │  shortfall row: icon+label+number if any
├───────────────────────────────┤
│  You've earned this week      │
│        $743                   │
├───────────────────────────────┤
│  Reserved            $930  ▸   │  tap to expand the itemized list
│   Rent            $600         │
│   Insurance       $250         │
│   Car             $210         │
│   Phone            $70         │
├───────────────────────────────┤
│  Bills due this week          │
│   • Insurance  Fri            │
│   • Car        Sun            │
└───────────────────────────────┘
        (＋ Add)   ← big primary FAB, thumb zone
```

- **Hero** = Safe to Spend. If `shortfall > 0`, the hero stays truthful (Safe to Spend $0) and a distinct
  **shortfall row** states "short by $X on \<day\>" with a warning icon + text.
- **Reserved** is collapsible; expanded shows the itemized lines (the same data the AI cites).
- **States:** empty (no data yet → friendly "Add your balance and first bill to begin"), loading, error
  (never a raw stack — a diagnosable message), offline (works; shows an "offline — manual only" chip).

## 3. Flow: Add (the make-or-break ingestion)
The **＋ Add** FAB opens a bottom sheet with two big choices, camera first:

```
Add money or expense
┌───────────────┐ ┌───────────────┐
│  📷 Snap /     │ │  ✍️ Enter      │
│  Upload        │ │  manually      │
└───────────────┘ └───────────────┘
   Paste text (Cash App / Venmo / bank)  ▸
```

### 3a. Snap / Upload → Confirm
1. User picks camera / photo / PDF.
2. Progress state while `OcrProvider.extract` runs ("Reading your screenshot…"); cancellable.
3. **Confirmation card** shows the extracted draft with each field editable:
   - Income draft: Date · Amount (net) · Platform/Employer · Hours · (Taxes) — low-confidence fields
     highlighted with a "check this" hint.
   - Expense draft(s): a list; each row = Date · Merchant · Amount · **Category chip** (tap to change).
   - A thumbnail of the **source** is shown; "View original" opens it.
   - **Duplicate warning** banner if a likely dup is detected ("Looks like you already logged this").
4. **Confirm** commits; the home number updates with a brief, satisfying transition (reduced-motion safe).
5. **No key / offline:** step 2 is skipped; the flow drops straight to the manual form pre-filled from the
   paste parser where possible.

### 3b. Manual entry
A short form: toggle Income/Expense · Amount · Date (defaults today) · Category (expense) or
Platform (income) · optional note. Commits offline, no network.

### 3c. Paste
A textarea; on paste, the heuristic parser lists candidate rows → same Confirm card as 3a. Works with no
key.

## 4. Screen: Bills
A list of recurring bills; each row = name · amount · next due · autopay badge · paid/unpaid state.
- **＋ Add bill** → form: name, amount, due date/day, frequency, autopay, category; optional grace/late-fee/
  payee/last-4.
- Tap a bill → detail: next occurrences, mark paid, edit, deactivate.
- **Mark paid** is a one-tap action (or auto-suggested when an ingested expense matches).

## 5. Coaching surfaces
- **The nudge** (Stage 1): a gentle **toast in Soumaya's voice** — *"If you spend more than $42 today, your
  insurance payment will be short."* Dismissible; never blocks; respects the app's toast rules (must not
  cover the name/logout header). At most once/day.
- **In chat** (Stage 2): the user asks money questions in the normal Soumaya chat; answers cite the
  snapshot numbers. No separate finance chatbot — one Soumaya.
- **(Stage 3) Forecast answers:** scenario replies rendered inline in chat with a small projection summary.

## 6. Settings (per space)
- Enable/disable the module.
- Currency (Stage 1: single).
- Buffer amount ("always keep $X untouched").
- **Raw-document AI Q&A** toggle (default OFF, per D5) with a plain-language explanation of what's shared.
- Pay cadence hint (helps estimate `nextIncomeDate`).

## 7. Components (maps to `packages/web/src/components/finance/*`)
- `FinanceTab` — routes the sub-screens; owns the enable-flag gate.
- `SafeToSpendHome` — hero + reserved (collapsible) + weekly summary + bills-due list.
- `AddSheet` — the two-choice bottom sheet (snap/manual) + paste entry.
- `ExtractionConfirm` — the editable draft card + source thumbnail + duplicate banner.
- `ManualEntryForm`, `PasteImport`.
- `BillsList`, `BillForm`, `BillDetail`.
- `FinanceSettings`.
- Nudge reuses the existing **toast** system (no new toast primitive).

## 8. Accessibility & non-functional UX
- **Never color-only:** shortfall/over/under states pair color with icon + text; category chips carry a
  label, not just a hue.
- **Reduced motion:** the update transition + any chart animation calm/pause under `prefers-reduced-motion`.
- **Contrast & size:** hero number and amounts meet contrast; tap targets ≥ 44px; nothing overflows a
  360px-wide viewport.
- **Text alternatives:** every amount/state has a screen-reader label ("Safe to spend, ten dollars";
  "Insurance, short by eighteen dollars, due Friday").
- **Offline chip** communicates degraded mode honestly rather than failing silently.

## 9. What "done" means for a UI task here
Per the workflow's UI rule: a Financial UI task is **not done** until someone has looked at it **rendered on
a real phone-width viewport** and compared it against this spec — not just passed typecheck/tests. The
primary user (mobile) is the acceptance surface.
