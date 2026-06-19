import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { GraphData, GraphNode } from "@brain/shared";

/** Pop-up offset for an item in the focus cluster (stacks upward when open). */
function focusItemStyle(index: number, open: boolean): CSSProperties {
  return open
    ? { transform: `translateY(${-(index + 1) * 54}px)`, opacity: 1, pointerEvents: "auto" }
    : { transform: "translateY(0) scale(0.4)", opacity: 0, pointerEvents: "none" };
}
import { Graph3D, type Graph3DHandle } from "./graph/Graph3D.js";
import { makeDemoGalaxy } from "./graph/demoGalaxy.js";
import { makeAmbientAudio, type AmbientAudio } from "./graph/audio.js";
import { IngestPanel } from "./components/IngestPanel.js";
import { SearchBox } from "./components/SearchBox.js";
import { RightDock, type DockTab } from "./components/RightDock.js";
import { HelpPanel } from "./components/HelpPanel.js";
import { LoginScreen } from "./components/LoginScreen.js";
import { ObjectLoreCard } from "./components/ObjectLoreCard.js";
import {
  currentSpace,
  getGraph,
  getHealth,
  logoutSpace,
  onAiActivity,
  tendNode,
  type Health,
} from "./api/client.js";

type Panel = "search" | "ingest" | "dock" | null;

export default function App() {
  const [space, setSpace] = useState<{ id: string; name: string } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [tab, setTab] = useState<DockTab>("details");
  const [demo, setDemo] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [loaded, setLoaded] = useState(false);
  const [history, setHistory] = useState<number[]>([]);
  const [aiBusy, setAiBusy] = useState(0);
  const [music, setMusic] = useState(false);
  const [followShip, setFollowShip] = useState(false);
  const [followStation, setFollowStation] = useState(false);
  const [followSatellite, setFollowSatellite] = useState(false);
  const [satelliteCount, setSatelliteCount] = useState(0);
  const [visitorCount, setVisitorCount] = useState(0);
  const [followVisitor, setFollowVisitor] = useState(false);
  // Lore card dismissed independently of the camera follow (× closes the card but
  // keeps focus). Reset to false whenever a new focus target is chosen.
  const [loreDismissed, setLoreDismissed] = useState(false);
  // Show Soumaya's current task on a floating label above her ship (persisted).
  const [showShipTask, setShowShipTask] = useState(() => localStorage.getItem("ship.task") !== "0");
  useEffect(() => {
    localStorage.setItem("ship.task", showShipTask ? "1" : "0");
  }, [showShipTask]);
  // Transient glow on the focus button when a NEW beacon launches (not constant).
  const [beaconPulse, setBeaconPulse] = useState(false);
  const prevSatRef = useRef(0);
  const [focusMenuOpen, setFocusMenuOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [clustered, setClustered] = useState(false);
  const audioRef = useRef<AmbientAudio | null>(null);
  const graphRef = useRef<Graph3DHandle>(null);

  useEffect(() => onAiActivity(setAiBusy), []);

  // Create the ambient audio on mount so the loop preloads/buffers before the
  // first 🔈 toggle (otherwise it lags on slow/mobile connections).
  useEffect(() => {
    if (!audioRef.current) audioRef.current = makeAmbientAudio();
  }, []);

  const toggleMusic = useCallback(() => {
    if (!audioRef.current) audioRef.current = makeAmbientAudio();
    setMusic(audioRef.current.toggle());
  }, []);

  // A fake "fuller galaxy" preview — generated once, never persisted/weighted.
  const demoData = useMemo(() => makeDemoGalaxy(), []);
  const view = demo ? demoData : data;

  const refresh = useCallback(async (newIds?: number[], fuelEarned?: number) => {
    try {
      const g = await getGraph();
      setData(g);
      if (newIds && newIds.length > 0) {
        // Give the graph a moment to render the new nodes before rippling them.
        setTimeout(() => {
          for (const id of newIds) graphRef.current?.spawnBurst(id, "user");
          // A warm amber sparkle on the new memory celebrates the fuel it earned.
          if (fuelEarned && fuelEarned > 0)
            for (const id of newIds) graphRef.current?.spawnBurst(id, "fuel");
        }, 150);
        // Then fly the camera to the new memory so you can SEE where it populated.
        setTimeout(() => {
          graphRef.current?.focusNode(newIds[0]!);
          setSelected(g.nodes.find((n) => n.id === newIds[0]) ?? null);
        }, 550);
      }
    } finally {
      setLoaded(true);
    }
    getHealth()
      .then(setHealth)
      .catch(() => {});
  }, []);

  // If every beacon fades (its memory got tended) while we're watching one, the
  // beacon button vanishes — so release the follow + close its lore card too.
  useEffect(() => {
    if (followSatellite && satelliteCount === 0) {
      graphRef.current?.recenter();
      setFollowSatellite(false);
    }
  }, [satelliteCount, followSatellite]);

  // Pulse the focus button briefly only when a NEW beacon launches, then stop.
  useEffect(() => {
    if (satelliteCount > prevSatRef.current) {
      setBeaconPulse(true);
      const t = window.setTimeout(() => setBeaconPulse(false), 3600);
      prevSatRef.current = satelliteCount;
      return () => window.clearTimeout(t);
    }
    prevSatRef.current = satelliteCount;
  }, [satelliteCount]);

  // Release the visitor follow when the craft we're watching leaves.
  useEffect(() => {
    if (followVisitor && visitorCount === 0) {
      graphRef.current?.recenter();
      setFollowVisitor(false);
    }
  }, [visitorCount, followVisitor]);

  // Resolve the stored brain (if any) on first load.
  useEffect(() => {
    currentSpace()
      .then(setSpace)
      .finally(() => setAuthChecked(true));
  }, []);

  // Load the galaxy once a brain is open.
  useEffect(() => {
    if (space) refresh();
  }, [space]);

  // Navigate to a memory, recording where we came from so Back works.
  const goTo = useCallback(
    (id: number, record = true, ripple = false) => {
      const n = view.nodes.find((x) => x.id === id);
      if (!n) return;
      setHistory((h) => (record && selected && selected.id !== id ? [...h, selected.id] : h));
      setSelected(n);
      setTab("details");
      setPanel("dock");
      graphRef.current?.focusNode(id);
      if (ripple) graphRef.current?.spawnBurst(id, "user");
      if (!demo) void tendNode(id); // revisiting a memory warms it back up (entropy)
    },
    [view, selected, demo],
  );

  const focus = useCallback((id: number) => goTo(id, true, true), [goTo]);

  const triggerFlashback = useCallback(() => {
    // Find an old, high-mass memory (Serendipity hook)
    const candidates = view.nodes.filter(n => {
      if (!n.createdAt || !n.mass) return false;
      const rawDate = n.createdAt;
      const isoDate = rawDate.includes("Z") ? rawDate : rawDate.replace(" ", "T") + "Z";
      const ageDays = (Date.now() - Date.parse(isoDate)) / (1000 * 60 * 60 * 24);
      return ageDays > 7 && n.mass > 0.3; 
    });
    
    if (candidates.length > 0) {
      // Pick a random candidate
      const target = candidates[Math.floor(Math.random() * candidates.length)]!;
      goTo(target.id, true);
      // Spawn a special calibration/synthesis burst to draw attention
      graphRef.current?.spawnBurst(target.id, "calibration");
    } else {
      // Fallback if the brain is too young
      const all = view.nodes.filter(n => n.mass && n.mass > 0.2);
      if (all.length > 0) {
        const target = all[Math.floor(Math.random() * all.length)]!;
        goTo(target.id, true);
        graphRef.current?.spawnBurst(target.id, "calibration");
      }
    }
  }, [view, goTo]);

  const back = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const id = h[h.length - 1]!;
      const n = view.nodes.find((x) => x.id === id);
      if (n) {
        setSelected(n);
        setTab("details");
        setPanel("dock");
        graphRef.current?.focusNode(id);
      }
      return h.slice(0, -1);
    });
  }, [view]);

  // After a weight edit: re-pull the graph (mass/celestial recompute), keep
  // the node selected, no camera move.
  const handleChanged = useCallback(async (id: number) => {
    const g = await getGraph();
    setData(g);
    const n = g.nodes.find((x) => x.id === id);
    if (n) {
      setSelected(n);
      graphRef.current?.spawnBurst(id, "user");
    }
  }, []);

  const handleDeleted = useCallback(() => {
    setSelected(null);
    setPanel(null);
    setHistory([]);
    void refresh();
  }, [refresh]);

  const toggle = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));

  const llmStatus = health
    ? health.llm.available
      ? health.llm.model
      : health.llm.degraded
        ? `${health.llm.model} · offline mode`
        : "heuristic mode"
    : "";

  // Gate: wait for the auth check, then require an open brain.
  if (!authChecked) {
    return (
      <div className="loading">
        <div className="loader-orb" />
        <p>Aligning the stars…</p>
      </div>
    );
  }
  if (!space) {
    return <LoginScreen onAuthed={setSpace} />;
  }

  return (
    <div className="app">
      <Graph3D
        ref={graphRef}
        data={view}
        onSelect={(node) => focus(node.id)}
        onSoumayaClick={() => {
          setTab("chat"); // tapping her ship = talk to Soumaya
          setPanel("dock");
        }}
        onSatelliteCount={setSatelliteCount}
        onVisitorCount={setVisitorCount}
        selectedId={selected?.id ?? null}
        bottomInset={panel === "dock"}
        demo={demo}
        showShipTask={showShipTask}
      />

      {!loaded && (
        <div className="loading">
          <div className="loader-orb" />
          <p>Mapping your galaxy…</p>
        </div>
      )}

      {aiBusy > 0 && (
        <div className="ai-busy">
          <span className="ai-dot" /> Soumaya is thinking…
        </div>
      )}

      <header className="brand">
        <h1>
          Soumaya <span className="sep">·</span> Second Brain
        </h1>
        <div className="brand-row">
          <button
            className="chip-btn"
            onClick={() => {
              setSelected(null);
              setClustered(false);
              graphRef.current?.exitCluster();
              setDemo((d) => !d);
            }}
          >
            {demo ? "← Back to mine" : "✨ Demo galaxy"}
          </button>
          {health && (
            <span className="status">
              {(demo ? demoData : data).nodes.length} memories · {llmStatus}
            </span>
          )}
          <button
            className="chip-btn"
            title={`Signed in as "${space.name}" — switch brain`}
            onClick={() => {
              logoutSpace();
              setSpace(null);
              setData({ nodes: [], links: [] });
              setSelected(null);
              setPanel(null);
            }}
          >
            {space.name} ⏏
          </button>
        </div>
      </header>

      {help && <HelpPanel onClose={() => setHelp(false)} />}

      {/* Evolving lore for the focused object (station / ship / beacon). Hidden while a
          panel is open or when dismissed — dismissing keeps the camera focus. */}
      {(followStation || followShip || followSatellite) && panel === null && !loreDismissed && (
        <ObjectLoreCard
          kind={followShip ? "ship" : followSatellite ? "satellite" : "station"}
          graph={view}
          onClose={() => setLoreDismissed(true)}
        />
      )}

      {clustered && (
        <button
          className="exit-cluster"
          onClick={() => {
            graphRef.current?.exitCluster();
            setClustered(false);
          }}
        >
          ✕ Exit system view
        </button>
      )}

      {/* Floating controls — hidden while a panel is open so they never cover it */}
      {panel === null && (
        <>
          <button className="fab fab-search" onClick={() => toggle("search")} aria-label="Search">
            🔍
          </button>
          <button className="fab fab-flashback" onClick={triggerFlashback} aria-label="Flashback (Serendipity)" title="Surprise me with an old memory">
            ☄️
          </button>
          <button className="fab fab-help" onClick={() => setHelp(true)} aria-label="Help / guide">
            ?
          </button>
          <button className="fab fab-dock" onClick={() => toggle("dock")} aria-label="Panels">
            ☰
          </button>
          <button
            className="fab fab-recenter"
            onClick={() => {
              graphRef.current?.recenter();
              setFollowShip(false);
              setFollowStation(false);
              setFollowSatellite(false);
              setFocusMenuOpen(false);
              setClustered(false);
            }}
            aria-label="Recenter galaxy"
            title="Recenter the galaxy"
          >
            ⊙
          </button>
          {/* On-screen zoom (works when pinch/trackpad zoom fails). */}
          <button
            className="fab fab-zoom-in"
            onClick={() => graphRef.current?.zoomBy(0.8)}
            aria-label="Zoom in"
            title="Zoom in"
          >
            ＋
          </button>
          <button
            className="fab fab-zoom-out"
            onClick={() => graphRef.current?.zoomBy(1.25)}
            aria-label="Zoom out"
            title="Zoom out"
          >
            －
          </button>
          {/* Game-style focus cluster: one button that pops up the camera targets. */}
          <div className={`focus-cluster ${focusMenuOpen ? "open" : ""}`}>
            <button
              className={`fab focus-item ${followShip ? "on" : ""}`}
              style={focusItemStyle(0, focusMenuOpen)}
              onClick={() => {
                setLoreDismissed(false);
                setFollowShip(graphRef.current?.toggleFollowShip() ?? false);
                setFollowStation(false);
                setFollowSatellite(false);
                setFocusMenuOpen(false);
              }}
              aria-label="Focus Soumaya"
              title="Focus Soumaya's ship"
            >
              🛸
            </button>
            <button
              className={`fab focus-item ${followStation ? "on" : ""}`}
              style={focusItemStyle(1, focusMenuOpen)}
              onClick={() => {
                setLoreDismissed(false);
                setFollowStation(graphRef.current?.toggleFollowStation() ?? false);
                setFollowShip(false);
                setFollowSatellite(false);
                setFocusMenuOpen(false);
              }}
              aria-label="Focus space station"
              title="Focus the space station"
            >
              🌐
            </button>
            {satelliteCount > 0 && (
              <button
                className={`fab focus-item beacon-item ${followSatellite ? "on" : ""}`}
                style={focusItemStyle(2, focusMenuOpen)}
                onClick={() => {
                  setLoreDismissed(false);
                  const on = graphRef.current?.cycleFollowSatellite() ?? false;
                  setFollowSatellite(on);
                  setFollowShip(false);
                  setFollowStation(false);
                  setFollowVisitor(false);
                  // keep menu open so you can cycle through multiple beacons
                }}
                aria-label="Jump to an Aura beacon"
                title={`Jump to a beacon (${satelliteCount} deployed over cooling memories)`}
              >
                🛰️
              </button>
            )}
            {visitorCount > 0 && (
              <button
                className={`fab focus-item visitor-item ${followVisitor ? "on" : ""}`}
                style={focusItemStyle(satelliteCount > 0 ? 3 : 2, focusMenuOpen)}
                onClick={() => {
                  const on = graphRef.current?.cycleFollowVisitor() ?? false;
                  setFollowVisitor(on);
                  setFollowShip(false);
                  setFollowStation(false);
                  setFollowSatellite(false);
                }}
                aria-label="Jump to a visitor"
                title={`Jump to a visitor (${visitorCount} drifting in)`}
              >
                👽
              </button>
            )}
            <button
              className={`fab focus-main ${focusMenuOpen ? "active" : ""} ${
                (followShip || followStation || followSatellite || followVisitor) && !focusMenuOpen ? "on" : ""
              } ${beaconPulse ? "pulse" : ""}`}
              onClick={() => setFocusMenuOpen((o) => !o)}
              aria-label="Camera focus targets"
              title="Focus targets (ship · station · beacons)"
            >
              {focusMenuOpen ? "✕" : "🎯"}
            </button>
          </div>
          <button
            className={`fab fab-music ${music ? "on" : ""}`}
            onClick={toggleMusic}
            aria-label="Toggle ambient music"
            title="Ambient space music"
          >
            {music ? "🔊" : "🔈"}
          </button>
          <button className="fab fab-ingest" onClick={() => toggle("ingest")} aria-label="Add a memory">
            ＋
          </button>
        </>
      )}

      {panel === "search" && <SearchBox onFocus={focus} onClose={() => setPanel(null)} />}
      {panel === "ingest" && (
        <IngestPanel onIngested={refresh} onClose={() => setPanel(null)} />
      )}
      {panel === "dock" && (
        <RightDock
          tab={tab}
          setTab={setTab}
          selected={selected}
          graph={view}
          onFocus={focus}
          onChanged={demo ? undefined : handleChanged}
          onDeleted={demo ? undefined : handleDeleted}
          onIsolate={(id) => {
            graphRef.current?.isolateSystem(id);
            setClustered(true);
            setPanel(null);
          }}
          onClose={() => setPanel(null)}
          onBack={back}
          canBack={history.length > 0}
          demo={demo}
          getFleetStatus={() => graphRef.current?.getFleetStatus()}
          showShipTask={showShipTask}
          setShowShipTask={setShowShipTask}
        />
      )}
    </div>
  );
}
