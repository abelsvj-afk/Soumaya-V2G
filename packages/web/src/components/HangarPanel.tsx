import { loadUnlocked } from "./achievements.js";

interface HangarPanelProps {
  spaceId: string;
  memoriesCount: number;
  onEquipChanged: () => void;
}

export function HangarPanel({ spaceId, memoriesCount, onEquipChanged }: HangarPanelProps) {
  // Load unlocked achievements from localStorage to determine which items are available
  const unlocked = loadUnlocked(spaceId);

  // Active selections (from localStorage)
  const shipKey = `brain.hangar.ship.${spaceId}`;
  const trailKey = `brain.hangar.trail.${spaceId}`;
  const fig1Key = `brain.hangar.fig1.${spaceId}`;
  const fig2Key = `brain.hangar.fig2.${spaceId}`;
  const focusFig1Key = `brain.hangar.focusFig1.${spaceId}`;
  const focusFig2Key = `brain.hangar.focusFig2.${spaceId}`;

  const currentShip = localStorage.getItem(shipKey) || "default";
  const currentTrail = localStorage.getItem(trailKey) || "blue";
  const currentFig1 = localStorage.getItem(fig1Key) || "none";
  const currentFig2 = localStorage.getItem(fig2Key) || "none";
  const currentFocusFig1 = localStorage.getItem(focusFig1Key) !== "false";
  const currentFocusFig2 = localStorage.getItem(focusFig2Key) !== "false";

  // Count-gated cosmetics ride the Pilot Rank ladder (raw memory counts) — the
  // old per-threshold achievements double-celebrated the same growth. Legacy ids
  // are still honored so nothing a pilot already earned re-locks.
  const isStarUnlocked = unlocked.has("star_center_figurine") || memoriesCount >= 100;
  const isOrganicUnlocked = unlocked.has("organic_ship_skin") || memoriesCount >= 150;
  const isDysonUnlocked = unlocked.has("dyson_sphere_figurine") || memoriesCount >= 250;
  const hasSingularity = unlocked.has("singularity") || memoriesCount >= 365;

  // Feat-gated cosmetics (achievements proper)
  const hasPathfinder = unlocked.has("pathfinder_quest");
  const hasConsistent = unlocked.has("consistent_pilot");
  const hasSectorPioneer = unlocked.has("sector_pioneer");
  const hasSentinel = unlocked.has("sentinel_command");
  const hasDeepCluster = unlocked.has("deep_cluster");
  const hasCosmicVoyager = unlocked.has("cosmic_voyager");
  const hasMegastructure = unlocked.has("galactic_megastructure");
  const hasGrandRestorer = unlocked.has("grand_restorer");

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
          <option value="blackhole" disabled={!hasSingularity}>
            {hasSingularity ? "🕳️ The Singularity (Black Hole)" : "🔒 The Singularity (365 memories)"}
          </option>
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem", marginTop: "0.45rem", cursor: "pointer", opacity: currentFig1 === "none" ? 0.5 : 1 }}>
          <input
            type="checkbox"
            disabled={currentFig1 === "none"}
            checked={currentFocusFig1}
            onChange={(e) => {
              localStorage.setItem(focusFig1Key, e.target.checked ? "true" : "false");
              onEquipChanged();
            }}
          />
          Show camera focus button on HUD
        </label>
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
          <option value="blackhole" disabled={!hasSingularity}>
            {hasSingularity ? "🕳️ The Singularity (Black Hole)" : "🔒 The Singularity (365 memories)"}
          </option>
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem", marginTop: "0.45rem", cursor: "pointer", opacity: currentFig2 === "none" ? 0.5 : 1 }}>
          <input
            type="checkbox"
            disabled={currentFig2 === "none"}
            checked={currentFocusFig2}
            onChange={(e) => {
              localStorage.setItem(focusFig2Key, e.target.checked ? "true" : "false");
              onEquipChanged();
            }}
          />
          Show camera focus button on HUD
        </label>
      </div>
    </div>
  );
}
