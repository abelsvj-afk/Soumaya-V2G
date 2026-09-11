import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/** Minimal fake Web Audio graph, same style as sfx.test.ts — happy-dom has no real
 *  AudioContext, so this is just enough surface for music.ts to run for real without
 *  throwing, while letting tests observe what actually got wired up. */
class FakeParam {
  value = 0;
  setValueAtTime = vi.fn().mockReturnThis();
  linearRampToValueAtTime = vi.fn().mockReturnThis();
  cancelScheduledValues = vi.fn().mockReturnThis();
}
class FakeNode {
  connected: unknown[] = [];
  connect(target: unknown) {
    this.connected.push(target);
    return target;
  }
  disconnect = vi.fn();
}
class FakeGain extends FakeNode {
  gain = new FakeParam();
}
class FakeBufferSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
  start = vi.fn();
  stop = vi.fn();
}

let bufferSources: FakeBufferSource[] = [];
let gains: FakeGain[] = [];

class FakeAudioContext {
  currentTime = 0;
  sampleRate = 44100;
  state = "running";
  destination = new FakeNode();
  createGain() {
    const g = new FakeGain();
    gains.push(g);
    return g;
  }
  createBufferSource() {
    const s = new FakeBufferSource();
    bufferSources.push(s);
    return s;
  }
  decodeAudioData(_bytes: ArrayBuffer) {
    return Promise.resolve({ duration: 1 } as unknown as AudioBuffer);
  }
  resume() {
    return Promise.resolve();
  }
}

beforeEach(() => {
  vi.resetModules();
  bufferSources = [];
  gains = [];
  localStorage.clear();
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
  );
});

afterEach(() => {
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  vi.unstubAllGlobals();
});

describe("music — preferences", () => {
  it("defaults to enabled, persists a toggle", async () => {
    const { musicEnabled, setMusicEnabled } = await import("./music.js");
    expect(musicEnabled()).toBe(true);
    setMusicEnabled(false);
    expect(musicEnabled()).toBe(false);
    setMusicEnabled(true);
    expect(musicEnabled()).toBe(true);
  });

  it("defaults to a sane volume, clamps to [0,1], persists", async () => {
    const { musicVolume, setMusicVolume } = await import("./music.js");
    expect(musicVolume()).toBeGreaterThan(0);
    expect(musicVolume()).toBeLessThanOrEqual(1);
    setMusicVolume(2); // out of range
    expect(musicVolume()).toBe(1);
    setMusicVolume(-1);
    expect(musicVolume()).toBe(0);
  });
});

describe("music — playback", () => {
  it("starts a looping buffer source through a gain node on the shared context", async () => {
    const { startMusicLoop } = await import("./music.js");
    await startMusicLoop("/ambient-loop.mp3");
    expect(bufferSources).toHaveLength(1);
    expect(bufferSources[0]?.loop).toBe(true);
    expect(bufferSources[0]?.start).toHaveBeenCalled();
    // sfx.ts lazily creates its own master gain the first time the shared context is
    // touched, so at least one gain exists; music's own gain is whichever one the
    // buffer source actually connects to.
    expect(gains.length).toBeGreaterThan(0);
    const musicGain = gains.find((g) => bufferSources[0]?.connected.includes(g));
    expect(musicGain).toBeDefined();
  });

  it("does not start a second source if the same track is already playing", async () => {
    const { startMusicLoop } = await import("./music.js");
    await startMusicLoop("/ambient-loop.mp3");
    await startMusicLoop("/ambient-loop.mp3");
    expect(bufferSources).toHaveLength(1);
  });

  it("stopMusicLoop tears down the source so it can be started again", async () => {
    const { startMusicLoop, stopMusicLoop } = await import("./music.js");
    await startMusicLoop("/ambient-loop.mp3");
    stopMusicLoop();
    expect(bufferSources[0]?.stop).toHaveBeenCalled();
    await startMusicLoop("/ambient-loop.mp3");
    expect(bufferSources).toHaveLength(2);
  });

  it("never starts playback when disabled", async () => {
    const { setMusicEnabled, startMusicLoop } = await import("./music.js");
    setMusicEnabled(false);
    await startMusicLoop("/ambient-loop.mp3");
    expect(bufferSources).toHaveLength(0);
  });

  it("is silent, not throwing, if fetch/decoding fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const { startMusicLoop } = await import("./music.js");
    await expect(startMusicLoop("/ambient-loop.mp3")).resolves.toBeUndefined();
    expect(bufferSources).toHaveLength(0);
  });

  it("brain-sfx-duck briefly lowers then restores the music gain", async () => {
    const { startMusicLoop } = await import("./music.js");
    await startMusicLoop("/ambient-loop.mp3");
    window.dispatchEvent(new Event("brain-sfx-duck"));
    const gain = gains.at(-1)?.gain; // music's own gain node — the last one created
    expect(gain?.linearRampToValueAtTime).toHaveBeenCalled();
  });
});

describe("music — track switching (the old 3D galaxy's 3 tracks, restored)", () => {
  it("starts on the first track", async () => {
    const { currentTrackIndex, currentTrackUrl, MUSIC_TRACKS } = await import("./music.js");
    expect(currentTrackIndex()).toBe(0);
    expect(currentTrackUrl()).toBe(MUSIC_TRACKS[0]);
  });

  it("nextTrack cycles through all 3 tracks and wraps back to the first", async () => {
    const { nextTrack, currentTrackIndex, MUSIC_TRACKS } = await import("./music.js");
    expect(MUSIC_TRACKS).toHaveLength(3);
    await nextTrack();
    expect(currentTrackIndex()).toBe(1);
    await nextTrack();
    expect(currentTrackIndex()).toBe(2);
    await nextTrack();
    expect(currentTrackIndex()).toBe(0);
  });

  it("nextTrack actually starts playing the new track, replacing the old one", async () => {
    const { nextTrack, playCurrentTrack } = await import("./music.js");
    await playCurrentTrack();
    expect(bufferSources).toHaveLength(1);
    await nextTrack();
    // The old source is stopped and a fresh one for the new track is started — never layered.
    expect(bufferSources).toHaveLength(2);
    expect(bufferSources[0]?.stop).toHaveBeenCalled();
  });

  it("the track choice persists across a reload (a fresh module import)", async () => {
    const first = await import("./music.js");
    await first.nextTrack();
    expect(first.currentTrackIndex()).toBe(1);
    vi.resetModules();
    const second = await import("./music.js");
    expect(second.currentTrackIndex()).toBe(1);
  });
});
