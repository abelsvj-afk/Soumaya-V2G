import { sfxEnabled } from "./sfx.js";

/**
 * Soumaya's ship engine — real recordings, not synthesis. A jet startup
 * (`/ship-engine-start.mp3`) ignites and fades into a sustained engine loop
 * (`/ship-engine-loop.wav`). Only AUDIBLE when the camera is focused on her: the
 * caller feeds a 0..1 `level` (focus × motion) each frame, and the engine eases its
 * volume toward it — so you hear her thrusters when you're watching her fly, and
 * near-silence otherwise. Best-effort + gated by the interface-sounds setting.
 */
export interface EngineAudio {
  setLevel: (v: number) => void;
  dispose: () => void;
}

const MASTER = 0.9; // the engine can be prominent when you're right on her

export function makeEngineAudio(): EngineAudio {
  let startEl: HTMLAudioElement | null = null;
  let loopEl: HTMLAudioElement | null = null;
  let current = 0; // eased volume
  let target = 0;
  let ignited = false; // has the startup fired for this run
  let raf: number | null = null;
  let disposed = false;

  const ensure = () => {
    if (loopEl) return;
    try {
      startEl = new Audio("/ship-engine-start.mp3");
      startEl.preload = "auto";
      startEl.volume = 0;
      loopEl = new Audio("/ship-engine-loop.wav");
      loopEl.loop = true;
      loopEl.preload = "auto";
      loopEl.volume = 0;
    } catch {
      /* Audio unavailable */
    }
  };

  const frame = () => {
    if (disposed) return;
    // Ease current → target (fast attack on ignition, gentle release).
    const rate = target > current ? 0.12 : 0.05;
    current += (target - current) * rate;
    const on = sfxEnabled() && current > 0.02;
    if (on) {
      ensure();
      if (!ignited && startEl) {
        ignited = true;
        try {
          startEl.currentTime = 0;
          void startEl.play().catch(() => {});
        } catch {
          /* blocked until a gesture */
        }
      }
      if (loopEl) {
        if (loopEl.paused) void loopEl.play().catch(() => {});
        loopEl.volume = Math.min(1, current * MASTER);
      }
      if (startEl) startEl.volume = Math.min(1, current * MASTER * 0.9);
    } else {
      ignited = false;
      if (loopEl && !loopEl.paused) {
        loopEl.volume = 0;
        loopEl.pause();
      }
      if (startEl && !startEl.paused) startEl.pause();
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    setLevel: (v: number) => {
      target = Math.max(0, Math.min(1, v));
    },
    dispose: () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      try {
        loopEl?.pause();
        startEl?.pause();
      } catch {
        /* ignore */
      }
      loopEl = null;
      startEl = null;
    },
  };
}
