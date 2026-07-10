/**
 * HTTP transport for the API client. Extracted from the (very large) `client.ts` so
 * domain modules (`features.ts`, …) can share the same fetch wrapper without a cycle.
 * Behaviour is unchanged — this is a pure move (Post-MVP D4 refactor).
 */

export const API = "/api";

// The space id is the secret key to a private brain. We keep it in localStorage so it
// persists on this device, and send it on every API call.
const SPACE_KEY = "brain.spaceId";
const SPACE_NAME_KEY = "brain.spaceName";

export function getSpaceId(): string | null {
  try {
    return localStorage.getItem(SPACE_KEY);
  } catch {
    return null;
  }
}
export function getSpaceName(): string | null {
  try {
    return localStorage.getItem(SPACE_NAME_KEY);
  } catch {
    return null;
  }
}
export function storeSpace(id: string | null, name?: string): void {
  try {
    if (id) {
      localStorage.setItem(SPACE_KEY, id);
      if (name) localStorage.setItem(SPACE_NAME_KEY, name);
    } else {
      localStorage.removeItem(SPACE_KEY);
      localStorage.removeItem(SPACE_NAME_KEY);
    }
  } catch {
    /* storage may be unavailable (private mode) — auth still works in-session */
  }
}

/**
 * Default request timeout. LLM-backed calls (chat/research/ingest) can be slow, so
 * this is generous — but NOTHING is allowed to hang forever (that froze the app on
 * boot: a stalled /api/graph never settled, so the loading overlay + the "thinking"
 * counter stuck permanently). Boot-critical reads pass a much shorter timeout.
 */
export const DEFAULT_TIMEOUT_MS = 60_000;
/** Boot reads must fail fast so the app can recover instead of freezing on the sun. */
export const BOOT_TIMEOUT_MS = 12_000;

/**
 * fetch wrapper that attaches the current brain's id AND enforces a timeout, so a
 * stalled network/server can never hang a request forever. Aborts on timeout unless
 * the caller supplies its own AbortSignal.
 */
export function afetch(path: string, init: RequestInit = {}, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const headers = new Headers(init.headers);
  const id = getSpaceId();
  if (id) headers.set("x-space-id", id);
  // If the caller passed its own signal, respect it; otherwise time out ourselves.
  if (init.signal) return fetch(path, { ...init, headers });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(path, { ...init, headers, signal: controller.signal }).finally(() => clearTimeout(timer));
}
