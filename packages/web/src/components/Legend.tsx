import {
  NODE_TYPES,
  NODE_TYPE_LABEL,
  CELESTIAL_CLASSES,
  CELESTIAL_ICON,
  CELESTIAL_LABEL,
  CELESTIAL_MEANING,
  SPECIAL_COLORS,
  EMOTION_COLORS,
  COGNITIVE_KINDS,
  COGNITIVE_META,
  type NodeType,
} from "@brain/shared";
import { TYPE_COLORS } from "../graph/theme.js";
import { FLEET } from "../graph/fleet.js";

/**
 * The Living Legend — a glanceable visual key to the galaxy's language, so you
 * can READ your brain intuitively instead of memorizing the Help menu. Every row
 * is DERIVED from the same runtime constants the galaxy actually draws from
 * (theme colors, celestial classes, the emotion palette, the fleet roster), so
 * it can never drift out of sync — add a memory type or a celestial class and it
 * appears here automatically.
 */

function Swatch({ color, ring }: { color: string; ring?: boolean }) {
  return (
    <span
      className="legend-swatch"
      style={{ background: color, boxShadow: ring ? `0 0 8px ${color}` : undefined }}
    />
  );
}

const TYPE_MEANING: Record<NodeType, string> = {
  person: "someone in your life",
  project: "an effort with an outcome",
  decision: "a choice + its rationale",
  company: "an org, team, or institution",
  meeting: "a conversation at a point in time",
  daily: "a journal note or fleeting thought",
  knowledge: "a fact or learning worth keeping",
  concept: "an abstract idea or theme",
  other: "anything that fits nowhere else",
  moc: "a constellation hub (Map of Content)",
};

export function Legend({ onClose }: { onClose: () => void }) {
  return (
    <div className="legend-overlay" role="dialog" aria-label="Galaxy legend" onClick={onClose}>
      <div className="legend-card" onClick={(e) => e.stopPropagation()}>
        <header className="legend-head">
          <h2>🗺️ Reading your galaxy</h2>
          <button className="legend-close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="legend-scroll">
          <section>
            <h3>Memory types (colour)</h3>
            <ul className="legend-list">
              {NODE_TYPES.filter((t) => t !== "moc").map((t) => (
                <li key={t}>
                  <Swatch color={TYPE_COLORS[t]} />
                  <span className="legend-name">{NODE_TYPE_LABEL[t]}</span>
                  <span className="legend-meaning">{TYPE_MEANING[t]}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3>Body size = how much a memory matters</h3>
            <p className="legend-note">
              A memory grows as it gains importance, connections, and age. Bigger = weightier.
            </p>
            <ul className="legend-list">
              {CELESTIAL_CLASSES.map((c) => (
                <li key={c}>
                  <span className="legend-glyph">{CELESTIAL_ICON[c]}</span>
                  <span className="legend-name">{CELESTIAL_LABEL[c]}</span>
                  <span className="legend-meaning">{CELESTIAL_MEANING[c]}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3>Special bodies</h3>
            <ul className="legend-list">
              <li>
                <Swatch color={SPECIAL_COLORS.constellation} ring />
                <span className="legend-name">Constellation</span>
                <span className="legend-meaning">a named hub summarizing a body of work</span>
              </li>
              <li>
                <Swatch color={SPECIAL_COLORS.belief} ring />
                <span className="legend-name">Belief</span>
                <span className="legend-meaning">something she's concluded about you</span>
              </li>
              <li>
                <Swatch color={SPECIAL_COLORS.sun} ring />
                <span className="legend-name">The Sun</span>
                <span className="legend-meaning">the core your whole galaxy orbits</span>
              </li>
            </ul>
          </section>

          <section>
            <h3>Your mind (the cognitive layer)</h3>
            <p className="legend-note">
              Beyond what you remember — what you're pursuing and becoming. Map these in the 🧠 Mind
              tab; your memories drift into their orbit over time.
            </p>
            <ul className="legend-list">
              {COGNITIVE_KINDS.map((k) => (
                <li key={k}>
                  <Swatch color={COGNITIVE_META[k].color} ring={COGNITIVE_META[k].durable} />
                  <span className="legend-name">
                    {COGNITIVE_META[k].icon} {COGNITIVE_META[k].label}
                  </span>
                  <span className="legend-meaning">{COGNITIVE_META[k].blurb}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3>Connections (the glowing lines)</h3>
            <ul className="legend-list">
              <li>
                <Swatch color={EMOTION_COLORS.neutral} />
                <span className="legend-name">Green</span>
                <span className="legend-meaning">a neutral link — the resting colour</span>
              </li>
              <li>
                <Swatch color={EMOTION_COLORS.positive} />
                <span className="legend-name">Gold</span>
                <span className="legend-meaning">joins two joyful memories</span>
              </li>
              <li>
                <Swatch color={EMOTION_COLORS.heavy} />
                <span className="legend-name">Indigo</span>
                <span className="legend-meaning">joins two heavy memories</span>
              </li>
              <li>
                <span className="legend-glyph">✦</span>
                <span className="legend-name">Bright flare</span>
                <span className="legend-meaning">Soumaya just tended it — fades over ~3 days</span>
              </li>
              <li>
                <span className="legend-glyph">•••</span>
                <span className="legend-name">Travelling dots</span>
                <span className="legend-meaning">real info flowing between memories</span>
              </li>
            </ul>
          </section>

          <section>
            <h3>The fleet</h3>
            <ul className="legend-list">
              {FLEET.map((u) => (
                <li key={u.id}>
                  <span className="legend-glyph">{u.icon}</span>
                  <span className="legend-name">{u.name}</span>
                  <span className="legend-meaning">{u.role}</span>
                </li>
              ))}
              <li>
                <span className="legend-glyph">👽</span>
                <span className="legend-name">Visitors</span>
                <span className="legend-meaning">drifters drawn to your most interesting memories</span>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
