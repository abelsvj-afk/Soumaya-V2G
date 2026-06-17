import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphData, GraphNode } from "@brain/shared";
import { Graph3D, type Graph3DHandle } from "./graph/Graph3D.js";
import { makeDemoGalaxy } from "./graph/demoGalaxy.js";
import { makeAmbientAudio, type AmbientAudio } from "./graph/audio.js";
import { IngestPanel } from "./components/IngestPanel.js";
import { SearchBox } from "./components/SearchBox.js";
import { RightDock, type DockTab } from "./components/RightDock.js";
import { HelpPanel } from "./components/HelpPanel.js";
import { LoginScreen } from "./components/LoginScreen.js";
import {
  currentSpace,
  getGraph,
  getHealth,
  logoutSpace,
  onAiActivity,
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
  const [help, setHelp] = useState(false);
  const [clustered, setClustered] = useState(false);
  const audioRef = useRef<AmbientAudio | null>(null);
  const graphRef = useRef<Graph3DHandle>(null);

  useEffect(() => onAiActivity(setAiBusy), []);

  const toggleMusic = useCallback(() => {
    if (!audioRef.current) audioRef.current = makeAmbientAudio();
    setMusic(audioRef.current.toggle());
  }, []);

  // A fake "fuller galaxy" preview — generated once, never persisted/weighted.
  const demoData = useMemo(() => makeDemoGalaxy(), []);
  const view = demo ? demoData : data;

  const refresh = useCallback(async () => {
    try {
      setData(await getGraph());
    } finally {
      setLoaded(true); // reveal the galaxy even if the first fetch failed
    }
    getHealth()
      .then(setHealth)
      .catch(() => {});
  }, []);

  // Resolve the stored brain (if any) on first load.
  useEffect(() => {
    currentSpace()
      .then(setSpace)
      .finally(() => setAuthChecked(true));
  }, []);

  // Load the galaxy once a brain is open.
  useEffect(() => {
    if (space) refresh();
  }, [space, refresh]);

  // Navigate to a memory, recording where we came from so Back works.
  const goTo = useCallback(
    (id: number, record = true) => {
      const n = view.nodes.find((x) => x.id === id);
      if (!n) return;
      setHistory((h) => (record && selected && selected.id !== id ? [...h, selected.id] : h));
      setSelected(n);
      setTab("details");
      setPanel("dock");
      graphRef.current?.focusNode(id);
    },
    [view, selected],
  );

  const select = useCallback((node: GraphNode) => goTo(node.id), [goTo]);
  const focus = useCallback((id: number) => goTo(id), [goTo]);

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
    if (n) setSelected(n);
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
        onSelect={select}
        onSoumayaClick={() => {
          setTab("chat"); // tapping her ship = talk to Soumaya
          setPanel("dock");
        }}
        selectedId={selected?.id ?? null}
        bottomInset={panel === "dock"}
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
              setClustered(false);
            }}
            aria-label="Recenter galaxy"
            title="Recenter the galaxy"
          >
            ⊙
          </button>
          <button
            className={`fab fab-ship ${followShip ? "on" : ""}`}
            onClick={() => {
              setFollowShip(graphRef.current?.toggleFollowShip() ?? false);
              setFollowStation(false);
            }}
            aria-label="Focus Soumaya"
            title="Focus Soumaya's ship"
          >
            🛸
          </button>
          <button
            className={`fab fab-station ${followStation ? "on" : ""}`}
            onClick={() => {
              setFollowStation(graphRef.current?.toggleFollowStation() ?? false);
              setFollowShip(false);
            }}
            aria-label="Focus space station"
            title="Focus the space station"
          >
            🛰️
          </button>
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
        />
      )}
    </div>
  );
}
