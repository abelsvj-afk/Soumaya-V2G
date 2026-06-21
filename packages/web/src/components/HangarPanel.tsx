import { loadUnlocked } from "./achievements.js";

interface HangarPanelProps {
  spaceId: string;
  memoriesCount: number;
  onEquipChanged: () => void;
}

export function HangarPanel({ spaceId, memoriesCount, onEquipChanged }: HangarPanelProps) {
  // Load unlocked achievements from localStorage to determine which items are available
  const unlocked = loadUnlocked(spaceId);

  // Unlocked predicates
  const isStarUnlocked = unlocked.has("star_center_figurine") || memoriesCount >= 100;
  const isOrganicUnlocked = unlocked.has("organic_ship_skin") || memoriesCount >= 150;
  const isDysonUnlocked = unlocked.has("dyson_sphere_figurine") || memoriesCount >= 250;

  // Active selections (from localStorage)
  const shipKey = `brain.hangar.ship.${spaceId}`;
  const fig1Key = `brain.hangar.fig1.${spaceId}`;
  const fig2Key = `brain.hangar.fig2.${spaceId}`;

  const currentShip = localStorage.getItem(shipKey) || "default";
  const currentFig1 = localStorage.getItem(fig1Key) || "none";
  const currentFig2 = localStorage.getItem(fig2Key) || "none";

  const setShip = (val: string) => {
    localStorage.setItem(shipKey, val);
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
    <div className="dock-body hangar">
      <div className="awards-head">
        <h3 className="awards-title">🛠️ Hangar</h3>
      </div>
      <p style={{ fontSize: "0.82rem", opacity: 0.8, margin: "0 0 1.25rem 0" }}>
        Customize Soumaya's spaceship hull and place gigantic, civilization-scale monuments in the deep space background.
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
        </select>
      </div>

      {/* SLOT 2 SELECTION */}
      <div>
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
        </select>
      </div>
    </div>
  );
}
