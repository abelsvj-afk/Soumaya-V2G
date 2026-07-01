/**
 * UI Sound Kit — dependency-free, procedural Web Audio SFX.
 *
 * Every sound is synthesized at runtime (oscillator + gain envelope), so we ship no
 * audio files and get free per-play pitch variation. One `playSfx(name)` API; a master
 * enable + volume (separate from the music, persisted in localStorage); lazy AudioContext
 * init on first gesture; and everything wrapped so a failure can never break the UI.
 * Respects `prefers-reduced-motion` (treated as reduce-sound) unless the user opts in.
 */

export type SfxName =
  | "tap"
  | "open"
  | "close"
  | "confirm"
  | "select"
  | "notify"
  | "achievement"
  | "error"
  | "delete"
  | "welcome";

const ENABLED_KEY = "sfx.enabled";
const VOLUME_KEY = "sfx.volume";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let lastPlay = 0; // global throttle so rapid clicks don't machine-gun

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
}

export function sfxEnabled(): boolean {
  try {
    const v = localStorage.getItem(ENABLED_KEY);
    if (v === "1") return true;
    if (v === "0") return false;
    return !prefersReducedMotion(); // default on, but off if the OS asks for less motion
  } catch {
    return true;
  }
}

export function setSfxEnabled(on: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (on) void playSfx("tap"); // audible confirmation when turning it on
}

export function sfxVolume(): number {
  try {
    const v = parseFloat(localStorage.getItem(VOLUME_KEY) ?? "");
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.7; // loud enough to cut through the music
  } catch {
    return 0.7;
  }
}

export function setSfxVolume(v: number): void {
  try {
    localStorage.setItem(VOLUME_KEY, String(Math.max(0, Math.min(1, v))));
  } catch {
    /* ignore */
  }
  if (master) master.gain.value = sfxVolume();
}

function ensure(): AudioContext | null {
  if (ctx) {
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = sfxVolume();
    master.connect(ctx.destination);
    return ctx;
  } catch {
    return null;
  }
}

/** One shaped tone: freq (with optional glide), waveform, duration, relative gain. */
function tone(
  ac: AudioContext,
  opts: { freq: number; glideTo?: number; type?: OscillatorType; dur: number; gain: number; delay?: number },
): void {
  const t0 = ac.currentTime + (opts.delay ?? 0);
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = opts.type ?? "sine";
  // ±4% pitch jitter so repeated cues never feel mechanical.
  const jitter = 1 + (((t0 * 1000) % 8) / 100 - 0.04);
  osc.frequency.setValueAtTime(opts.freq * jitter, t0);
  if (opts.glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.glideTo * jitter), t0 + opts.dur);
  // Quick attack, smooth exponential release — no clicks.
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, opts.gain), t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
  osc.connect(g);
  g.connect(master!);
  osc.start(t0);
  osc.stop(t0 + opts.dur + 0.02);
}

// Sound recipes. Short (<0.5s); the master gain scales them. Gains are punchy so a
// click reads clearly ON TOP of the ambient music (which also ducks — see below).
const RECIPES: Record<SfxName, (ac: AudioContext) => void> = {
  tap: (ac) => {
    tone(ac, { freq: 1650, type: "triangle", dur: 0.045, gain: 0.28 });
    tone(ac, { freq: 2600, type: "sine", dur: 0.02, gain: 0.14 }); // tiny high tick for crispness
  },
  open: (ac) => tone(ac, { freq: 600, glideTo: 980, type: "sine", dur: 0.16, gain: 0.3 }),
  close: (ac) => tone(ac, { freq: 940, glideTo: 560, type: "sine", dur: 0.14, gain: 0.26 }),
  confirm: (ac) => {
    tone(ac, { freq: 660, type: "sine", dur: 0.14, gain: 0.34 });
    tone(ac, { freq: 880, type: "sine", dur: 0.24, gain: 0.32, delay: 0.09 });
  },
  select: (ac) => tone(ac, { freq: 2050, type: "sine", dur: 0.09, gain: 0.26 }),
  notify: (ac) => tone(ac, { freq: 1320, glideTo: 1560, type: "sine", dur: 0.13, gain: 0.3 }),
  achievement: (ac) => {
    tone(ac, { freq: 523, type: "triangle", dur: 0.12, gain: 0.34 });
    tone(ac, { freq: 659, type: "triangle", dur: 0.12, gain: 0.34, delay: 0.1 });
    tone(ac, { freq: 784, type: "triangle", dur: 0.3, gain: 0.36, delay: 0.2 });
  },
  error: (ac) => tone(ac, { freq: 200, glideTo: 150, type: "sine", dur: 0.16, gain: 0.3 }),
  delete: (ac) => tone(ac, { freq: 420, glideTo: 110, type: "sawtooth", dur: 0.22, gain: 0.26 }),
  welcome: (ac) => {
    tone(ac, { freq: 440, type: "sine", dur: 0.3, gain: 0.3 });
    tone(ac, { freq: 660, type: "sine", dur: 0.5, gain: 0.3, delay: 0.14 });
  },
};

/** Play a UI sound. No-op if disabled, unsupported, or throttled. Never throws. */
export function playSfx(name: SfxName): void {
  try {
    if (!sfxEnabled()) return;
    const now = performance.now();
    if (name === "tap" && now - lastPlay < 45) return; // throttle only the rapid tap
    lastPlay = now;
    const ac = ensure();
    if (!ac || !master) return;
    RECIPES[name]?.(ac);
    // Briefly duck the ambient music so meatier cues punch through (not the rapid tap,
    // which would make the music pump). The audio module listens for this.
    if (name !== "tap") {
      try {
        window.dispatchEvent(new CustomEvent("brain-sfx-duck"));
      } catch {
        /* no window — ignore */
      }
    }
  } catch {
    /* audio is non-critical */
  }
}
