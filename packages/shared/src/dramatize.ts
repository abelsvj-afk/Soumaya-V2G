/**
 * The "dramatization filter": a tiny, dependency-free affect model so Soumaya
 * reads a topic's emotional weather and *delivers* her words to match — never a
 * flat robot monotone. It runs fully offline (no API): the server derives a tone
 * from the memories in play + the words she's about to say, and the client maps
 * that tone onto speech-synthesis prosody (rate/pitch/pauses).
 */

/** A coarse emotional posture, used to pick delivery + a spoken lead-in. */
export type Mood =
  | "joyful"
  | "tender"
  | "playful"
  | "calm"
  | "neutral"
  | "reflective"
  | "anxious"
  | "somber";

export interface EmotionalTone {
  /** -1 (heavy/negative) .. 1 (bright/positive). */
  valence: number;
  /** 0 (flat) .. 1 (charged) — how much the delivery should swing. */
  intensity: number;
  /** Human-readable posture derived from valence + intensity. */
  mood: Mood;
}

export const NEUTRAL_TONE: EmotionalTone = { valence: 0, intensity: 0.25, mood: "neutral" };

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

// Small, hand-tuned affect lexicon. Not a sentiment library — just enough signal
// to color delivery. Weights are rough valence contributions.
const POSITIVE = [
  "love", "loved", "joy", "happy", "grateful", "thankful", "excited", "hope",
  "hopeful", "proud", "win", "won", "breakthrough", "beautiful", "wonderful",
  "delight", "celebrate", "brilliant", "amazing", "great", "good", "calm",
  "peace", "safe", "warm", "light", "bright", "free",
];
const NEGATIVE = [
  "loss", "lost", "grief", "sad", "sadness", "afraid", "fear", "anxious",
  "anxiety", "worried", "worry", "angry", "anger", "hurt", "pain", "painful",
  "tired", "exhausted", "alone", "lonely", "regret", "guilt", "ashamed",
  "death", "died", "dark", "heavy", "broken", "fail", "failed", "struggle",
];

const has = (text: string, word: string) =>
  new RegExp(`\\b${word}\\b`, "i").test(text);

/**
 * Lightweight sentiment from raw text: keyword valence plus punctuation/caps
 * energy for intensity. Returns valence in -1..1 and intensity in 0..1.
 */
export function analyzeSentiment(text: string): { valence: number; intensity: number } {
  if (!text) return { valence: 0, intensity: 0 };
  let score = 0;
  let hits = 0;
  for (const w of POSITIVE) if (has(text, w)) { score += 1; hits++; }
  for (const w of NEGATIVE) if (has(text, w)) { score -= 1; hits++; }
  const words = Math.max(1, text.split(/\s+/).length);
  const valence = clamp(score / Math.sqrt(words), -1, 1);

  const exclaim = (text.match(/!/g) ?? []).length;
  const question = (text.match(/\?/g) ?? []).length;
  const capsRun = (text.match(/\b[A-Z]{3,}\b/g) ?? []).length;
  const lexical = hits / words; // how emotionally loaded the wording is
  const intensity = clamp(0.2 + lexical * 2 + exclaim * 0.15 + capsRun * 0.1 + question * 0.05, 0, 1);
  return { valence, intensity };
}

/** Map a valence/intensity point onto a named mood. */
export function moodFromTone(valence: number, intensity: number): Mood {
  if (intensity < 0.2) return "neutral";
  if (valence >= 0.45) return intensity > 0.6 ? "joyful" : "calm";
  if (valence >= 0.15) return intensity > 0.55 ? "playful" : "tender";
  if (valence <= -0.45) return intensity > 0.6 ? "somber" : "reflective";
  if (valence <= -0.15) return intensity > 0.55 ? "anxious" : "reflective";
  return intensity > 0.6 ? "playful" : "neutral";
}

/**
 * Blend an emotional-weight signal (e.g. averaged from the memories in play,
 * -1..1) with the sentiment of the words being spoken into one delivery tone.
 * The memories anchor *what it's about*; the text captures *how it's phrased*.
 */
export function toneFrom(text: string, emotionalWeight?: number): EmotionalTone {
  const s = analyzeSentiment(text);
  const ew = emotionalWeight ?? 0;
  const valence = clamp(0.6 * ew + 0.4 * s.valence, -1, 1);
  const intensity = clamp(Math.max(s.intensity, Math.abs(ew) * 0.7), 0, 1);
  return { valence, intensity, mood: moodFromTone(valence, intensity) };
}

/** Speech-synthesis prosody for a tone. rate/pitch are SpeechSynthesis units. */
export function prosodyFor(tone: EmotionalTone): { rate: number; pitch: number; volume: number } {
  // Base: a touch slower than default for a warm, human cadence.
  let rate = 0.96;
  let pitch = 1.0;
  // Brighter feelings lift pitch + tempo; heavier ones slow and lower it.
  rate += tone.valence * 0.12 + tone.intensity * 0.06;
  pitch += tone.valence * 0.18;
  switch (tone.mood) {
    case "joyful": rate += 0.06; pitch += 0.08; break;
    case "playful": rate += 0.04; pitch += 0.06; break;
    case "somber": rate -= 0.14; pitch -= 0.06; break;
    case "reflective": rate -= 0.08; break;
    case "anxious": rate += 0.05; pitch += 0.04; break;
    case "tender": rate -= 0.04; break;
    default: break;
  }
  return {
    rate: clamp(rate, 0.7, 1.25),
    pitch: clamp(pitch, 0.7, 1.4),
    volume: 1,
  };
}
