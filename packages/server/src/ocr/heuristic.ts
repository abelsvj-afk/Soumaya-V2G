import type { FinExtractionResult, ExtractedIncome, ExtractedExpense } from "@brain/shared";
import type { OcrProvider, OcrSource } from "./adapter.js";

/**
 * Heuristic paste parser — the ALWAYS-AVAILABLE, no-key ingestion path. It reads pasted
 * Cash App / Venmo / bank-export text line by line and pulls out amount, direction, a label,
 * and a date where present. Deterministic (regex only), so it works fully offline and is
 * pinned by tests. Every row is a low/medium-confidence DRAFT the user confirms. See
 * docs/financial-os/architecture.md §3.
 */

const AMOUNT_RE = /([+-]?)\s*\$?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)/;
const ISO_RE = /(\d{4})-(\d{2})-(\d{2})/;
const US_RE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;

// Words that signal money coming IN vs going OUT.
const INCOME_HINTS = /\b(received|deposit|payroll|earnings?|payout|cash\s?out|refund|from|credited|paid\s+you|direct\s+dep)/i;
const EXPENSE_HINTS = /\b(payment|sent|purchase|withdrawal|debit|bought|spent|to\b|pos|charge)/i;

function toCents(sign: string, num: string): number {
  const n = Math.round(parseFloat(num.replace(/,/g, "")) * 100);
  return sign === "-" ? -n : n;
}

/** Normalize a detected date to ISO `YYYY-MM-DD`, using `refYear` when the year is absent. */
function parseDate(line: string, refYear: number): string | undefined {
  const iso = line.match(ISO_RE);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = line.match(US_RE);
  if (us) {
    const mm = us[1]!.padStart(2, "0");
    const dd = us[2]!.padStart(2, "0");
    let yy = us[3] ?? String(refYear);
    if (yy.length === 2) yy = `20${yy}`;
    return `${yy}-${mm}-${dd}`;
  }
  return undefined;
}

/** Strip amount, date, currency, and connective words to leave a readable label/payee. */
function labelOf(line: string): string | undefined {
  const cleaned = line
    .replace(AMOUNT_RE, " ")
    .replace(ISO_RE, " ")
    .replace(US_RE, " ")
    .replace(/[$]|[+\-]{1,}|\b(payment|sent|received|to|from|purchase|deposit|withdrawal|debit|credit|pos|charge)\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned.length >= 2 ? cleaned.slice(0, 60) : undefined;
}

export class HeuristicOcrProvider implements OcrProvider {
  readonly name = "heuristic" as const;
  supports(source: OcrSource): boolean {
    return source.kind === "paste" && !!source.text && source.text.trim().length > 0;
  }

  async extract(source: OcrSource): Promise<FinExtractionResult> {
    const incomes: ExtractedIncome[] = [];
    const expenses: ExtractedExpense[] = [];
    const refYear = new Date().getUTCFullYear();

    for (const rawLine of (source.text ?? "").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const date = parseDate(line, refYear);
      // Remove the date text FIRST so its digits (e.g. the year 2026) can't be misread as the
      // amount — a real bug: "2026-01-09 +$1,234.00" was parsing $2026.00.
      let work = line;
      const isoM = line.match(ISO_RE);
      if (isoM) work = work.replace(isoM[0], " ");
      else { const usM = line.match(US_RE); if (usM) work = work.replace(usM[0], " "); }
      const m = work.match(AMOUNT_RE);
      if (!m) continue;
      const cents = toCents(m[1] ?? "", m[2] ?? "0");
      if (cents === 0) continue;
      const label = labelOf(work);

      // Direction: an explicit sign wins; else keyword hints; else default to an expense.
      const income = INCOME_HINTS.test(line);
      const expense = EXPENSE_HINTS.test(line);
      const signedIn = m[1] === "+";
      const signedOut = m[1] === "-";
      let isIncome: boolean;
      let confidence: number;
      if (signedIn || (income && !expense)) { isIncome = true; confidence = signedIn ? 0.7 : 0.6; }
      else if (signedOut || (expense && !income)) { isIncome = false; confidence = signedOut ? 0.7 : 0.6; }
      else { isIncome = false; confidence = 0.4; } // ambiguous → expense, flagged low-confidence

      const abs = Math.abs(cents);
      if (isIncome) {
        incomes.push({ date, netCents: abs, platform: label, confidence });
      } else {
        expenses.push({ date, amountCents: abs, merchant: label, direction: "out", confidence });
      }
    }

    return { incomes, expenses, provider: "heuristic" };
  }
}
