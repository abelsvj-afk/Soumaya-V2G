/**
 * Ambient space soundtrack — plays the bundled loop file (`/ambient-loop.mp3`)
 * infinitely. Created lazily on the first user toggle (mobile blocks autoplay
 * until a gesture). Fades in/out so toggling isn't abrupt. Best-effort: if the
 * file can't load/play it simply no-ops.
 */
export interface AmbientAudio {
  toggle: () => boolean; // returns new playing state
  readonly playing: boolean;
}

const TARGET_VOLUME = 0.7;

export function makeAmbientAudio(): AmbientAudio {
  let el: HTMLAudioElement | null = null;
  let playing = false;
  let fadeTimer: number | null = null;

  const ensure = (): HTMLAudioElement => {
    if (el) return el;
    el = new Audio("/ambient-loop.mp3");
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
    return playing;
  };

  // Create the element up front so the (large) file buffers before the first
  // toggle — avoids the "music takes a while to start" lag. Loading without
  // playing is allowed on mobile (no gesture needed to preload).
  ensure();

  return {
    toggle,
    get playing() {
      return playing;
    },
  };
}
