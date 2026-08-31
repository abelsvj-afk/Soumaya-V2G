import { useEffect, useMemo, useState } from "react";
import type { GraphData, GraphNode, NodeType } from "@brain/shared";
import { NODE_TYPE_LABEL, normalizeNodeType } from "@brain/shared";
import { colorForType } from "../graph/theme.js";
import { getArchivedNodes, archiveNode } from "../api/client.js";
import { pushToast } from "./Toasts.js";

/**
 * Library — a browsable, foldered view of the whole brain. The galaxy is beautiful
 * but not a filing cabinet; this is the "open the drawer and read what's inside" view.
 * Memories are grouped into folders by kind (People, Projects, Companies, Meetings,
 * Constellations/MOCs …), each folder expandable to read its notes, fly to them, and
 * export them as Markdown. Read-only, offline, dependency-free.
 */

// Plural folder names + a stable display order.
const FOLDER_ORDER: { key: NodeType | "moc"; label: string }[] = [
  { key: "moc", label: "Constellations (MOCs)" },
  { key: "person", label: "People" },
  { key: "company", label: "Companies" },
  { key: "project", label: "Projects" },
  { key: "decision", label: "Decisions" },
  { key: "meeting", label: "Meetings" },
  { key: "daily", label: "Daily notes" },
  { key: "knowledge", label: "Knowledge" },
  { key: "concept", label: "Concepts" },
  { key: "other", label: "Other" },
];

const dateOf = (n: GraphNode) => (n.occurredAt ?? n.createdAt ?? "").slice(0, 10);

function memoryMarkdown(n: GraphNode): string {
  const typeLabel = NODE_TYPE_LABEL[normalizeNodeType(n.type)];
  const lines = [
    `## ${n.label}`,
    ``,
    `- **Type:** ${typeLabel}`,
    dateOf(n) ? `- **Date:** ${dateOf(n)}` : "",
    n.tags && n.tags.length ? `- **Tags:** ${n.tags.join(", ")}` : "",
    typeof n.importance === "number" ? `- **Importance:** ${Math.round(n.importance * 100)}%` : "",
    ``,
    n.content || "_(no body)_",
    ``,
  ];
  return lines.filter((l) => l !== "").join("\n");
}

/** Returns whether the download actually started — this can silently do nothing
 *  on mobile Safari / restricted contexts, where "⬇ Export all" used to produce
 *  no file, no toast, and no console error. */
function download(filename: string, text: string): boolean {
  try {
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "brain";

export function LibraryPanel({
  graph,
  onFocus,
  spaceName = "brain",
}: {
  graph: GraphData;
  onFocus: (id: number) => void;
  spaceName?: string;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // Archived (resting) memories — lazily fetched when the section is expanded.
  const [showArchived, setShowArchived] = useState(false);
  const [archived, setArchived] = useState<GraphNode[] | null>(null);
  useEffect(() => {
    // Falls back to an empty list on failure so the panel doesn't get stuck on "Loading…"
    // forever (and stops retrying on every re-render, since archived is no longer null).
    if (showArchived && archived === null) void getArchivedNodes().then(setArchived).catch(() => setArchived([]));
  }, [showArchived, archived]);
  const restore = async (id: number) => {
    if (await archiveNode(id, false)) {
      setArchived((a) => (a ? a.filter((n) => n.id !== id) : a));
      window.dispatchEvent(new Event("brain-memory-added")); // nudge the galaxy to refresh
    } else {
      pushToast("Couldn't restore that memory — try again.", "⚠️", 3500);
    }
  };

  // Group non-action memories into folders, newest first within each.
  const folders = useMemo(() => {
    const byKey = new Map<string, GraphNode[]>();
    for (const n of graph.nodes as GraphNode[]) {
      if (n.kind === "action") continue;
      const key = n.kind === "moc" ? "moc" : normalizeNodeType(n.type);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(n);
    }
    for (const arr of byKey.values()) arr.sort((a, b) => (dateOf(a) < dateOf(b) ? 1 : -1));
    return FOLDER_ORDER.map((f) => ({ ...f, items: byKey.get(f.key) ?? [] })).filter((f) => f.items.length > 0);
  }, [graph.nodes]);

  const total = folders.reduce((s, f) => s + f.items.length, 0);

  const exportFolder = (label: string, items: GraphNode[]) => {
    const body = `# ${label}\n\n_${items.length} ${items.length === 1 ? "memory" : "memories"} · exported from ${spaceName}_\n\n${items.map(memoryMarkdown).join("\n---\n\n")}`;
    if (!download(`${slug(spaceName)}-${slug(label)}.md`, body)) {
      pushToast("Couldn't export — your browser blocked the download.", "⚠️", 4000);
    }
  };

  const exportAll = () => {
    const body = `# ${spaceName} — full library\n\n_${total} memories across ${folders.length} folders_\n\n${folders
      .map((f) => `# ${f.label}\n\n${f.items.map(memoryMarkdown).join("\n---\n\n")}`)
      .join("\n\n")}`;
    if (!download(`${slug(spaceName)}-library.md`, body)) {
      pushToast("Couldn't export — your browser blocked the download.", "⚠️", 4000);
    }
  };

  if (total === 0) {
    return (
      <div className="dock-body">
        <p className="empty">Your library is empty. Dump a few thoughts and they'll file themselves into folders here.</p>
      </div>
    );
  }

  return (
    <div className="dock-body" style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto" }}>
      <div className="dock-head">
        <h3>📚 Library</h3>
        <button className="mini" onClick={exportAll} title="Download every memory as Markdown">
          ⬇ Export all
        </button>
      </div>
      <p style={{ fontSize: "0.78rem", opacity: 0.75, margin: "0 0 0.9rem 0" }}>
        {total} memories filed into {folders.length} folders. Open a folder to read, fly to, or export its notes.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {folders.map((f) => {
          const isOpen = !!open[f.key];
          return (
            <div key={f.key} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", overflow: "hidden" }}>
              <div
                style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.6rem 0.7rem", cursor: "pointer", background: "rgba(255,255,255,0.03)" }}
                onClick={() => setOpen((o) => ({ ...o, [f.key]: !o[f.key] }))}
              >
                <span style={{ opacity: 0.7, width: "0.9rem" }}>{isOpen ? "▾" : "▸"}</span>
                <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: colorForType(f.key === "moc" ? "concept" : (f.key as NodeType)), flexShrink: 0 }} />
                <span style={{ fontWeight: 600, fontSize: "0.86rem", flex: 1 }}>{f.label}</span>
                <span style={{ fontSize: "0.74rem", opacity: 0.6 }}>{f.items.length}</span>
                <button
                  className="mini"
                  style={{ padding: "0.15rem 0.4rem", fontSize: "0.72rem" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    exportFolder(f.label, f.items);
                  }}
                  title={`Export ${f.label} as Markdown`}
                >
                  ⬇
                </button>
              </div>
              {isOpen && (
                <ul style={{ listStyle: "none", margin: 0, padding: "0.3rem 0.5rem 0.5rem" }}>
                  {f.items.map((n) => (
                    <li key={n.id} style={{ padding: "0.35rem 0.3rem", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <button
                          className="pill"
                          style={{ borderColor: colorForType(normalizeNodeType(n.type)), flex: 1, textAlign: "left" }}
                          onClick={() => onFocus(n.id)}
                          title="Fly to this memory in the galaxy"
                        >
                          {n.label}
                        </button>
                        {dateOf(n) && <span style={{ fontSize: "0.68rem", opacity: 0.5 }}>{dateOf(n)}</span>}
                        <button
                          className="mini"
                          style={{ padding: "0.12rem 0.35rem", fontSize: "0.7rem" }}
                          onClick={() => download(`${slug(n.label)}.md`, memoryMarkdown(n))}
                          title="Download this memory note as Markdown"
                        >
                          ⬇
                        </button>
                      </div>
                      {n.content && (
                        <p style={{ fontSize: "0.74rem", opacity: 0.75, margin: "0.25rem 0 0 0", whiteSpace: "pre-wrap", maxHeight: "4.5rem", overflow: "hidden" }}>
                          {n.content}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* Archived (resting) memories — kept, out of the galaxy, restorable. */}
      <div style={{ marginTop: "0.9rem", border: "1px solid rgba(150,134,255,0.18)", borderRadius: "8px", overflow: "hidden" }}>
        <div
          style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.6rem 0.7rem", cursor: "pointer", background: "rgba(150,134,255,0.06)" }}
          onClick={() => setShowArchived((v) => !v)}
        >
          <span style={{ opacity: 0.7, width: "0.9rem" }}>{showArchived ? "▾" : "▸"}</span>
          <span style={{ fontWeight: 600, fontSize: "0.86rem", flex: 1 }}>📥 Archived</span>
          {archived && <span style={{ fontSize: "0.74rem", opacity: 0.6 }}>{archived.length}</span>}
        </div>
        {showArchived && (
          <ul style={{ listStyle: "none", margin: 0, padding: "0.3rem 0.5rem 0.5rem" }}>
            {archived === null && <li style={{ padding: "0.4rem", opacity: 0.6, fontSize: "0.76rem" }}>Loading…</li>}
            {archived && archived.length === 0 && (
              <li style={{ padding: "0.4rem", opacity: 0.6, fontSize: "0.76rem" }}>Nothing archived. Rest a memory from its details (📥) to tuck it away here.</li>
            )}
            {archived?.map((n) => (
              <li key={n.id} style={{ padding: "0.35rem 0.3rem", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <span style={{ flex: 1, fontSize: "0.82rem" }}>{n.label}</span>
                <button className="mini" style={{ padding: "0.12rem 0.45rem", fontSize: "0.72rem" }} onClick={() => void restore(n.id)} title="Bring this memory back into the galaxy">
                  ↩ Restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
