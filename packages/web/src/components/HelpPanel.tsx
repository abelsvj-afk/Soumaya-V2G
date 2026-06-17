interface Props {
  onClose: () => void;
}

const ROWS: { icon: string; title: string; body: string }[] = [
  { icon: "＋", title: "Add a memory", body: "Dump any thought. It's turned into a celestial body, weighted by how significant + connected it is." },
  { icon: "🔍", title: "Search", body: "Find a memory by meaning and fly straight to it." },
  { icon: "🌌", title: "Sectors", body: "Navigate the galaxy by major hubs. High-level index for high-density clusters." },
  { icon: "☰", title: "Panels", body: "Details, Sectors (🌌), List (📋), Insights (✨), Chat (💬), and Soumaya (🛰️)." },
  { icon: "⊙", title: "Recenter", body: "Re-frame the whole galaxy and release any focus lock." },
  { icon: "🛸", title: "Focus Soumaya", body: "Lock the camera onto her ship (snaps to the front); orbit freely while she works." },
  { icon: "🔈", title: "Music", body: "Toggle the ambient space drone." },
  { icon: "🗣️", title: "Soumaya's voice", body: "(in Chat) Toggle her speaking voice on/off. When on, she reads her answers aloud, shaping her tone to the emotional weather of what you're discussing — never a flat robot. The choice is remembered on this device." },
];

const CONCEPTS: { title: string; body: string }[] = [
  { title: "Tap a star", body: "Opens its Details and dims everything except its connections, so you can see what links to what." },
  { title: "Macro View", body: "Zoom out to see the galaxy as a field of light (Obsidian-style). Nodes swap to low-poly sprites for max performance." },
  { title: "Emerald Ripples", body: "Manual user actions (like updating weights) trigger a green ripple — a sign of user energy flowing into the brain." },
  { title: "Star Age Tints", body: "New memories burn hot white. Older, unconnected memories gradually redshift into a weathered glow, creating a visual fossil record." },
  { title: "Flashback Comet ☄️", body: "Tap the comet icon to randomly fly to a high-importance memory from the past. Serendipity in action." },
  { title: "Weight slider", body: "Sets a memory's importance → its size/class (asteroid → moon → planet → giant → star → supergiant). 'auto' re-rates it." },
  { title: "✨ Connect the dots", body: "(in Details) The AI ties THIS memory together with the ones it's linked to, into a fresh insight." },
  { title: "💬 Chat", body: "Ask your brain a question; it answers from your memories, with citations you can fly to. Turn on 🗣️ to hear her answer aloud." },
  { title: "Soumaya (tap her ship)", body: "Opens the Command Center: her live activity, Research Mode, and her ⛽ Fuel gauge." },
  { title: "⛽ Fuel (the Celestial Economy)", body: "A free energy you EARN by tending your galaxy — logging memories, forging links, clearing action items. Soumaya SPENDS it on her ambitious deep-dive research + sector charting. Her core duties (surfacing connections, tidying the graph, her daily log) always run regardless — fuel just fuels the extra. The real API budget stays the hard cap." },
  { title: "❄️ Cooling memories (Entropy)", body: "Untended memories slowly go cold — they dim and drift toward a cold blue in the galaxy, and surface in the daily digest as 'going cold'. Well-connected ones cool far slower. Nothing is ever deleted: just visit (focus) a memory to warm it right back up." },
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
