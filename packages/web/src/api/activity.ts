/**
 * Global "AI is working" signal — the in-flight count of LLM-backed requests, driving
 * the activity badge. Extracted from client.ts (Post-MVP D4) so domain modules that
 * make tracked requests (e.g. companion.ts) can share `tracked` without a cycle.
 */
type ActivityListener = (active: number) => void;
let activeCount = 0;
const activityListeners = new Set<ActivityListener>();

function setActive(delta: number): void {
  activeCount = Math.max(0, activeCount + delta);
  for (const l of activityListeners) l(activeCount);
}

/** Subscribe to in-flight LLM-backed request count (for the activity badge). */
export function onAiActivity(cb: ActivityListener): () => void {
  activityListeners.add(cb);
  cb(activeCount);
  return () => activityListeners.delete(cb);
}

/** Wrap a promise so it counts toward the "AI is working" signal while in flight. */
export async function tracked<T>(p: Promise<T>): Promise<T> {
  setActive(1);
  try {
    return await p;
  } finally {
    setActive(-1);
  }
}
