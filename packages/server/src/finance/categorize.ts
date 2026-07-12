/**
 * Deterministic expense categorization: payee/merchant → category. A learned override (from
 * `fin_category_override`, passed in) always wins, then keyword rules, else "misc". Pure so
 * it's testable + offline. See docs/financial-os/requirements.md §1.2.
 */

// Order matters: more-specific categories are checked BEFORE broad ones (e.g. "insurance"
// before "transport", so "GEICO auto insurance" is insurance, not transport).
const RULES: Array<{ re: RegExp; category: string }> = [
  { re: /\b(rent|landlord|apartment|lease|property)\b/i, category: "housing" },
  { re: /\b(insurance|geico|allstate|state\s?farm|progressive)\b/i, category: "insurance" },
  { re: /\b(loan|credit\s?card|visa|mastercard|amex|discover|payment\s?to\s?card|klarna|affirm)\b/i, category: "debt" },
  { re: /\b(child\s?support|childcare|daycare|babysit)\b/i, category: "childcare" },
  { re: /\b(pharmacy|cvs|walgreens|doctor|dental|clinic|hospital|copay|medical)\b/i, category: "healthcare" },
  { re: /\b(netflix|spotify|hulu|disney|prime|subscription|patreon|icloud|youtube\s?premium)\b/i, category: "subscriptions" },
  { re: /\b(electric|water|gas\s?bill|utility|pg&e|con\s?ed|internet|comcast|xfinity|spectrum|phone|verizon|at&t|t-mobile)\b/i, category: "utilities" },
  { re: /\b(uber|lyft|gas|shell|chevron|exxon|fuel|parking|toll|dmv|auto|car\s?payment)\b/i, category: "transport" },
  { re: /\b(mcdonald|starbucks|chipotle|grocery|market|kroger|walmart|aldi|food|cafe|restaurant|doordash|grubhub|pizza)\b/i, category: "food" },
];

/** Categorize a merchant string. `override` is the learned category for this exact payee, if any. */
export function categorize(merchant: string | undefined | null, override?: string | null): string {
  if (override) return override;
  const m = (merchant ?? "").trim();
  if (!m) return "misc";
  for (const rule of RULES) if (rule.re.test(m)) return rule.category;
  return "misc";
}
