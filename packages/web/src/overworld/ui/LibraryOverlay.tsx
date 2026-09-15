import { useEffect, useState } from "react";
import type { GraphData, Lens } from "@brain/shared";
import { createLens, deleteLens, getLenses, lensNodes, search, type SearchHit } from "../../api/client.js";
import { groupIntoFolders } from "../data/libraryFolders.js";
import { recordBuildingWork } from "../data/npcJobs.js";
import { actionButtonStyle, ConfirmButton, fieldStyle, OverlayShell } from "./OverlayShell.js";

export interface LibraryOverlayProps {
  graph: GraphData;
  spaceId: string;
  onClose: () => void;
}

/**
 * The Library (Browse tab equivalent) — card-catalog shelves grouped exactly like
 * LibraryPanel.tsx's FOLDER_ORDER when browsing, and the real full-text `search()` (hits
 * the whole brain, not just the region's capped creature sample) once you type a query.
 * A real search performed is the Library's own real work event (npc-economy.md).
 *
 * Lenses (revived, docs/overworld/lenses-revival.md, task #72) — the server's real saved-query
 * feature, orphaned when the old galaxy UI was deleted. This round ships a real, minimal
 * vertical slice: a lens is exactly the search you just typed, saved and re-runnable by name.
 * The other 7 real query fields the server supports are deliberately deferred, not invented.
 */
export function LibraryOverlay({ graph, spaceId, onClose }: LibraryOverlayProps) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [activeLens, setActiveLens] = useState<Lens | null>(null);
  const [activeLensNodeIds, setActiveLensNodeIds] = useState<number[] | null>(null);
  const [savingLens, setSavingLens] = useState(false);

  useEffect(() => {
    void getLenses().then(setLenses);
  }, []);

  const runSearch = async () => {
    const q = query.trim();
    if (!q) {
      setHits(null);
      return;
    }
    setActiveLens(null);
    setActiveLensNodeIds(null);
    setSearching(true);
    try {
      setHits(await search(q));
      recordBuildingWork(spaceId, "library");
    } finally {
      setSearching(false);
    }
  };

  const saveSearchAsLens = async () => {
    const q = query.trim();
    if (!q) return;
    setSavingLens(true);
    try {
      const created = await createLens(q, { text: q });
      if (created) setLenses((prev) => [...prev, created]);
    } finally {
      setSavingLens(false);
    }
  };

  const viewLens = async (lens: Lens) => {
    setHits(null);
    setActiveLens(lens);
    setActiveLensNodeIds(await lensNodes(lens.id));
  };

  const removeLens = async (lens: Lens) => {
    if (await deleteLens(lens.id)) {
      setLenses((prev) => prev.filter((l) => l.id !== lens.id));
      if (activeLens?.id === lens.id) {
        setActiveLens(null);
        setActiveLensNodeIds(null);
      }
    }
  };

  const folders = groupIntoFolders(graph.nodes);
  const lensResultNodes = activeLensNodeIds ? graph.nodes.filter((n) => activeLensNodeIds.includes(n.id)) : null;
  const alreadySaved = lenses.some((l) => l.query.text === query.trim());

  return (
    <OverlayShell icon="📚" title="Library" onClose={onClose}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          aria-label="Search the library"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
          placeholder="Search your whole brain..."
          style={{ ...fieldStyle, flex: 1 }}
        />
        <button type="button" onClick={runSearch} disabled={!query.trim() || searching} style={actionButtonStyle(!query.trim() || searching)}>
          {searching ? "…" : "Search"}
        </button>
        {hits && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setHits(null);
            }}
            style={actionButtonStyle()}
          >
            Clear
          </button>
        )}
      </div>
      {hits && hits.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            onClick={saveSearchAsLens}
            disabled={savingLens || alreadySaved}
            style={actionButtonStyle(savingLens || alreadySaved)}
          >
            {alreadySaved ? "🔎 Already saved" : savingLens ? "…" : "🔎 Save this search as a Lens"}
          </button>
        </div>
      )}

      <h3 style={{ marginTop: 0 }}>Saved Lenses</h3>
      {lenses.length === 0 ? (
        <p style={{ marginTop: 0 }}>No lenses saved yet — search for something, then save it as a Lens.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px" }}>
          {lenses.map((lens) => (
            <li key={lens.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #2a2c55" }}>
              <span aria-hidden="true">{lens.pinned ? "📌" : "🔎"}</span>
              <span style={{ flex: 1 }}>
                {lens.name} {lens.count != null && <span style={{ opacity: 0.6 }}>({lens.count})</span>}
              </span>
              <button
                type="button"
                onClick={() => void viewLens(lens)}
                disabled={activeLens?.id === lens.id}
                style={actionButtonStyle(activeLens?.id === lens.id)}
              >
                {activeLens?.id === lens.id ? "Viewing" : "View"}
              </button>
              <ConfirmButton label="Delete" confirmLabel="Really delete?" ariaLabel={`Delete ${lens.name}`} onConfirm={() => void removeLens(lens)} />
            </li>
          ))}
        </ul>
      )}

      {lensResultNodes ? (
        <>
          <h3>{activeLens?.name}</h3>
          <button
            type="button"
            onClick={() => {
              setActiveLens(null);
              setActiveLensNodeIds(null);
            }}
            style={{ ...actionButtonStyle(), marginBottom: 8 }}
          >
            ← Back to shelves
          </button>
          {lensResultNodes.length === 0 ? (
            <p>Nothing currently matches this lens.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {lensResultNodes.map((n) => (
                <li key={n.id} style={{ padding: "6px 0", borderBottom: "1px solid #2a2c55" }}>
                  {n.label} <span style={{ opacity: 0.6 }}>({n.type})</span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : hits ? (
        <>
          <h3>Results</h3>
          {hits.length === 0 ? (
            <p>Nothing matched "{query}".</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {hits.map((h) => (
                <li key={h.id} style={{ padding: "6px 0", borderBottom: "1px solid #2a2c55" }}>
                  {h.label} <span style={{ opacity: 0.6 }}>({h.type})</span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : folders.length === 0 ? (
        <p>Your library is empty so far — capture a thought out in the field to fill a shelf.</p>
      ) : (
        folders.map((folder) => (
          <div key={folder.key} style={{ marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => setExpanded(expanded === folder.key ? null : folder.key)}
              style={{ ...actionButtonStyle(), display: "block", width: "100%", textAlign: "left" }}
            >
              {expanded === folder.key ? "▾" : "▸"} {folder.label} ({folder.nodes.length})
            </button>
            {expanded === folder.key && (
              <ul style={{ listStyle: "none", padding: "0 0 0 16px", margin: "4px 0 0" }}>
                {folder.nodes.map((n) => (
                  <li key={n.id} style={{ padding: "2px 0" }}>
                    {n.label}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))
      )}
    </OverlayShell>
  );
}
