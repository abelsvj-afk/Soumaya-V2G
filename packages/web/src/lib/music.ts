/**
 * Background music loop — a small sibling to sfx.ts's pattern (persisted enable/volume,
 * shares its AudioContext) rather than a second, disconnected audio system. Plays a single
 * decoded AudioBuffer through a gapless `AudioBufferSourceNode` (loop: true) — the seamless
 * kind of loop, not an HTMLAudioElement with an audible seam at the repeat point.
 *
 * `"brain-sfx-duck"` (dispatched by sfx.ts on every non-tap SFX) briefly lowers the music
 * so a meatier cue punches through — sfx.ts's own comment already promised "the audio
 * module listens for this"; the module it meant was deleted with the 3D galaxy, so this
 * restores that behavior for the Overworld's music instead of leaving the promise dangling.
 */
import { audioContext } from "./sfx.js";
import { prefersReducedMotion } from "./motion.js";

const ENABLED_KEY = "music.enabled";
const VOLUME_KEY = "music.volume";
const TRACK_INDEX_KEY = "music.trackIndex";
const DEFAULT_VOLUME = 0.35;

/** The 3 tracks the old 3D galaxy let a pilot switch between — same files, same order,
 *  just given an actual switcher here instead of only ever playing one fixed loop. */
export const MUSIC_TRACKS = ["/ambient-loop.mp3", "/interstellar.mp3", "/slow-tide.mp3"] as const;

export function currentTrackIndex(): number {
  try {
    const v = parseInt(localStorage.getItem(TRACK_INDEX_KEY) ?? "0", 10);
    return Number.isFinite(v) && v >= 0 && v < MUSIC_TRACKS.length ? v : 0;
  } catch {
    return 0;
  }
}

export function currentTrackUrl(): string {
  return MUSIC_TRACKS[currentTrackIndex()] ?? MUSIC_TRACKS[0];
}

/** Starts (or resumes) whichever track is currently selected. */
export async function playCurrentTrack(): Promise<void> {
  await startMusicLoop(currentTrackUrl());
}

/** Switches to the next track in the list (wrapping around) and starts playing it
 *  immediately — startMusicLoop already replaces rather than layers when the url changes. */
export async function nextTrack(): Promise<void> {
  const next = (currentTrackIndex() + 1) % MUSIC_TRACKS.length;
  try {
    localStorage.setItem(TRACK_INDEX_KEY, String(next));
  } catch {
    /* ignore */
  }
  await startMusicLoop(MUSIC_TRACKS[next] ?? MUSIC_TRACKS[0]);
}

let musicGain: GainNode | null = null;
let source: AudioBufferSourceNode | null = null;
let currentUrl: string | null = null;
const bufferCache = new Map<string, AudioBuffer>();

export function musicEnabled(): boolean {
  try {
    const v = localStorage.getItem(ENABLED_KEY);
    if (v === "1") return true;
    if (v === "0") return false;
    // Same convention as sfx.ts: default on, but off if reduced motion is asked for.
    return !prefersReducedMotion();
  } catch {
    return true;
  }
}

export function setMusicEnabled(on: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (on) {
    if (currentUrl) void startMusicLoop(currentUrl);
  } else {
    stopMusicLoop();
  }
}

export function musicVolume(): number {
  try {
    const v = parseFloat(localStorage.getItem(VOLUME_KEY) ?? "");
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

export function setMusicVolume(v: number): void {
  try {
    localStorage.setItem(VOLUME_KEY, String(Math.max(0, Math.min(1, v))));
  } catch {
    /* ignore */
  }
  if (musicGain) musicGain.gain.value = musicVolume();
}

async function loadBuffer(ac: AudioContext, url: string): Promise<AudioBuffer | null> {
  const cached = bufferCache.get(url);
  if (cached) return cached;
  try {
    const res = await fetch(url);
    const bytes = await res.arrayBuffer();
    const buffer = await ac.decodeAudioData(bytes);
    bufferCache.set(url, buffer);
    return buffer;
  } catch {
    return null; // missing file / unsupported format — never crash the world over music
  }
}

/** Starts (or is a no-op if already playing) a gapless loop of `url`. Safe to call
 *  repeatedly/speculatively — disabled-by-preference and already-playing both short-circuit. */
export async function startMusicLoop(url: string): Promise<void> {
  if (!musicEnabled()) return;
  // Compared BEFORE reassigning currentUrl below — comparing against the value already
  // assigned to itself is always true, which silently broke switching tracks entirely.
  if (source && currentUrl === url) return; // already playing this exact track
  currentUrl = url;
  const ac = audioContext();
  if (!ac) return;
  const buffer = await loadBuffer(ac, url);
  if (!buffer) return;
  if (source) stopMusicLoop(); // switching tracks — replace, don't layer
  musicGain = ac.createGain();
  musicGain.gain.value = musicVolume();
  musicGain.connect(ac.destination);
  source = ac.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(musicGain);
  source.start(0);
  window.addEventListener("brain-sfx-duck", handleDuck);
}

export function stopMusicLoop(): void {
  try {
    source?.stop();
  } catch {
    /* already stopped */
  }
  source?.disconnect();
  source = null;
  musicGain?.disconnect();
  musicGain = null;
  window.removeEventListener("brain-sfx-duck", handleDuck);
}

function handleDuck(): void {
  if (!musicGain) return;
  const ac = audioContext();
  if (!ac) return;
  const now = ac.currentTime;
  const target = musicVolume();
  musicGain.gain.cancelScheduledValues(now);
  musicGain.gain.setValueAtTime(musicGain.gain.value, now);
  musicGain.gain.linearRampToValueAtTime(target * 0.4, now + 0.05);
  musicGain.gain.linearRampToValueAtTime(target, now + 0.6);
}
