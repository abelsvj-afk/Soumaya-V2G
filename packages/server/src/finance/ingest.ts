import type { DbHandle } from "../db/client.js";
import { DEFAULT_SPACE } from "../db/schema.js";
import type { FinExtractionResult, ExtractedIncome, ExtractedExpense, BudgetSummary } from "@brain/shared";
import { HeuristicOcrProvider } from "../ocr/heuristic.js";
import { FinSourceRepo } from "../repositories/finSource.repo.js";
import { FinIncomeRepo } from "../repositories/finIncome.repo.js";
import { FinExpenseRepo } from "../repositories/finExpense.repo.js";
import { FinAccountRepo } from "../repositories/finAccount.repo.js";
import { FinCategoryOverrideRepo } from "../repositories/finCategoryOverride.repo.js";
import { categorize } from "./categorize.js";
import { getBudgetSummary } from "./summary.js";

/**
 * Ingestion pipeline (Stage 1b) — paste text → retained source → DRAFT candidates → (user
 * confirms) → committed rows. Nothing commits until confirm; every committed row links to its
 * source for traceability. Offline: the heuristic parser needs no cloud key. See
 * docs/financial-os/architecture.md §3.
 */

/** A default day for a candidate that carried no parseable date. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Parse pasted text into DRAFT candidates: retain the raw source (status=pending), run the
 * heuristic provider, categorize expenses (learned overrides + rules), and flag likely
 * duplicates. Returns the sourceId + the annotated result. Commits NOTHING.
 */
export async function ingestPaste(
  handle: DbHandle,
  spaceId: string = DEFAULT_SPACE,
  text: string,
): Promise<{ sourceId: number; result: FinExtractionResult }> {
  const provider = new HeuristicOcrProvider();
  const raw = await provider.extract({ kind: "paste", text });

  const overrides = new FinCategoryOverrideRepo(handle, spaceId);
  const incomeRepo = new FinIncomeRepo(handle, spaceId);
  const expenseRepo = new FinExpenseRepo(handle, spaceId);

  const incomes: ExtractedIncome[] = raw.incomes.map((i) => ({
    ...i,
    duplicate: !!incomeRepo.findDuplicate(i.date ?? today(), i.netCents),
  }));
  const expenses: ExtractedExpense[] = raw.expenses.map((e) => ({
    ...e,
    category: categorize(e.merchant, overrides.get(e.merchant ?? "")),
    duplicate: !!expenseRepo.findDuplicate(e.date ?? today(), e.amountCents, e.merchant ?? null),
  }));

  const result: FinExtractionResult = { incomes, expenses, provider: raw.provider };
  const source = new FinSourceRepo(handle, spaceId).create({
    kind: "paste",
    extractionJson: JSON.stringify({ raw: text.slice(0, 20_000), result }),
  });
  return { sourceId: source.id, result };
}

/**
 * Commit the user-confirmed rows against a pending source: insert each income/expense linked to
 * the source, learn any category the user set, adjust the balance going forward (D3), mark the
 * source confirmed, and return the fresh budget.
 */
export function confirmIngest(
  handle: DbHandle,
  spaceId: string = DEFAULT_SPACE,
  input: {
    sourceId: number;
    incomes: Array<{ date?: string; netCents: number; platform?: string }>;
    expenses: Array<{ date?: string; amountCents: number; merchant?: string; category: string; direction?: "out" | "in" }>;
  },
): { committed: number; budget: BudgetSummary } | null {
  const sources = new FinSourceRepo(handle, spaceId);
  const source = sources.get(input.sourceId);
  if (!source || source.status !== "pending") return null; // unknown or already handled

  const incomeRepo = new FinIncomeRepo(handle, spaceId);
  const expenseRepo = new FinExpenseRepo(handle, spaceId);
  const account = new FinAccountRepo(handle, spaceId);
  const overrides = new FinCategoryOverrideRepo(handle, spaceId);
  let committed = 0;

  const tx = handle.sqlite.transaction(() => {
    for (const i of input.incomes) {
      const date = (i.date ?? today()).slice(0, 10);
      incomeRepo.create({ date, netCents: i.netCents, platform: i.platform ?? null, sourceId: source.id, confidence: 1 });
      account.adjustBalance(i.netCents);
      committed++;
    }
    for (const e of input.expenses) {
      const date = (e.date ?? today()).slice(0, 10);
      const dir = e.direction ?? "out";
      expenseRepo.create({ date, amountCents: e.amountCents, category: e.category, direction: dir, merchant: e.merchant ?? null, sourceId: source.id, confidence: 1 });
      account.adjustBalance(dir === "out" ? -e.amountCents : e.amountCents);
      if (e.merchant && e.category) overrides.set(e.merchant, e.category); // remember the choice
      committed++;
    }
    sources.setStatus(source.id, "confirmed");
  });
  tx();

  return { committed, budget: getBudgetSummary(handle, spaceId) };
}
