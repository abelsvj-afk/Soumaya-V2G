interface Props {
  onClose: () => void;
}

const ROWS: { icon: string; title: string; body: string }[] = [
  { icon: "＋", title: "Add a memory", body: "Dump any thought. It's turned into a celestial body, weighted by how significant + connected it is." },
  { icon: "🔍", title: "Search", body: "Find a memory by meaning and fly straight to it." },
  { icon: "☰", title: "Panels", body: "Details (the selected memory), List (every memory), ✨ Insights, and 💬 Chat." },
  { icon: "⊙", title: "Recenter", body: "Re-frame the whole galaxy and release any focus lock." },
  { icon: "🛸", title: "Focus Soumaya", body: "Lock the camera onto her ship (snaps to the front); orbit freely while she works." },
  { icon: "🛰️", title: "Focus station", body: "Lock onto the space station — Soumaya docks there to recharge." },
  { icon: "🔈", title: "Music", body: "Toggle the ambient space drone." },
  { icon: "✨", title: "Demo galaxy", body: "Preview a fake, fuller galaxy. Nothing here is saved." },
];

const CONCEPTS: { title: string; body: string }[] = [
  { title: "Tap a star", body: "Opens its Details and dims everything except its connections, so you can see what links to what." },
  { title: "Weight slider", body: "Sets a memory's importance → its size/class (asteroid → moon → planet → giant → star → supergiant). 'auto' re-rates it." },
  { title: "✨ Connect the dots", body: "(in Details) The AI ties THIS memory together with the ones it's linked to, into a fresh insight." },
  { title: "🔍 Find new links", body: "(Insights tab) Scans your WHOLE brain for related-but-unconnected memories." },
  { title: "💬 Chat", body: "Ask your brain a question; it answers from your memories, with citations you can fly to." },
  { title: "Soumaya (tap her ship)", body: "Opens the Command Center: her live activity + Research Mode." },
  { title: "⚠️ Research Mode", body: "When ON, Soumaya autonomously synthesizes/researches/merges memories — this USES your OpenAI tokens. OFF (default) keeps her to free upkeep (tidying links, recalibrating)." },
];

/** A simple in-app guide explaining every control + concept. */
export function HelpPanel({ onClose }: Props) {
  return (
    <div className="help-overlay">
      <div className="help-head">
        <h2>How Soumaya works</h2>
        <button className="panel-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <p className="help-intro">
        Your thoughts become a living galaxy. Significant, well-connected memories grow into bright
        stars; lonely ones fade until you revisit them. Soumaya (the ship) tends it all.
      </p>

      <h3>Controls</h3>
      <ul className="help-list">
        {ROWS.map((r) => (
          <li key={r.title}>
            <span className="help-ic">{r.icon}</span>
            <span>
              <b>{r.title}</b> — {r.body}
            </span>
          </li>
        ))}
      </ul>

      <h3>Good to know</h3>
      <ul className="help-list">
        {CONCEPTS.map((c) => (
          <li key={c.title}>
            <span>
              <b>{c.title}</b> — {c.body}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
