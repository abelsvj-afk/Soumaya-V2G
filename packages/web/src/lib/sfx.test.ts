import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/** Minimal fake Web Audio graph — happy-dom has no real AudioContext. Just
 *  enough surface for sfx.ts's tone()/noiseSweep() to run without throwing,
 *  while letting tests count how many oscillators/buffer-sources actually
 *  got created (a proxy for "did a sound actually fire"). */
class FakeParam {
  value = 0;
  setValueAtTime() { return this; }
  exponentialRampToValueAtTime() { return this; }
  linearRampToValueAtTime() { return this; }
}
class FakeNode {
  connect() { return this; }
}
class FakeOscillator extends FakeNode {
  type = "sine";
  frequency = new FakeParam();
  start() {}
  stop() {}
}
class FakeGain extends FakeNode {
  gain = new FakeParam();
}
class FakeBiquad extends FakeNode {
  type = "lowpass";
  Q = new FakeParam();
  frequency = new FakeParam();
}
class FakeBufferSource extends FakeNode {
  buffer: unknown = null;
  start() {}
  stop() {}
}

let oscillatorCount = 0;
let bufferSourceCount = 0;

class FakeAudioContext {
  currentTime = 0;
  sampleRate = 44100;
  state = "running";
  destination = new FakeNode();
  createOscillator() { oscillatorCount++; return new FakeOscillator(); }
  createGain() { return new FakeGain(); }
  createBiquadFilter() { return new FakeBiquad(); }
  createBufferSource() { bufferSourceCount++; return new FakeBufferSource(); }
  createBuffer(_channels: number, length: number) {
    return { getChannelData: () => new Float32Array(length) };
  }
  resume() { return Promise.resolve(); }
}

beforeEach(() => {
  vi.resetModules();
  oscillatorCount = 0;
  bufferSourceCount = 0;
  localStorage.clear();
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
});

afterEach(() => {
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

describe("sfx — expanded palette", () => {
  it("plays the new complete/milestone/chime sounds without throwing", async () => {
    const { playSfx } = await import("./sfx.js");
    expect(() => playSfx("complete")).not.toThrow();
    expect(() => playSfx("milestone")).not.toThrow();
    expect(() => playSfx("chime")).not.toThrow();
    expect(oscillatorCount).toBeGreaterThan(0);
  });
});

describe("sfx — the tap throttle no longer gets polluted by other sounds", () => {
  it("still plays a tap immediately after a non-tap sound", async () => {
    const { playSfx } = await import("./sfx.js");
    playSfx("notify");
    const before = oscillatorCount;
    playSfx("tap"); // used to be throttled by notify's lastPlay write
    expect(oscillatorCount).toBeGreaterThan(before);
  });

  it("still throttles two rapid taps", async () => {
    const { playSfx } = await import("./sfx.js");
    playSfx("tap");
    const afterFirst = oscillatorCount;
    playSfx("tap"); // immediately again — should be throttled
    expect(oscillatorCount).toBe(afterFirst);
  });
});
