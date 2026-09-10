import type { GalaxyDiagConfig } from "./perfDiag.js";
import type { NodeBodyDiagConfig } from "./nodeBodyDiag.js";

/**
 * Galaxy render-isolation sweep — an automatic, single-button alternative to
 * perfDiag.ts's underlying `?galaxyDiag=1&category=0` mechanism, for a device/user
 * that can't type into the address bar at all (an installed PWA, a phone browser with
 * no visible URL field, or someone who's said outright "I can't pull up URLs").
 *
 * perfDiag.ts's category config is DELIBERATELY read once per page load and cached —
 * turning it into a live, per-frame-toggleable switch would be a real rearchitecture
 * (every `shouldHideNodeChild` call site is currently a one-time, construction-time
 * check). Rather than take on that risk, this reuses the exact same read-once
 * mechanism unchanged and drives the bisection ACROSS page loads instead of within
 * one: one Settings button starts the sweep, and each step (one render category
 * hidden at a time, plus a baseline) gets its own short measurement window before the
 * page reloads itself onto the next step — fully automatic once started. The user
 * presses one button, waits roughly half a minute while the page reloads a few times
 * on its own, and gets back one small table: which category's absence collapses the
 * render time, if any does.
 */

/** The original 6 steps (perfDiag.ts's coarse categories). Unchanged since these were
 *  first added — do not edit; see NODE_BODY_STEP_KEYS below for the forensic-follow-up
 *  extension appended after them. */
export type DiagStepKey = "baseline" | "links" | "bodies" | "labels" | "glow" | "aux";
/** Node-body sub-isolation (forensic trace follow-up, 2026-09-10) — see nodeBodyDiag.ts
 *  for what each of these actually hides. Appended AFTER the original 6 steps; none of
 *  those steps' definitions or behavior changed. */
export type NodeBodyStepKey =
  | "nodeCoreMesh"
  | "nodeRings"
  | "nodeGlowSprites"
  | "nodeAsteroidBelt"
  | "nodeMacro"
  | "nodeEnvMap";

export type SweepStepDef =
  | { kind: "category"; key: DiagStepKey; label: string }
  | { kind: "nodeBody"; key: NodeBodyStepKey; label: string };

export const SWEEP_STEPS: readonly SweepStepDef[] = [
  { kind: "category", key: "baseline", label: "Baseline (everything on)" },
  { kind: "category", key: "links", label: "Links off" },
  { kind: "category", key: "bodies", label: "Node bodies off" },
  { kind: "category", key: "labels", label: "Labels off" },
  { kind: "category", key: "glow", label: "Glow / corona / bloom off" },
  { kind: "category", key: "aux", label: "Journeys / Money-sky / satellites / agents off" },
  // --- Node-body sub-isolation (forensic trace follow-up) — appended, not inserted ---
  { kind: "nodeBody", key: "nodeCoreMesh", label: "Node-body: core mesh/material off" },
  { kind: "nodeBody", key: "nodeRings", label: "Node-body: rings off" },
  { kind: "nodeBody", key: "nodeGlowSprites", label: "Node-body: glow/corona sprites off" },
  { kind: "nodeBody", key: "nodeAsteroidBelt", label: "Node-body: asteroid belt off" },
  { kind: "nodeBody", key: "nodeMacro", label: "Node-body: macro-LOD sphere off" },
  { kind: "nodeBody", key: "nodeEnvMap", label: "Node-body: scene environment map off" },
];

export interface SweepMeasurement {
  presentP50: number;
  presentP95: number;
  renderP50: number;
  tickP50: number;
  drawCalls: number | null;
  /** Added alongside the node-body sub-isolation steps, but populated for EVERY step
   *  (including the original 6) — a uniform report is more useful than a gap, and this
   *  is purely additional data, not a change to what any step toggles. */
  programs: number | null;
  programsChurnCount: number | null;
  transparentObjects: number | null;
}

export interface SweepResult extends SweepMeasurement {
  key: SweepStepDef["key"];
  label: string;
}

const PROGRESS_KEY = "galaxy.diagSweep";
const REPORT_KEY = "galaxy.diagSweepReport";

/** Let the scene finish its own deferred/idle-callback construction before the
 *  measurement window starts, so an early step isn't penalized by one-time load cost
 *  that every step would otherwise pay unevenly depending on scheduling luck. */
export const SWEEP_WARMUP_MS = 1500;
/** Long enough to average out a few frames' worth of jitter without making the whole
 *  sweep (6 steps × reload-warmup-measure) drag on for minutes on a device already
 *  running at ~1fps, where a single frame alone can take multiple seconds. */
export const SWEEP_MEASURE_MS = 4000;

interface SweepProgress {
  step: number;
  results: SweepResult[];
}

function readProgress(): SweepProgress | null {
  try {
    const raw = sessionStorage.getItem(PROGRESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SweepProgress>;
    if (typeof parsed.step !== "number" || !Array.isArray(parsed.results)) return null;
    return { step: parsed.step, results: parsed.results };
  } catch {
    return null;
  }
}

function writeProgress(p: SweepProgress): void {
  try {
    sessionStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* best-effort — a private-browsing quota error just means the sweep can't proceed,
       not that anything crashes */
  }
}

function clearProgress(): void {
  try {
    sessionStorage.removeItem(PROGRESS_KEY);
  } catch {
    /* best-effort */
  }
}

/** Whether a sweep is currently mid-flight (i.e. this page load should measure and
 *  advance it, rather than render normally). */
export function isSweepActive(): boolean {
  const p = readProgress();
  return !!p && p.step >= 0 && p.step < SWEEP_STEPS.length;
}

/** Short human-readable progress string for a live status readout. */
export function getSweepProgressLabel(): string | null {
  const p = readProgress();
  if (!p || p.step >= SWEEP_STEPS.length) return null;
  return `Step ${p.step + 1}/${SWEEP_STEPS.length}: ${SWEEP_STEPS[p.step]!.label}`;
}

/** Start (or restart) a sweep from step 0 — clears any prior report and reloads. */
export function startSweep(): void {
  clearSweepReport();
  writeProgress({ step: 0, results: [] });
  window.location.reload();
}

/** Abandon an in-progress sweep without reloading — the current page keeps rendering
 *  normally on its next load. Does not touch a previously-completed report. */
export function cancelSweep(): void {
  clearProgress();
}

/**
 * The GalaxyDiagConfig for the CURRENT sweep step, or `null` if no sweep is running —
 * callers should fall back to the normal (URL-based) `getGalaxyDiagConfig()` in that
 * case, exactly as if this module didn't exist. During a `kind: "nodeBody"` step (see
 * `getSweepNodeBodyConfig` below), this returns the same all-on config as the baseline
 * step — isolation for those steps happens entirely through the node-body config, not
 * this one.
 */
export function getSweepDiagConfig(): GalaxyDiagConfig | null {
  const p = readProgress();
  if (!p || p.step >= SWEEP_STEPS.length) return null;
  const step = SWEEP_STEPS[p.step]!;
  const cfg: GalaxyDiagConfig = { enabled: true, links: true, bodies: true, labels: true, glow: true, aux: true };
  if (step.kind === "nodeBody" || step.key === "baseline") {
    // `enabled: false` — not "diagnostic mode on with everything on" — so this
    // measurement reflects the exact same code path a normal (non-sweep) load takes,
    // for anything perfDiag.ts's own categories control.
    return { ...cfg, enabled: false };
  }
  cfg[step.key] = false;
  return cfg;
}

/**
 * The NodeBodyDiagConfig for the CURRENT sweep step, or `null` if no sweep is running
 * OR the current step isn't a `kind: "nodeBody"` step (i.e. every original-6 step,
 * including baseline). Callers should fall back to `DEFAULT_NODE_BODY_DIAG` (all on,
 * `enabled: false`) in that case.
 */
export function getSweepNodeBodyConfig(): NodeBodyDiagConfig | null {
  const p = readProgress();
  if (!p || p.step >= SWEEP_STEPS.length) return null;
  const step = SWEEP_STEPS[p.step]!;
  if (step.kind !== "nodeBody") return null;
  const cfg: NodeBodyDiagConfig = {
    enabled: true,
    coreMesh: true,
    rings: true,
    glowSprites: true,
    asteroidBelt: true,
    macro: true,
    envMap: true,
  };
  const field: Record<NodeBodyStepKey, keyof Omit<NodeBodyDiagConfig, "enabled">> = {
    nodeCoreMesh: "coreMesh",
    nodeRings: "rings",
    nodeGlowSprites: "glowSprites",
    nodeAsteroidBelt: "asteroidBelt",
    nodeMacro: "macro",
    nodeEnvMap: "envMap",
  };
  cfg[field[step.key]] = false;
  return cfg;
}

/**
 * Called once per page load that's mid-sweep, after `SWEEP_WARMUP_MS` + `SWEEP_MEASURE_MS`
 * have elapsed, with a real `perfStats` sample taken over that window. Records the
 * result for the CURRENT step, then either reloads onto the next step or — on the
 * last step — finalizes the report into localStorage (durable past this sweep, unlike
 * the sessionStorage in-progress state, and unaffected by `cancelSweep`) and clears
 * the in-progress marker.
 */
export function recordSweepMeasurement(sample: SweepMeasurement): void {
  const p = readProgress();
  if (!p || p.step >= SWEEP_STEPS.length) return;
  const step = SWEEP_STEPS[p.step]!;
  const results: SweepResult[] = [...p.results, { key: step.key, label: step.label, ...sample }];
  const nextStep = p.step + 1;
  if (nextStep >= SWEEP_STEPS.length) {
    try {
      localStorage.setItem(REPORT_KEY, JSON.stringify(results));
    } catch {
      /* best-effort */
    }
    clearProgress();
    return;
  }
  writeProgress({ step: nextStep, results });
  window.location.reload();
}

export function getSweepReport(): SweepResult[] | null {
  try {
    const raw = localStorage.getItem(REPORT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SweepResult[]) : null;
  } catch {
    return null;
  }
}

export function clearSweepReport(): void {
  try {
    localStorage.removeItem(REPORT_KEY);
  } catch {
    /* best-effort */
  }
}
