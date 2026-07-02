import { useEffect, useRef, useState } from "react";
import type { ChatMood } from "@brain/shared";

/**
 * Soumaya's eye — a living avatar for the chat. An almond eye that BLINKS on a
 * natural random rhythm, dilates while she's listening to the mic, drifts side to
 * side while she's thinking, and shifts iris colour with the emotional register of
 * her last reply (matching the galaxy's link palette: gold = joyful, green =
 * neutral, indigo = heavy). Pure SVG + CSS — no assets, no per-frame JS beyond a
 * blink timer.
 */
export type EyeState = "idle" | "listening" | "thinking";

/** Iris colour per mood — the same emotional palette the links use. */
const MOOD_COLOR: Record<ChatMood, string> = {
  happy: "#ffcd46", // warm gold
  excited: "#ffb246",
  warm: "#ffd98c",
  thoughtful: "#46f58c", // resting synapse green
  neutral: "#46f58c",
  concerned: "#7af9ff", // cool attentive cyan
  sad: "#9686ff", // heavy indigo
};

export function SoumayaEye({
  state = "idle",
  mood = "neutral",
  size = 30,
}: {
  state?: EyeState;
  mood?: ChatMood;
  size?: number;
}) {
  const [blink, setBlink] = useState(false);
  const timer = useRef<number | null>(null);

  // Natural blinking: a quick double-blink sometimes, on a 2.6–6.5s rhythm.
  useEffect(() => {
    let alive = true;
    const schedule = () => {
      const wait = 2600 + Math.random() * 3900;
      timer.current = window.setTimeout(() => {
        if (!alive) return;
        setBlink(true);
        window.setTimeout(() => {
          if (!alive) return;
          setBlink(false);
          if (Math.random() < 0.25) {
            window.setTimeout(() => alive && setBlink(true), 140);
            window.setTimeout(() => alive && setBlink(false), 280);
          }
        }, 130);
        schedule();
      }, wait);
    };
    schedule();
    return () => {
      alive = false;
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const color = MOOD_COLOR[mood] ?? MOOD_COLOR.neutral;
  const w = size;
  const h = Math.round(size * 0.62);

  return (
    <span
      className={`soumaya-eye ${state} ${blink ? "blink" : ""}`}
      style={{ width: w, height: h, ["--iris" as string]: color }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 62" width={w} height={h}>
        {/* Sclera (almond) */}
        <path
          className="eye-sclera"
          d="M2 31 Q 50 -12 98 31 Q 50 74 2 31 Z"
          fill="rgba(10,14,32,0.9)"
          stroke="rgba(140,170,255,0.45)"
          strokeWidth="2.5"
        />
        {/* Iris + pupil (drift while thinking, dilate while listening) */}
        <g className="eye-iris-group">
          <circle className="eye-iris" cx="50" cy="31" r="17" fill="var(--iris)" opacity="0.92" />
          <circle className="eye-pupil" cx="50" cy="31" r="8" fill="#060814" />
          <circle cx="44" cy="25" r="3.4" fill="rgba(255,255,255,0.85)" />
        </g>
        {/* Eyelid — scales down over the eye for the blink */}
        <path
          className="eye-lid"
          d="M2 31 Q 50 -12 98 31 Q 50 74 2 31 Z"
          fill="#0b0f24"
        />
      </svg>
    </span>
  );
}
