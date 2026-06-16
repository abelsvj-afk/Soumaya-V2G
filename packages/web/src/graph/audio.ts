/**
 * Generated ambient "deep space" pad — no audio file, no loop (so it never seams).
 * A detuned low chord through a slowly-sweeping low-pass filter with gentle
 * amplitude shimmer. Created lazily on first user toggle (mobile blocks autoplay).
 */
export interface AmbientAudio {
  toggle: () => boolean; // returns new playing state
  readonly playing: boolean;
}

export function makeAmbientAudio(): AmbientAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let playing = false;

  const build = () => {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 600;
    filter.Q.value = 0.7;
    filter.connect(master);

    // Detuned low chord (A2 / E3 / A3 / C#4 / E4) — warm, slightly beating.
    for (const f of [55, 82.5, 110, 138.6, 164.8]) {
      for (const det of [-4, 4]) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.value = 0.1;
        o.connect(g);
        g.connect(filter);
        o.start();
      }
    }

    // Slow filter sweep for movement (the "infinite, no obvious loop" feel).
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.025;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 340;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    // Gentle breathing on the master volume.
    const amp = ctx.createOscillator();
    amp.frequency.value = 0.06;
    const ampGain = ctx.createGain();
    ampGain.gain.value = 0.02;
    amp.connect(ampGain);
    ampGain.connect(master.gain);
    amp.start();
  };

  const toggle = (): boolean => {
    if (!ctx) build();
    if (!ctx || !master) return false;
    if (ctx.state === "suspended") void ctx.resume();
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
    if (playing) {
      master.gain.linearRampToValueAtTime(0.0001, t + 0.8);
      playing = false;
    } else {
      master.gain.linearRampToValueAtTime(0.22, t + 1.4);
      playing = true;
    }
    return playing;
  };

  return {
    toggle,
    get playing() {
      return playing;
    },
  };
}
