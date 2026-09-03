import type { PaystubExtractionResult, PaystubLineItem } from "@brain/shared";

/**
 * Heuristic pay-stub text parser — the ALWAYS-AVAILABLE, no-key fallback for
 * docs/specs/paystub-ingestion.md's text extraction path. Deterministic (regex only), so
 * it works fully offline when no LLM key is configured or the cloud call fails. It won't be
 * as sharp as the LLM path at classifying exotic pay structures (a company truck driver's
 * per-mile pay, say) — expected and fine for a fallback; every field it produces is still
 * reviewed/editable in the confirm step before anything saves.
 */

const AMOUNT_RE = /\$?\s*(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)\s*$/;
const ISO_RE = /(\d{4})-(\d{2})-(\d{2})/;
const US_RE = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/;

const NET_RE = /\bnet\s*(pay|amount|check)?\b/i;
const GROSS_RE = /\bgross\s*(pay|earnings)?\b/i;
const YTD_RE = /\by\.?t\.?d\.?\b|\byear[- ]to[- ]date\b/i;
const DEDUCTION_HINTS = /\b(federal|fed\s?tax|state\s?tax|social\s?security|medicare|fica|401\s?k|401k|insurance|dental|vision|garnishment|union\s?dues|hsa|retirement)\b/i;

function toCents(num: string): number {
  return Math.abs(Math.round(parseFloat(num.replace(/,/g, "")) * 100));
}

function parseDate(text: string): string | undefined {
  const iso = text.match(ISO_RE);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = text.match(US_RE);
  if (us) {
    const mm = us[1]!.padStart(2, "0");
    const dd = us[2]!.padStart(2, "0");
    let yy = us[3]!;
    if (yy.length === 2) yy = `20${yy}`;
    return `${yy}-${mm}-${dd}`;
  }
  return undefined;
}

/** Strip a trailing dollar amount to leave the line's label. */
function labelOf(line: string): string {
  return line.replace(AMOUNT_RE, "").replace(/\s{2,}/g, " ").trim().slice(0, 80);
}

export function heuristicExtractPaystub(text: string): PaystubExtractionResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let netCents: number | undefined;
  let grossCents: number | undefined;
  let ytdGrossCents: number | undefined;
  let ytdNetCents: number | undefined;
  const earnings: PaystubLineItem[] = [];
  const deductions: PaystubLineItem[] = [];
  let payDate: string | undefined;

  for (const line of lines) {
    if (!payDate) payDate = parseDate(line);

    // Strip a date's own digits FIRST so a line like "Pay Date: 2026-03-01" can't have its
    // trailing "01" misread as a $0.01 amount — same fix already proven in ocr/heuristic.ts.
    let work = line;
    const isoM = line.match(ISO_RE);
    if (isoM) work = work.replace(isoM[0], " ");
    else { const usM = line.match(US_RE); if (usM) work = work.replace(usM[0], " "); }

    const m = work.match(AMOUNT_RE);
    if (!m) continue;
    const cents = toCents(m[1]!);
    if (cents === 0) continue;
    const label = labelOf(work);
    if (!label) continue;
    const isYtd = YTD_RE.test(line);

    if (NET_RE.test(line)) {
      if (isYtd) ytdNetCents = cents; else netCents = cents;
      continue;
    }
    if (GROSS_RE.test(line)) {
      if (isYtd) ytdGrossCents = cents; else grossCents = cents;
      continue;
    }
    if (DEDUCTION_HINTS.test(line)) {
      deductions.push(isYtd ? { label, amountCents: 0, ytdCents: cents } : { label, amountCents: cents });
      continue;
    }
    if (!isYtd) earnings.push({ label, amountCents: cents });
  }

  // A stub with no detectable net pay isn't usable — the caller's confirm step needs a
  // real number to seed. Fall back to the largest earnings line as a last resort, or 0
  // (the user corrects it in the confirm step; nothing commits until they do). This is a
  // real guess, not a match — it gets a lower confidence than an actual "Net Pay" line.
  const netWasGuessed = netCents == null;
  const finalNetCents: number = netWasGuessed ? (earnings.length > 0 ? Math.max(...earnings.map((e) => e.amountCents)) : 0) : netCents!;

  return {
    payDate,
    grossCents,
    netCents: finalNetCents,
    earnings,
    deductions: deductions.filter((d) => d.amountCents > 0 || d.ytdCents),
    ytdGrossCents,
    ytdNetCents,
    confidence: netWasGuessed ? (finalNetCents > 0 ? 0.35 : 0.2) : 0.6,
  };
}
