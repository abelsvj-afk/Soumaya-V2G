/**
 * Ambient space soundtrack — a small PLAYLIST of bundled loops. Created lazily on
 * the first user toggle (mobile blocks autoplay until a gesture). Single element,
 * crossfaded on track change so switching isn't abrupt. Best-effort: if a file
 * can't load/play it simply no-ops.
 *
 * Tracks are unlockable over time; for now the whole list is available in every
 * brain. On track change we emit a `brain-music-track` window event carrying the
 * title + position so the UI can pop a "now playing" cue and show the count.
 */
export interface Track {
  id: string;
  title: string;
  src: string;
}

/** The playlist. Add to this as new loops are bundled into /public. */
export const TRACKS: Track[] = [
  { id: "deep-space", title: "Deep Space", src: "/ambient-loop.mp3" },
  { id: "slow-tide", title: "Slow Tide", src: "/slow-tide.mp3" },
  { id: "interstellar", title: "Interstellar", src: "/interstellar.mp3" },
];

export interface MusicState {
  playing: boolean;
  index: number;
  title: string;
  total: number;
}

export interface AmbientAudio {
  toggle: () => boolean; // returns new playing state
  /** Advance to the next track (wraps). Starts playback if paused. */
  next: () => void;
  /** Jump to a specific track by index (wraps). Starts playback if paused. */
  playTrack: (index: number) => void;
  readonly playing: boolean;
  readonly index: number;
  readonly title: string;
  readonly total: number;
}

const TARGET_VOLUME = 0.5; // leaves headroom so UI sounds sit clearly on top
const KEY_INDEX = "music.track"; // remember the last track across sessions

/** Broadcast the current track so the UI can show a now-playing cue + count. */
function emitTrack(state: MusicState) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<MusicState>("brain-music-track", { detail: state }));
  }
}

export function makeAmbientAudio(): AmbientAudio {
  let el: HTMLAudioElement | null = null;
  let playing = false;
  let fadeTimer: number | null = null;
  let index = 0;
  try {
    const saved = Number(localStorage.getItem(KEY_INDEX));
    if (Number.isInteger(saved) && saved >= 0 && saved < TRACKS.length) index = saved;
  } catch {
    /* ignore */
  }

  const track = () => TRACKS[index]!;
  const state = (): MusicState => ({ playing, index, title: track().title, total: TRACKS.length });

  const ensure = (): HTMLAudioElement => {
    if (el) return el;
    el = new Audio(track().src);
    el.loop = true; // infinite loop
    el.preload = "auto";
    el.volume = 0;
    return el;
  };

  const fadeTo = (target: number, ms: number, onDone?: () => void) => {
    const a = el;
    if (!a) return;
    if (fadeTimer) window.clearInterval(fadeTimer);
    const start = a.volume;
    const steps = Math.max(1, Math.round(ms / 50));
    let i = 0;
    fadeTimer = window.setInterval(() => {
      i++;
      a.volume = Math.max(0, Math.min(1, start + (target - start) * (i / steps)));
      if (i >= steps) {
        if (fadeTimer) window.clearInterval(fadeTimer);
        fadeTimer = null;
        onDone?.();
      }
    }, 50);
  };

  const toggle = (): boolean => {
    const a = ensure();
    if (playing) {
      fadeTo(0, 800, () => a.pause());
      playing = false;
    } else {
      void a.play().catch(() => {}); // gesture-driven; ignore autoplay rejections
      fadeTo(TARGET_VOLUME, 1500);
      playing = true;
    }
    emitTrack(state());
    return playing;
  };

  /** Load a track into the single element, crossfading out then in. */
  const loadTrack = (i: number) => {
    index = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length;
    try {
      localStorage.setItem(KEY_INDEX, String(index));
    } catch {
      /* ignore */
    }
    const swap = () => {
      const a = ensure();
      a.src = track().src;
      a.currentTime = 0;
      if (playing) {
        void a.play().catch(() => {});
        fadeTo(TARGET_VOLUME, 900);
      }
      emitTrack(state());
    };
    if (el && playing) {
      fadeTo(0, 350, swap); // fade the old one down, then swap + fade up
    } else {
      swap();
    }
  };

  const next = () => {
    if (!playing) {
      // If paused, "next" both advances and starts playing (feels like skip).
      loadTrack(index + 1);
      toggle();
    } else {
      loadTrack(index + 1);
    }
  };
  const playTrack = (i: number) => {
    loadTrack(i);
    if (!playing) toggle();
  };

  // Sidechain duck: when a UI sound fires, dip the music for ~300ms so the cue
  // punches through, then ramp back. Ignored while paused/fading out.
  let duckTimer: number | null = null;
  const onDuck = () => {
    const a = el;
    if (!a || !playing) return;
    if (fadeTimer) return; // don't fight an in-progress fade in/out
    a.volume = Math.max(0, TARGET_VOLUME * 0.4);
    if (duckTimer) window.clearTimeout(duckTimer);
    duckTimer = window.setTimeout(() => {
      if (el && playing && !fadeTimer) fadeTo(TARGET_VOLUME, 280);
    }, 120);
  };
  if (typeof window !== "undefined") window.addEventListener("brain-sfx-duck", onDuck);

  // Create the element up front so the (large) file buffers before the first
  // toggle — avoids the "music takes a while to start" lag. Loading without
  // playing is allowed on mobile (no gesture needed to preload).
  ensure();

  return {
    toggle,
    next,
    playTrack,
    get playing() {
      return playing;
    },
    get index() {
      return index;
    },
    get title() {
      return track().title;
    },
    get total() {
      return TRACKS.length;
    },
  };
}
