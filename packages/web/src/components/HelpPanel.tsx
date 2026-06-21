import { useState } from "react";
import { SATELLITE_LORE, SATELLITE_NAME } from "../graph/satellites.js";

interface Props {
  onClose: () => void;
  installPrompt?: any;
  onInstall?: () => void;
}

interface HelpItem {
  icon?: string;
  title: string;
  body: string;
  tags?: string[];
}

const CATEGORIES: {
  id: string;
  title: string;
  icon: string;
  desc: string;
  items: HelpItem[];
}[] = [
  {
    id: "navigation",
    title: "Controls & Flight",
    icon: "🛸",
    desc: "How to steer your camera, orbit clusters, lock targets, and fly through space.",
    items: [
      { icon: "🖐️", title: "Move and Orbit", body: "Click and drag (or drag with touch) anywhere on the background space to orbit the camera around the active focal point, allowing you to view your thought constellations from any angle.", tags: ["camera", "drag", "orbit", "steer", "navigation"] },
      { icon: "＋/－", title: "Flight Zoom", body: "Click the ＋ or − zoom buttons on the HUD to FLY your camera forward and backward in 3D space, rather than just scaling. This allows you to fly directly into high-density sectors.", tags: ["zoom", "fly", "hud", "buttons"] },
      { icon: "⊙", title: "Recenter focal lock", body: "Click the recenter icon to release any active focus targets, re-frame the entire galaxy at the center of your screen, and restore default camera distances.", tags: ["recenter", "focus", "focal", "reset"] },
      { icon: "🛸", title: "Focus Companion's ship", body: "Click the focus ship button (or select the companion ship in space) to lock the camera directly onto her flight path. The camera will follow her automatically, allowing you to inspect her tending tasks.", tags: ["ship", "camera", "follow", "focal"] },
      { icon: "🌐", title: "Focus the Waystation", body: "Snap your camera focal lock onto Waystation Soumaya-Prime, the central megastructure orbiting the galaxy.", tags: ["station", "structure", "orbit", "focal"] },
      { icon: "🛰️", title: "Jump to Aura beacons", body: "Click the beacon hotkeys or click a beacon physically in space. Beacons take orbit over memories going cold, giving you quick jumping points to stars that need tending.", tags: ["beacon", "jump", "cooling", "tending"] },
      { icon: "☄️", title: "Flashback Comet", body: "Tap the comet icon in the HUD to trigger a random serendipitous jump, launching the camera on a fast flight to a high-importance memory from the past.", tags: ["comet", "flashback", "random", "serendipity"] },
      { icon: "🔈", title: "Ambient soundscapes", body: "Toggle the space drone soundtrack on and off directly from the audio control chip on the interface.", tags: ["audio", "music", "drone", "sound"] }
    ]
  },
  {
    id: "rules",
    title: "Galaxy & Gravity",
    icon: "🪐",
    desc: "The rules of deep space: semantic orbits, entropy, cooling, and lore evolution.",
    items: [
      { icon: "🌌", title: "Constellations & Orbits", body: "Every memory behaves as a physical body with real gravity. Its mass—which determines its size and physical scale—is dynamically calculated from its connection count, emotional importance, and user-assigned significance. Heavy memories pull lighter thoughts into orbit around them, organizing your brain by association rather than folder structures.", tags: ["gravity", "size", "mass", "orbit", "connections"] },
      { icon: "🔌", title: "Auto-Semantic Connections", body: "When you log a new thought, it is automatically vectorized and linked to the nearest thoughts in meaning—completely bypassing the chore of manual tagging. Over time, these links naturally coalesce into cosmic clusters and constellations.", tags: ["links", "vector", "ai", "semantic", "automatic"] },
      { icon: "❄️", title: "Entropy (Cooling & Neglect)", body: "Untended memories slowly cool down, fading in color and drifting towards a cold blue. Highly connected memories cool down much slower. To warm a memory back up, simply view it (focal lock) to inject user energy.", tags: ["entropy", "cooling", "blue", "tending", "energy"] },
      { icon: "☄️", title: "Star Classification & Tints", body: "Memories are classified from Asteroid to Moon, Planet, Gas Giant, Giant, Star, and Supergiant based on importance. Newly created stars burn hot white; older unconnected stars redshift over time into a weathered copper glow, leaving a visual fossil record.", tags: ["classification", "star", "white", "redshift", "fossil"] },
      { icon: "❇️", title: "Emerald Energy Ripples", body: "Performing manual updates (like manually adjusting importance sliders or forging paths) triggers a green glowing wave of user energy radiating through the surrounding connections.", tags: ["ripples", "green", "energy", "importance"] },
      { icon: "📖", title: "Chronicle & Lore Evolution", body: "Every memory keeps an append-only Chronicle—an evolving story tracking its life cycle. Tap '✦ Evolve' in details to let the AI write a new chapter connecting it to recent events, or watch the companion add chapters on her own.", tags: ["chronicle", "lore", "chapters", "evolve", "story"] }
    ]
  },
  {
    id: "fleet",
    title: "Economy & Fleet",
    icon: "⚡",
    desc: "Manage Research Mode, fuel cells, and check the roles of your autonomous fleet.",
    items: [
      { icon: "⛽", title: "Celestial Fuel", body: "A free energy currency earned by actively tending your brain—creating new connections, logging memories, or completing agenda items. Spent by the companion to perform deep-dive gap analysis. (Her core maintenance runs for free!)", tags: ["fuel", "economy", "tending", "energy"] },
      { icon: "🔬", title: "Research Mode", body: "Toggle Research Mode in the Companion Command Center. When active, she consumes fuel to scan the frontier of your graph, searching for isolated ideas and forging new links.", tags: ["research", "mode", "toggle", "gaps", "connections"] },
      { icon: "🛰️", title: "Fleet: Companion Starpilot", body: "Your main autonomous vessel. She flies between hubs, bridges semantic gaps, prunes duplicate notes, and writes the daily Captain's Log summarizing the evolution of your galaxy.", tags: ["ship", "starpilot", "maintenance", "log"] },
      { icon: "📡", title: "Fleet: Aura Beacons", body: "Warming relays dispatched to orbit cooling stars. Beacons project energy beams colored by the star's underlying emotion (warm gold for joy, cool blue for heavy thoughts).", tags: ["beacon", "relays", "beams", "emotion"] },
      { icon: "🛰️", title: `Fleet: ${SATELLITE_NAME}s`, body: SATELLITE_LORE, tags: ["satellite", "sentinels", "beacons"] },
      { icon: "🏹", title: "Fleet: The Scout & Defender", body: "The Scout ship surveys the frontier, looking for the loneliest, isolated memories. The Defender guards your heaviest hub, intercepting system anomalies and maintaining spatial stability.", tags: ["scout", "defender", "frontier", "hubs"] }
    ]
  },
  {
    id: "hangar",
    title: "Hangar & Awards",
    icon: "🏆",
    desc: "Unlock custom hulls, exhaust trails, deploy Dyson megastructures, and access the Sandbox.",
    items: [
      { icon: "🛠️", title: "The Hangar Customizer", body: "Click the Hangar tab (🛠️) to customize your ship. Change the hull skin (Default, Holographic Sentinel, Biomechanical Specimen, or Fusion Destroyer) and exhaust trail particles.", tags: ["hangar", "skins", "exhaust", "trails", "customization"] },
      { icon: "🏆", title: "Achievements (Awards Tab)", body: "Earn 8 unique badges by expanding your brain. Unlocks include the Hyperdrive Trail (Consistent Pilot), Aegis Shield Spire (Pathfinder), and Solar Gold Exhaust (Sector Pioneer).", tags: ["achievements", "badges", "awards", "unlocks"] },
      { icon: "🪐", title: "Megastructures (Solar & Dyson)", body: "Unlock giant background figurines at memory milestones (Solar Monument at 100 memories, Biomechanical Specimen at 150, and Dyson Sphere Megastructure at 250) floating in the deep background space.", tags: ["dyson", "sphere", "monument", "megastructures", "figurines"] },
      { icon: "🎲", title: "Sandbox Simulation Deck", body: "Accessible inside the Hangar tab for the owner. Offers control sliders to trigger simulated unlocks, toast alerts, and progression states in real-time.", tags: ["sandbox", "simulator", "demo", "testing", "controls"] }
    ]
  }
];

export function HelpPanel({ onClose, installPrompt, onInstall }: Props) {
  const [activeTab, setActiveTab] = useState<string>("navigation");
  const [search, setSearch] = useState<string>("");

  // Collect search results if search is not empty
  const isSearchActive = search.trim().length > 0;
  const searchResults: { item: HelpItem; category: string }[] = [];

  if (isSearchActive) {
    const query = search.toLowerCase();
    CATEGORIES.forEach((cat) => {
      cat.items.forEach((item) => {
        const titleMatch = item.title.toLowerCase().includes(query);
        const bodyMatch = item.body.toLowerCase().includes(query);
        const tagMatch = item.tags?.some((t) => t.toLowerCase().includes(query));
        if (titleMatch || bodyMatch || tagMatch) {
          searchResults.push({ item, category: cat.title });
        }
      });
    });
  }

  const selectedCategory = CATEGORIES.find((cat) => cat.id === activeTab);

  return (
    <div className="help-overlay" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`
        .help-overlay {
          padding: 24px;
        }
        .help-search-box {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          display: flex;
          align-items: center;
          padding: 6px 12px;
          margin-bottom: 20px;
          position: relative;
        }
        .help-search-input {
          border: none;
          background: transparent;
          color: white;
          flex: 1;
          outline: none;
          font-size: 14px;
          padding: 6px 0;
        }
        .help-search-input::placeholder {
          color: var(--muted);
          opacity: 0.6;
        }
        .help-search-clear {
          background: transparent;
          border: none;
          color: var(--muted);
          font-size: 18px;
          cursor: pointer;
          padding: 0 4px;
        }
        .help-layout {
          display: flex;
          flex: 1;
          overflow: hidden;
          gap: 20px;
        }
        .help-sidebar {
          width: 240px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
          border-right: 1px solid rgba(255, 255, 255, 0.08);
          padding-right: 15px;
          overflow-y: auto;
        }
        .help-tab-btn {
          background: transparent;
          border: 1px solid transparent;
          border-radius: 6px;
          color: var(--muted);
          text-align: left;
          padding: 10px 14px;
          font-size: 13.5px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .help-tab-btn:hover {
          background: rgba(255, 255, 255, 0.04);
          color: var(--text);
        }
        .help-tab-btn.active {
          background: rgba(100, 200, 255, 0.08);
          border-color: rgba(100, 200, 255, 0.25);
          color: var(--accent);
          font-weight: 500;
        }
        .help-content-scroll {
          flex: 1;
          overflow-y: auto;
          padding-right: 8px;
        }
        .help-category-header {
          margin: 0 0 15px 0;
        }
        .help-category-header h3 {
          margin: 0 0 4px 0 !important;
          font-size: 16px !important;
          color: var(--text) !important;
          text-transform: none !important;
          letter-spacing: normal !important;
        }
        .help-category-desc {
          margin: 0;
          font-size: 12.5px;
          color: var(--muted);
          line-height: 1.4;
        }
        .help-cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 12px;
          padding-bottom: 20px;
        }
        .help-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 14px;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .help-card:hover {
          transform: translateY(-2px);
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(255, 255, 255, 0.08);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25);
        }
        .help-card-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
        }
        .help-card-icon {
          font-size: 16px;
          background: rgba(255, 255, 255, 0.04);
          width: 28px;
          height: 28px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .help-card-title {
          font-size: 13.5px;
          font-weight: 600;
          color: var(--text);
          margin: 0;
        }
        .help-card-body {
          font-size: 12px;
          color: #d7d4ee;
          line-height: 1.45;
          margin: 0;
          flex-grow: 1;
        }
        .help-card-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-top: 10px;
        }
        .help-card-tag {
          font-size: 9px;
          background: rgba(100, 200, 255, 0.06);
          border: 1px solid rgba(100, 200, 255, 0.12);
          color: var(--accent);
          padding: 1.5px 5px;
          border-radius: 3px;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }
        .help-card-category-badge {
          align-self: flex-start;
          font-size: 9px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: var(--muted);
          padding: 1.5px 5px;
          border-radius: 3px;
          margin-top: 10px;
        }
        @media (max-width: 768px) {
          .help-layout {
            flex-direction: column;
          }
          .help-sidebar {
            width: 100%;
            flex-direction: row;
            border-right: none;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            padding-right: 0;
            padding-bottom: 8px;
            overflow-x: auto;
            white-space: nowrap;
          }
          .help-tab-btn {
            padding: 8px 12px;
            font-size: 12.5px;
          }
          .help-content-scroll {
            padding-top: 10px;
          }
        }
      `}</style>

      <div className="help-head">
        <h2>Galaxy Pilot Manual</h2>
        <button className="panel-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <p className="help-intro" style={{ marginBottom: "15px" }}>
        Welcome to your personal second brain. Your thoughts form a dynamic physical galaxy where semantic connections organize themselves, and stars glow hot or cool down over time.
      </p>

      {installPrompt && onInstall && (
        <div className="help-install-container" style={{ margin: "0 0 15px 0" }}>
          <button className="help-install-btn" onClick={onInstall}>
            📲 Install Second Brain App
          </button>
        </div>
      )}

      {/* Interactive Search */}
      <div className="help-search-box">
        <span style={{ fontSize: "14px", marginRight: "8px", opacity: 0.6 }}>🔍</span>
        <input
          type="text"
          className="help-search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search pilot guide for terms (e.g. fuel, orbit, beacon, trail, hangar)..."
        />
        {isSearchActive && (
          <button className="help-search-clear" onClick={() => setSearch("")}>
            ×
          </button>
        )}
      </div>

      {/* Interactive Main Area */}
      <div className="help-layout">
        {!isSearchActive && (
          <div className="help-sidebar">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                className={`help-tab-btn ${activeTab === cat.id ? "active" : ""}`}
                onClick={() => setActiveTab(cat.id)}
              >
                <span>{cat.icon}</span>
                {cat.title}
              </button>
            ))}
          </div>
        )}

        <div className="help-content-scroll">
          {isSearchActive ? (
            <div>
              <div className="help-category-header">
                <h3>Search Results ({searchResults.length})</h3>
                <p className="help-category-desc">
                  Showing matching topics for "{search}"
                </p>
              </div>

              {searchResults.length > 0 ? (
                <div className="help-cards-grid">
                  {searchResults.map(({ item, category }) => (
                    <div key={item.title} className="help-card">
                      <div>
                        <div className="help-card-header">
                          <span className="help-card-icon">{item.icon || "💡"}</span>
                          <h4 className="help-card-title">{item.title}</h4>
                        </div>
                        <p className="help-card-body">{item.body}</p>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        {item.tags && item.tags.length > 0 && (
                          <div className="help-card-tags">
                            {item.tags.slice(0, 2).map((t) => (
                              <span key={t} className="help-card-tag">{t}</span>
                            ))}
                          </div>
                        )}
                        <span className="help-card-category-badge">{category}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty" style={{ padding: "40px 0" }}>
                  No guides match "{search}". Try searching for keywords like "fuel", "trail", "Dyson", or "lock".
                </p>
              )}
            </div>
          ) : (
            selectedCategory && (
              <div>
                <div className="help-category-header">
                  <h3>{selectedCategory.title}</h3>
                  <p className="help-category-desc">{selectedCategory.desc}</p>
                </div>

                <div className="help-cards-grid">
                  {selectedCategory.items.map((item) => (
                    <div key={item.title} className="help-card">
                      <div>
                        <div className="help-card-header">
                          <span className="help-card-icon">{item.icon || "💡"}</span>
                          <h4 className="help-card-title">{item.title}</h4>
                        </div>
                        <p className="help-card-body">{item.body}</p>
                      </div>
                      {item.tags && item.tags.length > 0 && (
                        <div className="help-card-tags">
                          {item.tags.slice(0, 3).map((t) => (
                            <span key={t} className="help-card-tag">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
