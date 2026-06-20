import { SATELLITE_LORE, SATELLITE_NAME } from "../graph/satellites.js";

interface Props {
  onClose: () => void;
}

const ROWS: { icon: string; title: string; body: string }[] = [
  { icon: "🖐️", title: "Move around", body: "Drag to look and orbit. The on-screen ＋ / − buttons FLY you forward and back through space (not a fixed zoom-to-center), so you can cruise straight into any cluster without getting stuck. Best of all: tap any body to fly right up to it. Lost? Hit ⊙ to reframe everything." },
  { icon: "📝", title: "Add a memory", body: "Dump any thought. It's turned into a celestial body, weighted by how significant + connected it is." },
  { icon: "🔍", title: "Search", body: "Find a memory by meaning and fly straight to it." },
  { icon: "🌌", title: "Sectors", body: "Navigate the galaxy by major hubs. High-level index for high-density clusters." },
  { icon: "☰", title: "Panels", body: "Details, Sectors (🌌), List (📋), Agenda (✅), Insights (✨), Chat (💬), Soumaya (🛰️), and Fleet (🚀)." },
  { icon: "⊙", title: "Recenter", body: "Re-frame the whole galaxy and release any focus lock." },
  { icon: "🛸", title: "Focus Soumaya", body: "Lock the camera onto her ship (snaps to the front); orbit freely while she works." },
  { icon: "🌐", title: "Focus the station", body: "Lock onto Waystation Soumaya-Prime, the megastructure orbiting your galaxy." },
  { icon: "🛰️", title: "Jump to a beacon", body: "Only appears — and pulses — when Aura beacons are deployed over cooling memories. Tap to fly between them; each is parked on a memory going cold, so it doubles as a shortcut to what needs tending." },
  { icon: "🔈", title: "Music", body: "Toggle the ambient space drone." },
  { icon: "🗣️", title: "Soumaya's voice", body: "(in Chat) Toggle her speaking voice on/off. When on, she reads her answers aloud, shaping her tone to the emotional weather of what you're discussing — never a flat robot. The choice is remembered on this device." },
];

const CONCEPTS: { title: string; body: string }[] = [
  { title: "Tap a star", body: "Opens its Details and dims everything except its connections, so you can see what links to what." },
  { title: "Macro View", body: "Far-off bodies render as small, spinning low-poly spheres (a field of light, Obsidian-style) for performance; fly closer and they resolve into full, textured worlds. Every body spins on its own axis while it orbits." },
  { title: "👽 + 🌌 in the List", body: "Each memory row shows how many alien visitors it has drawn (👽) and which constellation it belongs to (🌌) — so the List doubles as a map of what's alive and how things cluster." },
  { title: "Recall pulses", body: "When Chat answers cite memories, synapse-like pulses fire along their links and a soft burst marks each cited body — so you can SEE where the answer came from." },
  { title: "Writing…", body: "A memory's orb pulses while Soumaya is actively working on it (synthesizing, maintaining), so you know something's happening." },
  { title: "Emerald Ripples", body: "Manual user actions (like updating weights) trigger a green ripple — a sign of user energy flowing into the brain." },
  { title: "Star Age Tints", body: "New memories burn hot white. Older, unconnected memories gradually redshift into a weathered glow, creating a visual fossil record." },
  { title: "Flashback Comet ☄️", body: "Tap the comet icon to randomly fly to a high-importance memory from the past. Serendipity in action." },
  { title: "Weight slider", body: "Sets a memory's importance → its size/class (asteroid → moon → planet → gas giant → giant → star → supergiant). 'auto' re-rates it." },
  { title: "✨ Connect the dots", body: "(in Details) The AI ties THIS memory together with the ones it's linked to, into a fresh insight." },
  { title: "💬 Chat", body: "Ask your brain a question; it answers from your memories, with citations you can fly to. Turn on 🗣️ to hear her answer aloud." },
  { title: "Soumaya (tap her ship)", body: "Opens the Command Center: her live activity, Research Mode, and her ⛽ Fuel gauge." },
  { title: "⛽ Fuel (the Celestial Economy)", body: "A free energy you EARN by tending your galaxy — logging memories, forging links, clearing action items. Soumaya SPENDS it on her ambitious deep-dive research + sector charting. Her core duties (surfacing connections, tidying the graph, her daily log) always run regardless — fuel just fuels the extra. The real API budget stays the hard cap." },
  { title: "❄️ Cooling memories (Entropy)", body: "Untended memories slowly go cold — they dim and drift toward a cold blue in the galaxy, and surface in the daily digest as 'going cold'. Well-connected ones cool far slower. Nothing is ever deleted: just visit (focus) a memory to warm it right back up." },
  { title: `🛰️ ${SATELLITE_NAME}s`, body: SATELLITE_LORE },
];

// The deeper "why" — the mechanics a player needs to understand to read the world,
// not just operate the buttons. (Kept honest to what the app actually does today.)
const MECHANICS: { title: string; body: string }[] = [
  {
    title: "It's a real graph, with real gravity",
    body: "Every memory becomes a celestial body. Its size/class (asteroid → moon → planet → gas giant → giant → star → supergiant) is its gravitational MASS, blended from three things: how important it is, how connected it is, and its emotional charge. Heavy memories pull lighter ones into orbit around them, so the layout is meaning, not decoration.",
  },
  {
    title: "Memories link themselves",
    body: "When you add a thought, it's embedded and automatically linked to the memories closest to it in meaning — no manual tagging. Those associative links are what grow constellations and let the galaxy reveal structure you didn't know was there.",
  },
  {
    title: "Soumaya is autonomous — and explains herself",
    body: "The ship isn't decoration — she works on her own: connecting the dots between related-but-distant memories (her primary job), tidying and merging duplicates, harmonizing emotion, and writing a daily log. She does NOT research everything — research is reserved for genuine gaps (an important memory left under-connected, a blind spot). Every action she takes is logged in her panel with a plain-English breakdown — Objective / Why now / Benefit — and a floating label over her ship shows what she's doing right now (toggle it in the Soumaya tab). Her ambitious work is gated by Research Mode + ⛽ Fuel; her core upkeep always runs. The API budget is the hard ceiling.",
  },
  {
    title: "Heat & cold (Entropy)",
    body: "Memories cool when neglected — they dim and drift toward cold blue, and show up in the daily digest as 'going cold'. Well-connected memories cool much slower. Nothing is ever deleted; focusing a memory warms it right back.",
  },
  {
    title: "The Aura beacons (her fleet)",
    body: "When memories go cold, Soumaya dispatches relay beacons that take orbit and beam them warm — the colder the memory, the brighter the beam. When NOTHING is cold, a beacon instead stands sentinel over your heaviest hub star. A beam's color follows the memory's EMOTION (warm gold for joyful, cool blue for heavy). Visit a beamed memory to warm it; the beacon moves on.",
  },
  {
    title: "Time: when it happened, reminders & tags",
    body: "A memory can carry the date/time its event actually happened (you can backdate it), a future reminder, and tags (Work, Ideas, Anxious…). These let the brain be a timeline, not just a pile — and tags give you fast context/filtering.",
  },
  {
    title: "Your brain is private",
    body: "Each brain is its own private space, opened with a name + passcode. Anyone can create their own; brains never see each other's memories.",
  },
  {
    title: "Talk to it from your phone (Telegram)",
    body: "Link a Telegram chat to your brain (/link name passcode) and you can log thoughts and ask questions by message — and Soumaya sends you a daily digest on her own.",
  },
  {
    title: "Install it like an app",
    body: "Use your browser's 'Add to Home Screen' to install Soumaya as a standalone app. It launches full-screen and the galaxy still loads offline (your live memories need a connection).",
  },
  {
    title: "The Fleet (🚀 tab)",
    body: "Soumaya doesn't work alone. The Fleet tab is the roster of everyone reporting to her: her ship, the Waystation, the Aura beacons (warmth relays), the Scout (surveys the newest/loneliest memories — the frontier), and the Defender (guards your heaviest hub and intercepts hostile drifters). Each shows a live status of what it's doing right now.",
  },
  {
    title: "Chronicle (an object's lore)",
    body: "Open a memory's Details to find its Chronicle — an evolving, saved story that grows new chapters as the memory gets connected, merged, or goes cold and warm again. The first chapter (its genesis) never changes; tap ✦ Evolve to write the next one, or watch Soumaya add chapters on her own over time.",
  },
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

      <h3>How the world works (the rules)</h3>
      <p className="help-intro">
        Soumaya is part tool, part living world. These are the mechanics behind what you
        see — worth knowing so the galaxy reads as meaning, not just pretty lights.
      </p>
      <ul className="help-list">
        {MECHANICS.map((m) => (
          <li key={m.title}>
            <span>
              <b>{m.title}</b> — {m.body}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
