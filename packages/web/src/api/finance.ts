import { API, afetch } from "./http.js";
import type { FinAccount, FinBill, FinBillOccurrence, FinIncome, FinExpense, BudgetSummary, BillFrequency, ExpenseDirection, FinExtractionResult } from "@brain/shared";

/**
 * Financial OS client (Stage 1a). Thin wrappers over /api/finance; space-scoped server-side
 * via the x-space-id header. Money is INTEGER cents. Offline-safe callers guard on null.
 */

export interface FinanceSummary {
  budget: BudgetSummary;
  account: FinAccount;
  upcoming: Array<FinBillOccurrence & { name: string }>;
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await afetch(`${API}/finance${path}`);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}
async function send<T>(path: string, method: string, body?: unknown): Promise<T | null> {
  try {
    const res = await afetch(`${API}/finance${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export const getFinanceSummary = () => getJson<FinanceSummary>("/summary");
export const setBalance = (cents: number) => send<FinAccount>("/account/balance", "PUT", { cents });
export const setBuffer = (cents: number) => send<FinAccount>("/account/buffer", "PUT", { cents });

export const listBills = () => getJson<FinBill[]>("/bills");
export interface BillInput {
  name: string; amountCents: number; frequency: BillFrequency; anchorDate: string;
  everyDays?: number; autopay?: boolean; category?: string; graceDays?: number;
  lateFeeCents?: number; payee?: string; accountLast4?: string;
}
export const createBill = (b: BillInput) => send<FinBill>("/bills", "POST", b);
export const patchBill = (id: number, patch: Partial<BillInput> & { active?: boolean }) => send<FinBill>(`/bills/${id}`, "PATCH", patch);
export const deleteBill = (id: number) => send<{ ok: boolean }>(`/bills/${id}`, "DELETE");
export const markOccurrencePaid = (id: number) => send<{ ok: boolean; budget: BudgetSummary }>(`/bills/occurrence/${id}/paid`, "POST");

export interface IncomeInput { date: string; netCents: number; grossCents?: number; taxCents?: number; hours?: number; platform?: string }
export interface ExpenseInput { date: string; amountCents: number; category: string; direction?: ExpenseDirection; merchant?: string }
export const addIncome = (i: IncomeInput) => send<{ income: FinIncome; duplicate: boolean; budget: BudgetSummary }>("/income", "POST", i);
export const addExpense = (e: ExpenseInput) => send<{ expense: FinExpense; duplicate: boolean; budget: BudgetSummary }>("/expense", "POST", e);

// ---- Ingestion (Stage 1b): paste → drafts → confirm ----
export const ingestPaste = (text: string) => send<{ sourceId: number; result: FinExtractionResult }>("/ingest/paste", "POST", { text });
export interface ConfirmInput {
  sourceId: number;
  incomes: Array<{ date?: string; netCents: number; platform?: string }>;
  expenses: Array<{ date?: string; amountCents: number; merchant?: string; category: string; direction?: ExpenseDirection }>;
}
export const confirmIngest = (input: ConfirmInput) => send<{ committed: number; budget: BudgetSummary }>("/ingest/confirm", "POST", input);
