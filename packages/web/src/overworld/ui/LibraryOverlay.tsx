import { useState } from "react";
import type { GraphData } from "@brain/shared";
import { search, type SearchHit } from "../../api/client.js";
import { groupIntoFolders } from "../data/libraryFolders.js";
import { recordBuildingWork } from "../data/npcJobs.js";

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
 */
export function LibraryOverlay({ graph, spaceId, onClose }: LibraryOverlayProps) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const runSearch = async () => {
    const q = query.trim();
    if (!q) {
      setHits(null);
      return;
    }
    setSearching(true);
    try {
      setHits(await search(q));
      recordBuildingWork(spaceId, "library");
    } finally {
      setSearching(false);
    }
  };

  const folders = groupIntoFolders(graph.nodes);

  return (
    <div
      role="dialog"
      aria-label="Library"
      style={{
        position: "absolute",
        inset: 0,
        background: "#12142a",
        color: "#f4f1ff",
        padding: 16,
        fontFamily: "monospace",
        overflowY: "auto",
      }}
    >
      <h2 style={{ marginTop: 0 }}>📚 Library</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          aria-label="Search the library"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
          placeholder="Search your whole brain..."
          style={{ flex: 1 }}
        />
        <button type="button" onClick={runSearch} disabled={!query.trim() || searching}>
          {searching ? "…" : "Search"}
        </button>
        {hits && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setHits(null);
            }}
          >
            Clear
          </button>
        )}
      </div>

      {hits ? (
        <>
          <h3>Results</h3>
          {hits.length === 0 ? (
            <p>Nothing matched "{query}".</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0 }}>
              {hits.map((h) => (
                <li key={h.id} style={{ padding: "4px 0" }}>
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
              style={{ display: "block", width: "100%", textAlign: "left" }}
            >
              {expanded === folder.key ? "▾" : "▸"} {folder.label} ({folder.nodes.length})
            </button>
            {expanded === folder.key && (
              <ul style={{ listStyle: "none", padding: "0 0 0 16px" }}>
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

      <button type="button" onClick={onClose}>
        Leave
      </button>
    </div>
  );
}
