/**
 * Generative "interstellar" space score — no audio file, no loop seam, infinite.
 *
 * An Interstellar-inspired engine built entirely from Web Audio primitives (zero
 * dependencies, nothing copyrighted): a stack of church-organ-like voices holding
 * slow, swelling chords through a sweeping filter, a high shimmer pad, and a gentle
 * rising arpeggio motif. A scheduler drifts the harmony through a small set of
 * related chords every ~16s and breathes big dynamic swells, so it evolves forever
 * and never obviously repeats. Created lazily on first user toggle (mobile blocks
 * autoplay until a gesture).
 */
export interface AmbientAudio {
  toggle: () => boolean; // returns new playing state
  readonly playing: boolean;
}

// Chord progression as semitone offsets from a low root, voiced wide like an
// organ (root, fifth, octave, tenth). i — VI — III — VII feel: suspended, hopeful,
// a little melancholy. Drifts slowly so the harmony is always moving but never busy.
const ROOT_HZ = 55; // A1
const CHORDS: number[][] = [
  [0, 7, 12, 16], // i      (A)
  [-4, 3, 8, 12], // VI     (F)
  [3, 10, 15, 19], // III    (C)
  [-2, 5, 10, 14], // VII    (G)
];
// Arpeggio motif (scale degrees, semitones) — a slow rising figure over the chord.
const MOTIF = [0, 7, 12, 16, 19, 12];

const hzAt = (semis: number): number => ROOT_HZ * Math.pow(2, semis / 12);

export function makeAmbientAudio(): AmbientAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let playing = false;
  let schedTimer: number | null = null;
  let chordIndex = 0;

  // Long-lived nodes built once.
  let padFilter: BiquadFilterNode | null = null;
  let padGains: GainNode[] = []; // one per organ voice (we retune these)
  let padOscs: OscillatorNode[] = [];
  let arpGain: GainNode | null = null;

  const build = () => {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    // latencyHint:"playback" asks the browser for a LARGER audio buffer. We don't
    // care about latency for ambient music, and the bigger buffer is the single
    // biggest fix for the "radio static / crackle" on phones (it's buffer underruns
    // when the audio thread can't keep up). Fall back gracefully if unsupported.
    try {
      ctx = new AC({ latencyHint: "playback" });
    } catch {
      ctx = new AC();
    }
    master = ctx.createGain();
    master.gain.value = 0.0001;

    // Brick-wall limiter on the very end: clipping (samples past ±1.0) is itself a
    // major source of crackle/distortion on mobile. A fast, high-ratio compressor
    // catches swell peaks so the output can never clip.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    master.connect(limiter);
    limiter.connect(ctx.destination);

    // Cathedral tail via a feedback delay — but TAMED: a low-pass inside the loop
    // and modest feedback so it can't resonate/build into a clipping howl.
    const delay = ctx.createDelay(2.0);
    delay.delayTime.value = 0.45;
    const fbCut = ctx.createBiquadFilter();
    fbCut.type = "lowpass";
    fbCut.frequency.value = 1600;
    const fb = ctx.createGain();
    fb.gain.value = 0.26;
    const wet = ctx.createGain();
    wet.gain.value = 0.2;
    delay.connect(fbCut);
    fbCut.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(master);

    // --- Organ pad: a sweeping low-pass over a stack of detuned voices. ---
    padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 700;
    padFilter.Q.value = 0.8;
    padFilter.connect(master);
    padFilter.connect(delay);

    // Four organ voices (the chord). Each voice = two slightly detuned oscillators
    // for warmth. We retune their frequency on each chord change.
    const initial = CHORDS[0]!;
    for (let v = 0; v < 4; v++) {
      const g = ctx.createGain();
      g.gain.value = 0.09;
      g.connect(padFilter);
      padGains.push(g);
      for (const det of [-5, 5]) {
        const o = ctx.createOscillator();
        // Mix triangle + sine across voices for an organ-ish, woody timbre.
        o.type = v % 2 === 0 ? "triangle" : "sine";
        o.frequency.value = hzAt(initial[v]!);
        o.detune.value = det;
        o.connect(g);
        o.start();
        padOscs.push(o);
      }
    }

    // --- High shimmer pad: airy octaves up high, very quiet, slow tremolo. ---
    const shimmer = ctx.createGain();
    shimmer.gain.value = 0.014;
    shimmer.connect(master);
    shimmer.connect(delay);
    for (const semis of [24, 31]) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = hzAt(semis);
      o.detune.value = (Math.random() - 0.5) * 8;
      o.connect(shimmer);
      o.start();
    }

    // --- Arpeggio voice (the rising motif), played by the scheduler. ---
    arpGain = ctx.createGain();
    arpGain.gain.value = 0.0;
    arpGain.connect(padFilter);

    // Slow filter sweep for constant movement (the "infinite, no obvious loop" feel).
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.018;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 420;
    lfo.connect(lfoGain);
    lfoGain.connect(padFilter.frequency);
    lfo.start();

    // Big slow dynamic swell on the master — the cinematic "breath".
    const swell = ctx.createOscillator();
    swell.frequency.value = 0.025; // ~40s period
    const swellGain = ctx.createGain();
    swellGain.gain.value = 0.05;
    swell.connect(swellGain);
    swellGain.connect(master.gain);
    swell.start();
  };

  // Pluck one note of the arpeggio motif (soft, bell-like) into the pad filter.
  const pluck = (semis: number, when: number, dur: number) => {
    if (!ctx || !arpGain) return;
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = hzAt(semis);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.05, when + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g);
    g.connect(arpGain);
    o.start(when);
    o.stop(when + dur + 0.05);
  };

  // The harmony/melody scheduler. Runs every bar (~8s): retune the organ to the
  // next chord (smooth glide) and lay the rising motif over it an octave up.
  const BAR = 8; // seconds per chord
  const advance = () => {
    if (!ctx) return;
    const t = ctx.currentTime;
    const chord = CHORDS[chordIndex % CHORDS.length]!;
    chordIndex++;

    // Glide each organ voice to the new chord tone (portamento = liquid harmony).
    for (let v = 0; v < padGains.length; v++) {
      const target = hzAt(chord[v]!);
      // Both detuned oscillators for this voice live at padOscs[v*2], [v*2+1].
      for (const oi of [v * 2, v * 2 + 1]) {
        const o = padOscs[oi];
        if (o) o.frequency.exponentialRampToValueAtTime(target, t + 2.2);
      }
    }

    // Lay the motif across the bar, transposed onto the current chord's root.
    const base = chord[0]! + 12; // an octave above the bass for the melody
    const step = BAR / MOTIF.length;
    for (let i = 0; i < MOTIF.length; i++) {
      pluck(base + MOTIF[i]!, t + i * step, step * 1.6);
    }
  };

  const toggle = (): boolean => {
    if (!ctx) build();
    if (!ctx || !master) return false;
    if (ctx.state === "suspended") void ctx.resume();
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
    if (playing) {
      master.gain.linearRampToValueAtTime(0.0001, t + 1.0);
      if (schedTimer != null) {
        clearInterval(schedTimer);
        schedTimer = null;
      }
      playing = false;
    } else {
      master.gain.linearRampToValueAtTime(0.34, t + 2.5); // slow cinematic fade-in
      advance(); // start the harmony immediately
      schedTimer = window.setInterval(advance, BAR * 1000);
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
