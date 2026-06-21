import { loadUnlocked } from "./achievements.js";

interface HangarPanelProps {
  spaceId: string;
  memoriesCount: number;
  onEquipChanged: () => void;
  demo?: boolean;
}

export function HangarPanel({ spaceId, memoriesCount, onEquipChanged, demo }: HangarPanelProps) {
  // Load unlocked achievements from localStorage to determine which items are available
  const unlocked = loadUnlocked(spaceId);

  const bypassKey = `brain.demo.bypass.${spaceId}`;
  const simMemKey = `brain.demo.sim_memories.${spaceId}`;
  const simLinkKey = `brain.demo.sim_links.${spaceId}`;

  // Demo bypass defaults to true in demo mode to unlock everything, unless explicitly toggled off to test progression
  const demoBypass = demo ? (localStorage.getItem(bypassKey) !== "0") : false;

  // Active selections (from localStorage)
  const shipKey = `brain.hangar.ship.${spaceId}`;
  const trailKey = `brain.hangar.trail.${spaceId}`;
  const fig1Key = `brain.hangar.fig1.${spaceId}`;
  const fig2Key = `brain.hangar.fig2.${spaceId}`;

  const currentShip = localStorage.getItem(shipKey) || "default";
  const currentTrail = localStorage.getItem(trailKey) || "blue";
  const currentFig1 = localStorage.getItem(fig1Key) || "none";
  const currentFig2 = localStorage.getItem(fig2Key) || "none";

  // Simulated or actual counts
  let activeMemoriesCount = memoriesCount;
  if (demo && !demoBypass) {
    activeMemoriesCount = parseInt(localStorage.getItem(simMemKey) || "0", 10);
  }

  // Unlocked predicates (milestones & custom achievements)
  const isStarUnlocked = demoBypass || unlocked.has("star_center_figurine") || activeMemoriesCount >= 100;
  const isOrganicUnlocked = demoBypass || unlocked.has("organic_ship_skin") || activeMemoriesCount >= 150;
  const isDysonUnlocked = demoBypass || unlocked.has("dyson_sphere_figurine") || activeMemoriesCount >= 250;

  // New gamification unlock predicates
  const hasPathfinder = demoBypass || unlocked.has("pathfinder_quest");
  const hasConsistent = demoBypass || unlocked.has("consistent_pilot");
  const hasSectorPioneer = demoBypass || unlocked.has("sector_pioneer");
  const hasSentinel = demoBypass || unlocked.has("sentinel_command");
  const hasDeepCluster = demoBypass || unlocked.has("deep_cluster");
  const hasCosmicVoyager = demoBypass || unlocked.has("cosmic_voyager");
  const hasMegastructure = demoBypass || unlocked.has("galactic_megastructure");
  const hasGrandRestorer = demoBypass || unlocked.has("grand_restorer");

  const setShip = (val: string) => {
    localStorage.setItem(shipKey, val);
    onEquipChanged();
  };

  const setTrail = (val: string) => {
    localStorage.setItem(trailKey, val);
    onEquipChanged();
  };

  const setFig1 = (val: string) => {
    localStorage.setItem(fig1Key, val);
    onEquipChanged();
  };

  const setFig2 = (val: string) => {
    localStorage.setItem(fig2Key, val);
    onEquipChanged();
  };

  return (
    <div className="dock-body hangar" style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", paddingRight: "4px" }}>
      <div className="awards-head">
        <h3 className="awards-title">🛠️ Hangar</h3>
      </div>
      <p style={{ fontSize: "0.82rem", opacity: 0.8, margin: "0 0 1.25rem 0" }}>
        Customize Soumaya's spaceship hull, adjust her cosmic engine trail, and mount colossal, civilization-scale monuments in the deep space background.
      </p>

      {/* DEMO SIMULATION CONTROLS */}
      {demo && (
        <div style={{
          background: "rgba(255, 122, 249, 0.08)",
          border: "1px dashed rgba(255, 122, 249, 0.35)",
          borderRadius: "8px",
          padding: "0.85rem",
          marginBottom: "1.5rem"
        }}>
          <h4 style={{ margin: "0 0 0.6rem 0", color: "#ff7af9", fontSize: "0.86rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            🛠️ Demo Simulation Sandbox
          </h4>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem", marginBottom: "0.85rem", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={demoBypass}
              onChange={(e) => {
                localStorage.setItem(bypassKey, e.target.checked ? "1" : "0");
                onEquipChanged();
              }}
            />
            Bypass Locks (Unlock All Instantly)
          </label>

          {!demoBypass && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.76rem", marginBottom: "0.25rem" }}>
                  <span>Simulated Memories:</span>
                  <span style={{ fontWeight: "bold" }}>{activeMemoriesCount}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="300"
                  value={activeMemoriesCount}
                  onChange={(e) => {
                    localStorage.setItem(simMemKey, e.target.value);
                    onEquipChanged();
                  }}
                  style={{ width: "100%", accentColor: "#ff7af9" }}
                />
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.76rem", marginBottom: "0.25rem" }}>
                  <span>Simulated Connections:</span>
                  <span style={{ fontWeight: "bold" }}>{parseInt(localStorage.getItem(simLinkKey) || "0", 10)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="60"
                  value={parseInt(localStorage.getItem(simLinkKey) || "0", 10)}
                  onChange={(e) => {
                    localStorage.setItem(simLinkKey, e.target.value);
                    onEquipChanged();
                  }}
                  style={{ width: "100%", accentColor: "#ff7af9" }}
                />
              </div>

              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
                <button
                  className="mini"
                  style={{ flex: 1, padding: "0.25rem 0.5rem", fontSize: "0.74rem" }}
                  onClick={() => {
                    // Reset achievements to test from scratch
                    localStorage.setItem(`brain.achv.${spaceId}`, "[]");
                    localStorage.setItem(`stat.beacons_deployed.${spaceId}`, "0");
                    localStorage.setItem(`stat.travel_hops.${spaceId}`, "0");
                    localStorage.setItem(`stat.memories_tended.${spaceId}`, "0");
                    localStorage.setItem(simMemKey, "0");
                    localStorage.setItem(simLinkKey, "0");
                    onEquipChanged();
                  }}
                >
                  Reset Sandbox
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION: Ship Skins */}
      <h4 style={{ margin: "1rem 0 0.5rem 0", color: "var(--accent)" }}>🛸 Spaceship Hull</h4>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
        {/* Default Scout */}
        <div style={{
          padding: "0.75rem",
          borderRadius: "6px",
          border: "1px solid " + (currentShip === "default" ? "var(--accent)" : "rgba(255, 255, 255, 0.1)"),
          background: currentShip === "default" ? "rgba(122, 249, 255, 0.08)" : "rgba(10, 12, 28, 0.4)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.86rem" }}>Default Scout Craft</div>
            <div style={{ fontSize: "0.74rem", opacity: 0.7 }}>Standard reconnaissance vessel.</div>
          </div>
          <button
            className="mini"
            disabled={currentShip === "default"}
            onClick={() => setShip("default")}
          >
            {currentShip === "default" ? "Equipped" : "Equip"}
          </button>
        </div>

        {/* Organic spaceship */}
        <div style={{
          padding: "0.75rem",
          borderRadius: "6px",
          border: "1px solid " + (currentShip === "organic" ? "var(--accent)" : "rgba(255, 255, 255, 0.1)"),
          background: currentShip === "organic" ? "rgba(122, 249, 255, 0.08)" : "rgba(10, 12, 28, 0.4)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          opacity: isOrganicUnlocked ? 1 : 0.6
        }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.86rem" }}>Organic Specimen Hull {!isOrganicUnlocked && "🔒"}</div>
            <div style={{ fontSize: "0.74rem", opacity: 0.7 }}>
              {isOrganicUnlocked ? "Biomechanical living ship shell." : "Unlock at 150 memories."}
            </div>
          </div>
          <button
            className="mini"
            disabled={!isOrganicUnlocked || currentShip === "organic"}
            onClick={() => setShip("organic")}
          >
            {currentShip === "organic" ? "Equipped" : isOrganicUnlocked ? "Equip" : "Locked"}
          </button>
        </div>

        {/* Fusion Core Destroyer */}
        <div style={{
          padding: "0.75rem",
          borderRadius: "6px",
          border: "1px solid " + (currentShip === "fusion_core" ? "var(--accent)" : "rgba(255, 255, 255, 0.1)"),
          background: currentShip === "fusion_core" ? "rgba(122, 249, 255, 0.08)" : "rgba(10, 12, 28, 0.4)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          opacity: hasCosmicVoyager ? 1 : 0.6
        }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.86rem" }}>Fusion Core Destroyer {!hasCosmicVoyager && "🔒"}</div>
            <div style={{ fontSize: "0.74rem", opacity: 0.7 }}>
              {hasCosmicVoyager ? "Heavy explorer ship with sun reactor." : "Unlock via 'Cosmic Voyager' (15 travel hops)."}
            </div>
          </div>
          <button
            className="mini"
            disabled={!hasCosmicVoyager || currentShip === "fusion_core"}
            onClick={() => setShip("fusion_core")}
          >
            {currentShip === "fusion_core" ? "Equipped" : hasCosmicVoyager ? "Equip" : "Locked"}
          </button>
        </div>

        {/* Holographic Sentinel */}
        <div style={{
          padding: "0.75rem",
          borderRadius: "6px",
          border: "1px solid " + (currentShip === "holographic" ? "var(--accent)" : "rgba(255, 255, 255, 0.1)"),
          background: currentShip === "holographic" ? "rgba(122, 249, 255, 0.08)" : "rgba(10, 12, 28, 0.4)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          opacity: hasSentinel ? 1 : 0.6
        }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.86rem" }}>Holographic Sentinel {!hasSentinel && "🔒"}</div>
            <div style={{ fontSize: "0.74rem", opacity: 0.7 }}>
              {hasSentinel ? "A futuristic wireframe energy projection." : "Unlock via 'Sentinel Command' (5 beacons)."}
            </div>
          </div>
          <button
            className="mini"
            disabled={!hasSentinel || currentShip === "holographic"}
            onClick={() => setShip("holographic")}
          >
            {currentShip === "holographic" ? "Equipped" : hasSentinel ? "Equip" : "Locked"}
          </button>
        </div>
      </div>

      {/* SECTION: Engine Trails */}
      <h4 style={{ margin: "1rem 0 0.5rem 0", color: "var(--accent)" }}>✨ Cosmic Trails</h4>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
        {/* Trail Dropdown */}
        <select
          style={{
            width: "100%",
            background: "rgba(10, 12, 28, 0.8)",
            border: "1px solid rgba(122, 200, 255, 0.25)",
            borderRadius: "4px",
            color: "#fff",
            padding: "0.5rem",
            fontSize: "0.84rem"
          }}
          value={currentTrail}
          onChange={(e) => setTrail(e.target.value)}
        >
          <option value="blue">🔵 Blue Nebula (Default)</option>
          <option value="neon" disabled={!hasConsistent}>
            {hasConsistent ? "💖 Hyperdrive Neon (Pink-Cyan)" : "🔒 Hyperdrive Neon (Consistent Pilot streak)"}
          </option>
          <option value="gold" disabled={!hasSectorPioneer}>
            {hasSectorPioneer ? "💛 Solar Gold Exhaust" : "🔒 Solar Gold Exhaust (Sector Pioneer path)"}
          </option>
          <option value="purple" disabled={!hasGrandRestorer}>
            {hasGrandRestorer ? "💜 Void Purple Flare" : "🔒 Void Purple Flare (Grand Restorer path)"}
          </option>
        </select>
      </div>

      {/* SECTION: Background Figurines */}
      <h4 style={{ margin: "1rem 0 0.5rem 0", color: "var(--accent)" }}>🪐 Deep Space Figurines</h4>
      <p style={{ fontSize: "0.76rem", opacity: 0.7, margin: "0 0 1rem 0" }}>
        Select monuments to mount in the distant starry background.
      </p>

      {/* SLOT 1 SELECTION */}
      <div style={{ marginBottom: "1.25rem" }}>
        <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: "0.35rem" }}>
          Background Slot 1
        </label>
        <select
          style={{
            width: "100%",
            background: "rgba(10, 12, 28, 0.8)",
            border: "1px solid rgba(122, 200, 255, 0.25)",
            borderRadius: "4px",
            color: "#fff",
            padding: "0.4rem",
            fontSize: "0.82rem"
          }}
          value={currentFig1}
          onChange={(e) => setFig1(e.target.value)}
        >
          <option value="none">None (Empty Void)</option>
          <option value="station">🌐 Waystation Figurine</option>
          <option value="satellite">🛰️ Aura Beacon Figurine</option>
          <option value="star_center" disabled={!isStarUnlocked}>
            {isStarUnlocked ? "🌟 Solar Monument (Star Center)" : "🔒 Solar Monument (100 memories)"}
          </option>
          <option value="dyson_sphere" disabled={!isDysonUnlocked}>
            {isDysonUnlocked ? "🪐 Dyson Megastructure (Dyson Sphere)" : "🔒 Dyson Megastructure (250 memories)"}
          </option>
          <option value="quantum_core" disabled={!hasDeepCluster}>
            {hasDeepCluster ? "🌌 Quantum Singularity Core" : "🔒 Quantum Singularity Core (Deep Cluster)"}
          </option>
          <option value="hyper_array" disabled={!hasMegastructure}>
            {hasMegastructure ? "📡 Synapse Hyper-Array" : "🔒 Synapse Hyper-Array (Galactic Megastructure)"}
          </option>
          <option value="shield_spire" disabled={!hasPathfinder}>
            {hasPathfinder ? "🛡️ Aegis Shield Spire" : "🔒 Aegis Shield Spire (Pathfinder Quest)"}
          </option>
        </select>
      </div>

      {/* SLOT 2 SELECTION */}
      <div style={{ marginBottom: "1rem" }}>
        <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: "0.35rem" }}>
          Background Slot 2
        </label>
        <select
          style={{
            width: "100%",
            background: "rgba(10, 12, 28, 0.8)",
            border: "1px solid rgba(122, 200, 255, 0.25)",
            borderRadius: "4px",
            color: "#fff",
            padding: "0.4rem",
            fontSize: "0.82rem"
          }}
          value={currentFig2}
          onChange={(e) => setFig2(e.target.value)}
        >
          <option value="none">None (Empty Void)</option>
          <option value="station">🌐 Waystation Figurine</option>
          <option value="satellite">🛰️ Aura Beacon Figurine</option>
          <option value="star_center" disabled={!isStarUnlocked}>
            {isStarUnlocked ? "🌟 Solar Monument (Star Center)" : "🔒 Solar Monument (100 memories)"}
          </option>
          <option value="dyson_sphere" disabled={!isDysonUnlocked}>
            {isDysonUnlocked ? "🪐 Dyson Megastructure (Dyson Sphere)" : "🔒 Dyson Megastructure (250 memories)"}
          </option>
          <option value="quantum_core" disabled={!hasDeepCluster}>
            {hasDeepCluster ? "🌌 Quantum Singularity Core" : "🔒 Quantum Singularity Core (Deep Cluster)"}
          </option>
          <option value="hyper_array" disabled={!hasMegastructure}>
            {hasMegastructure ? "📡 Synapse Hyper-Array" : "🔒 Synapse Hyper-Array (Galactic Megastructure)"}
          </option>
          <option value="shield_spire" disabled={!hasPathfinder}>
            {hasPathfinder ? "🛡️ Aegis Shield Spire" : "🔒 Aegis Shield Spire (Pathfinder Quest)"}
          </option>
        </select>
      </div>
    </div>
  );
}
