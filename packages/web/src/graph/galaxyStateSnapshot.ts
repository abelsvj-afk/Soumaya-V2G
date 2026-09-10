/**
 * DIAGNOSTIC ONLY — BAD-vs-GOOD Galaxy state snapshot (2026-09-10 forensic pass).
 *
 * Every earlier diagnostic in this investigation tried to CAUSE a state change (toggle
 * a category, bypass the composer, run an automated sweep) and measure the result. This
 * module does none of that: it takes a single, comprehensive snapshot of whatever state
 * the Galaxy is ALREADY in, on demand, with zero effect on the scene. The user captures
 * one snapshot while the Galaxy is in its bad (multi-second render) state, then opens a
 * View/Lens (or otherwise reaches the "suddenly fast" state) and captures a second
 * snapshot — no scripted toggling, no reload, no assumption about which layer matters.
 * The two snapshots are then diffed field-by-field so the actual, real difference
 * between the two states is visible directly, rather than inferred from an isolated
 * experiment that risks the exact LOD-drift/thermal/reload confounds this investigation
 * has already hit more than once.
 *
 * Pure types + comparison/formatting live here (fully unit-testable, no THREE/DOM
 * dependency). The actual capture — which needs live scene/camera/renderer/composer
 * references — is implemented in Graph3D.tsx and wired in via the same register/consume
 * pattern perfStats.ts (`registerGalaxyCounts`) and autoRenderDiag.ts
 * (`registerAutoDiagRunner`) already use, so this module never imports THREE or reaches
 * into Graph3D's internals directly.
 */

export interface GalaxyDiagSnapshot {
  capturedAt: number;
  label: string;

  // perfStats-derived (renderer.render() level — see perfStats.ts's own doc comment for
  // why tick/render/present are three independent series, not one fused number).
  tickP50: number;
  renderP50: number;
  renderP95: number;
  presentP50: number;
  gpuP50: number | null;
  gpuTimingSupported: boolean;

  // Render-path stage breakdown (renderStageTrace.ts) — the NEW instrumentation this
  // pass adds, distinguishing composer-level cost from the base scene draw specifically.
  composerMs: number | null;
  renderPassMs: number | null;
  passesInLastComposerFrame: number;

  // renderer.info (already exposed by perfStats.snapshot(), just carried through here).
  drawCalls: number | null;
  triangles: number | null;
  lines: number | null;
  points: number | null;
  geometries: number | null;
  textures: number | null;
  programs: number | null;
  programsChurnCount: number;

  // Canvas/device state.
  canvasWidth: number | null;
  canvasHeight: number | null;
  pixelRatio: number | null;

  // Camera.
  cameraX: number | null;
  cameraY: number | null;
  cameraZ: number | null;

  // Scene population.
  totalObject3Ds: number | null;
  visibleObject3Ds: number | null;
  transparentObjects: number | null;
  trackedNodes: number | null;
  visibleNodes: number | null;
  trackedLinks: number | null;
  visibleLinks: number | null;
  visibleLabels: number | null;
  lightPoolSize: number | null;

  // Composer/refresh activity — the two mechanisms this investigation has already
  // implicated (EffectComposer's own per-frame cost; three-forcegraph's `_flushObjects`-
  // driven object-cache clear, only reachable indirectly since the underlying kapsule
  // state is not publicly exposed — see `noteRefreshInvoked`'s doc comment).
  composerBypassed: boolean;
  bloomPassCount: number | null;
  refreshCallsLast3s: number;
}

/**
 * `three-forcegraph`'s internal `_flushObjects` flag (the thing that forces a full
 * node+link object-cache clear — see docs/specs/soumaya-galaxy-graphdata-refresh-audit.md
 * and soumaya-galaxy-cache-disposal-audit.md) lives on a CLOSURE-private `state` object
 * inside the `kapsule` library — confirmed by reading kapsule's source directly: `state`
 * is a local variable inside the component-factory function, never attached to the
 * returned component object under any property name, so there is no way to read it from
 * outside. Rather than fabricate a value, this module instruments the one thing we DO
 * fully control: every call site in this codebase that invokes `fg.refresh()` (the only
 * way `_flushObjects` gets set, short of a `graphData` replacement, which is tracked
 * separately as `App.tsx`'s own refresh cadence). A snapshot's `refreshCallsLast3s`
 * counts how many of those calls happened in the 3 seconds before the snapshot was
 * captured — an honest proxy for "was a full object-cache clear likely triggered
 * recently," not a direct read of the flag itself.
 */
const REFRESH_WINDOW_MS = 3000;
const refreshCallTimestamps: number[] = [];

/** Call this at every `fg.refresh()` call site in Graph3D.tsx. Adds one timestamp and
 *  prunes anything older than the window — bounded memory, no per-frame cost (refresh()
 *  is called at most a handful of times per second even in the worst case found so far). */
export function noteRefreshInvoked(nowMs: number = performance.now()): void {
  refreshCallTimestamps.push(nowMs);
  const cutoff = nowMs - REFRESH_WINDOW_MS;
  while (refreshCallTimestamps.length > 0 && refreshCallTimestamps[0]! < cutoff) {
    refreshCallTimestamps.shift();
  }
}

/** Count of `noteRefreshInvoked()` calls within the last `REFRESH_WINDOW_MS` of `nowMs`. */
export function getRefreshCallsInWindow(nowMs: number = performance.now()): number {
  const cutoff = nowMs - REFRESH_WINDOW_MS;
  return refreshCallTimestamps.filter((t) => t >= cutoff).length;
}

/** Test-only: clear recorded refresh timestamps. */
export function __resetRefreshTrackingForTests(): void {
  refreshCallTimestamps.length = 0;
}

export type SnapshotCaptureFn = (label: string) => GalaxyDiagSnapshot;
let captureFn: SnapshotCaptureFn | null = null;

/** Graph3D calls this once at mount (and with `null` on unmount) — same pattern as
 *  perfStats.ts's `registerGalaxyCounts` / autoRenderDiag.ts's `registerAutoDiagRunner`. */
export function registerSnapshotCapture(fn: SnapshotCaptureFn | null): void {
  captureFn = fn;
}

/** Returns null if Graph3D isn't mounted (nothing registered). */
export function captureGalaxySnapshot(label: string): GalaxyDiagSnapshot | null {
  return captureFn ? captureFn(label) : null;
}

export function isSnapshotCaptureAvailable(): boolean {
  return captureFn !== null;
}

interface DiffRow {
  field: string;
  bad: string;
  good: string;
  /** True when the two values differ AND at least one side has a real (non-null)
   *  value — a null-vs-null "difference" (both unavailable) is not notable. */
  notable: boolean;
}

function fmt(v: number | boolean | string | null): string {
  if (v === null) return "n/a";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(1);
  return v;
}

/** One row per field, in a fixed, report-friendly order. Pure — no DOM, no THREE. */
export function diffSnapshots(bad: GalaxyDiagSnapshot, good: GalaxyDiagSnapshot): DiffRow[] {
  const fields: Array<[string, keyof GalaxyDiagSnapshot]> = [
    ["tick p50 (ms)", "tickP50"],
    ["render p50 (ms)", "renderP50"],
    ["render p95 (ms)", "renderP95"],
    ["present p50 (ms)", "presentP50"],
    ["GPU p50 (ms)", "gpuP50"],
    ["composer.render() (ms)", "composerMs"],
    ["RenderPass.render() (ms)", "renderPassMs"],
    ["passes/composer frame", "passesInLastComposerFrame"],
    ["draw calls", "drawCalls"],
    ["triangles", "triangles"],
    ["lines", "lines"],
    ["points", "points"],
    ["geometries", "geometries"],
    ["textures", "textures"],
    ["programs", "programs"],
    ["program churn (session)", "programsChurnCount"],
    ["canvas width", "canvasWidth"],
    ["canvas height", "canvasHeight"],
    ["pixel ratio", "pixelRatio"],
    ["camera x", "cameraX"],
    ["camera y", "cameraY"],
    ["camera z", "cameraZ"],
    ["total Object3Ds", "totalObject3Ds"],
    ["visible Object3Ds", "visibleObject3Ds"],
    ["transparent objects", "transparentObjects"],
    ["tracked nodes", "trackedNodes"],
    ["visible nodes", "visibleNodes"],
    ["tracked links", "trackedLinks"],
    ["visible links", "visibleLinks"],
    ["visible labels", "visibleLabels"],
    ["light pool size", "lightPoolSize"],
    ["composer bypassed", "composerBypassed"],
    ["bloom pass count", "bloomPassCount"],
    ["refresh() calls (last 3s)", "refreshCallsLast3s"],
  ];
  return fields.map(([field, key]) => {
    const b = bad[key] as number | boolean | string | null;
    const g = good[key] as number | boolean | string | null;
    return {
      field,
      bad: fmt(b),
      good: fmt(g),
      notable: b !== g && !(b === null && g === null),
    };
  });
}

/** Human-readable comparison report — same convention as autoRenderDiag.ts's
 *  `formatReportText` (plain text, copy-to-clipboard friendly). */
export function formatComparisonText(bad: GalaxyDiagSnapshot, good: GalaxyDiagSnapshot): string {
  const rows = diffSnapshots(bad, good);
  const lines: string[] = [];
  lines.push(`Galaxy BAD-vs-GOOD state snapshot comparison`);
  lines.push(`  BAD:  "${bad.label}" captured ${new Date(bad.capturedAt).toLocaleTimeString()}`);
  lines.push(`  GOOD: "${good.label}" captured ${new Date(good.capturedAt).toLocaleTimeString()}`);
  lines.push("");
  const width = Math.max(...rows.map((r) => r.field.length));
  for (const r of rows) {
    const marker = r.notable ? "≠" : " ";
    lines.push(`  ${marker} ${r.field.padEnd(width)}  bad=${r.bad.padEnd(10)} good=${r.good}`);
  }
  const notable = rows.filter((r) => r.notable);
  lines.push("");
  lines.push(
    notable.length > 0
      ? `${notable.length} field(s) differ between the two captured states (marked ≠ above).`
      : "No fields differed between the two captured states — the snapshots are identical.",
  );
  return lines.join("\n");
}
