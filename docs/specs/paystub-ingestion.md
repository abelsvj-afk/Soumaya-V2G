# Spec — Pay Stub Upload, Full Extraction & History

> Design per [AI_ENGINEERING_WORKFLOW.md](../AI_ENGINEERING_WORKFLOW.md) / [WORKFLOW.md](../../WORKFLOW.md).
> Status: **approved — ready to implement.** See "Resolved decisions" below for the answers to
> the three open questions from the first draft, plus one scope addition (flexible pay
> structures) requested during review.

## Resolved decisions (from review)

1. **Deductions AND earnings are individually editable** in the confirm step, not just the
   top-level fields — supersedes the first draft's Non-Goal #3. See §4/§6.
2. **Trend view defaults to showing both gross and net** (not one or the other). See §6.
3. **Confirmed**: `fin_paystub`/"📄 Pay Stubs" stays in the base Money area, not nested under
   Wealth.
4. **Scope addition — flexible pay structures.** Pay stubs aren't all hourly/salary: a company
   truck driver, for example, is paid per mile plus flat day-rates during training, not a simple
   hourly wage. The extraction schema must represent whatever earnings breakdown is actually on
   the document instead of forcing everything into the hourly model. See §4's new `earnings`
   array — additive, keeps every field from the first draft.

## 🎯 Objective

Let a user upload the pay stub they actually download from their employer (PDF, usually)
directly into Soumaya, extract *everything* on it — not a curated subset — save the
original document so it can be viewed again, and build a historical view of pay over
time. Camera-capture of a paper stub or a screenshot remains available as a secondary
path for people who don't have a downloadable file. This grew out of a Money-tab audit
that found the existing "Snap a screenshot" button already targets pay stubs but is
mislabeled, only extracts `netCents` + a free-text label, and never saves the image —
so nothing can be reviewed afterward.

## 📐 Repository facts this design relies on

| Fact | Where |
|---|---|
| `extractFileText.ts` already converts PDF → plain text, DOCX → plain text, entirely client-side, no server round-trip for the binary | `packages/web/src/lib/extractFileText.ts:18-67` |
| PDF extraction is **text-only** (`page.getTextContent()`), never renders to an image; throws a clear "scanned images" error if a page has no selectable text | `extractFileText.ts:44-67` |
| A proven text-in → strict-JSON-out LLM pattern already exists (schema with `additionalProperties:false`, enums, `required`) | `packages/server/src/llm/openai.ts:149-184+`, interface `LlmProvider.extract` in `adapter.ts:84` |
| The current image-only vision path (`extractFinancialImage`) only asks for `netCents`/`platform` for income | `openai.ts:104-147`, called from `finance/ingest.ts:75-92` |
| `FinIncome` already has unused `grossCents`, `taxCents`, `hours` columns | `packages/shared/src/types.ts:707-718` |
| No uploaded image/document is ever persisted today (explicit "not yet" decision) | `packages/server/src/finance/ingest.ts:48-51` |
| The generic attachment system is keyed to `nodeId` only — finance rows have no attachment relationship | `packages/server/src/repositories/attachments.repo.ts` |
| Wealth already has a fullscreen pattern to mirror for the base Money panel | `packages/web/src/components/WealthFullscreen.tsx` |

## 1. Product Definition

A **Pay Stub** is a distinct, richer record than a generic income row: it has an
employer, a pay period, gross/net pay, an itemized list of taxes and deductions (which
vary by employer/state/benefits elected), and often year-to-date totals. It always
produces exactly one `FinIncome` row (the net pay, so Money's existing Safe-to-Spend
math is completely unaffected), but the pay stub's full detail and the original
document live in their own record, viewable later, and used for a specific "income
over time" view separate from the general transaction history.

## 2. Upload UX — two clearly separate paths

| Action | Input | Use case |
|---|---|---|
| **📤 Upload a pay stub** | Plain `<input type="file" accept=".pdf,.docx,image/*">`, no `capture` attribute — opens the device's normal file/photo picker | The primary, expected path: a PDF or image already downloaded/saved from the employer's portal |
| **📷 Take a photo** | Existing `capture="environment"` camera input, relabeled from "Snap a screenshot" | Secondary path: a paper stub, or a screenshot the user already took elsewhere |

Both funnel into the same "review extracted data before saving" confirm step already
established by `ingestPaste`/`ingestImage`, extended with full row-level editing: the
top-level fields (employer/date/gross/net/hours) stay editable exactly as today's flow
already allows, and BOTH the `earnings` and `deductions` arrays (§4) get an inline
editable-list control — edit a row's label/amount, delete a row, "+ Add row" for anything
the extraction missed — before the user confirms save.

## 3. Extraction routing (by file type)

```
Uploaded file
   ├─ .pdf / .docx  → extractFileText() (client-side, existing, free)
   │                    → plain text → NEW text-based paystub extraction (server)
   │                    → if extractFileText throws "no selectable text" (scanned PDF):
   │                       surface a clear error suggesting "Take a photo" instead —
   │                       no new PDF-to-image rendering pipeline is built for this
   │                       rare case in V1 (see Non-Goals).
   └─ image (jpg/png) → existing vision path (extractFinancialImage), extended to the
                          same richer schema (§4) as the text path
```

This means the common case (a real, text-based PDF pay stub) never calls a vision
model at all — cheaper, faster, and more accurate than OCR-via-vision for something
that's already machine-readable text.

## 4. Extraction schema — comprehensive, not curated

A new `PaystubExtractionResult` (mirrors the existing `FinExtractionResult` convention
— per-field confidence, everything optional except what's structurally required):

```ts
interface PaystubExtractionResult {
  employer?: string;
  payDate?: string;           // ISO date
  periodStart?: string;
  periodEnd?: string;
  grossCents?: number;
  netCents: number;           // required — this becomes the FinIncome row
  hours?: number;
  hourlyRateCents?: number;
  overtimeHours?: number;
  overtimeRateCents?: number;
  // NEW — generalizes beyond hourly/salary. A company truck driver's stub might show
  // "Line-haul miles: 2,450 mi @ $0.52/mi", "Training pay: $150/day flat", or per diem/
  // detention/stop pay — none of which fit hours×rate. This array captures whatever
  // earnings breakdown is actually on the document verbatim; the curated fields above
  // stay populated too for the common hourly/salary case (nothing above is removed —
  // this is purely additive, so existing UI reading grossCents/hours keeps working).
  earnings: Array<{ label: string; amountCents: number; quantity?: number; rateCents?: number }>;
  // Deductions/taxes are wildly employer/state-specific — a flexible array beats
  // hardcoding every possible line item (federal/state/FICA/401k/health/etc.).
  deductions: Array<{ label: string; amountCents: number; ytdCents?: number }>;
  ytdGrossCents?: number;
  ytdNetCents?: number;
  confidence: number;
}
```

Implemented as a new `LlmProvider.extractPaystub(text: string): Promise<PaystubExtractionResult>`
for the text path (same JSON-schema-constrained pattern as the existing `extract()`),
and the existing vision path's prompt/schema extended to match for the image path — one
shared schema, two entry points. The prompt explicitly tells the model to read whatever pay
structure is actually on the document (hourly, salary, per-mile, flat/day-rate, commission,
per diem, etc.) into the `earnings` array rather than assuming hourly, and to still fill
`hours`/`hourlyRateCents` when the stub genuinely is a simple hourly wage (so the common case
doesn't lose its convenience fields). The heuristic (no-API-key) provider gets a best-effort
regex fallback for common line-item labels (federal, state, social security, medicare, 401k,
plus a generic "any line ending in a dollar amount" pass for the earnings/deductions arrays),
same "always-offline-capable" principle as the rest of Financial OS — it won't be as sharp as
the LLM path at classifying exotic pay structures, which is expected and fine for a fallback.

## 5. Data model

```sql
CREATE TABLE fin_paystub (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id TEXT NOT NULL DEFAULT 'legacy',
  income_id INTEGER,              -- the FinIncome row this produced (nullable: pre-confirm)
  employer TEXT,
  pay_date TEXT,
  period_start TEXT,
  period_end TEXT,
  gross_cents INTEGER,
  net_cents INTEGER NOT NULL,
  hours REAL,
  hourly_rate_cents INTEGER,
  earnings_json TEXT,             -- the earnings array, verbatim (NEW — pay-structure detail)
  deductions_json TEXT,          -- the deductions array, verbatim
  ytd_gross_cents INTEGER,
  ytd_net_cents INTEGER,
  source_filename TEXT,
  source_mime TEXT,
  source_data TEXT,               -- base64 original file, same storage style as `attachments.data`
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

No SQL foreign key (matches this table family's existing `bucket_id`/`goal_id`
convention). `FinIncome` itself is untouched in shape — its dormant `grossCents`/
`taxCents`/`hours` columns get populated for a paystub-originated income row (tax =
sum of `deductions`), so existing income displays automatically show more detail
without any UI change required there.

## 6. Viewing & history

A new **"📄 Pay Stubs"** section in the Money tab (peer to Bills/History, not nested
under Wealth — this is a Money-reality concept, not a Wealth-intention one):

- List of saved pay stubs (employer, pay date, gross → net), newest first.
- Tap one → full detail (every extracted field, all deductions itemized) + a
  "View original" action that re-serves the saved `source_data` (same pattern as
  `attachmentObjectUrl`: fetch → blob → object URL, never send the raw bytes back down
  as JSON).
- A trend view showing **both gross and net** across saved pay stubs over time by default
  (two lines, distinguishable by more than color alone per this repo's accessibility rule —
  solid vs. dashed stroke, plus a legend) — a lightweight inline-styled sparkline/line row,
  matching this codebase's existing "no new charting dependency" convention (WealthPanel's
  progress bars are also plain divs with a computed width), not a new library. This is the
  pay-stub-only slice of the broader animated income/net-worth trend described in
  [`docs/specs/income-net-worth-trend.md`](./income-net-worth-trend.md) — that spec's chart
  component is built generically enough to also render this view, so there is only one
  charting implementation in the app, not two.

## 7. Money tab fullscreen

Add `FinanceFullscreen.tsx`, mirroring `WealthFullscreen.tsx` exactly (same
`useDialogA11y` overlay shape), plus an expand button in `FinancePanel`'s header —
closing the gap the audit found (Wealth has this, base Money doesn't).

## 8. Button/copy audit fixes (small, bundled with this pass)

- "📷 Snap a screenshot" → "📷 Take a photo" (camera path only; upload gets its own button).
- Help copy updated to describe both paths accurately.

## 🧪 Test plan

- `extractFileText`'s existing PDF/DOCX text extraction: no change, already covered —
  regression-check only.
- New `extractPaystub()` (heuristic provider): deterministic regex extraction against a
  handful of representative pay-stub text fixtures (varying deduction sets).
- Server: `fin_paystub` repo CRUD + space isolation; confirm flow creates exactly one
  `FinIncome` row with `grossCents`/`taxCents`/`hours` populated from the paystub.
- Web: upload-a-file vs. take-a-photo render distinct inputs with correct `accept`/
  `capture`; a scanned-PDF error surfaces the "try Take a photo instead" message;
  Pay Stubs list renders, detail view shows all fields, "View original" round-trips a
  real file; fullscreen opens/closes via the same a11y pattern as Wealth.
- Regression: existing paste/image ingest, manual Add Income, and Safe-to-Spend math
  all unchanged for non-paystub income.

## ✅ Non-Goals (V1)

- Rendering a scanned/image-only PDF page to an image for vision extraction — out of
  scope; users with a scanned PDF are directed to the photo path instead.
- Multi-employer aggregate reasoning/forecasting beyond the trend view itself (e.g. tax
  projections) — future work once real data exists to validate against.
- Automatically classifying a specific pay structure by name (e.g. detecting "this is a
  company-driver mileage stub" as a label) — the `earnings` array captures whatever line items
  are actually on the page; teaching the system to name/categorize pay *types* is future work
  once there's a real variety of saved stubs to learn from.
