import type { GraphNode, NodeType } from "@brain/shared";

/** Mirrors LibraryPanel.tsx's FOLDER_ORDER — a fixed display order, "moc" (constellations)
 *  shown as its own shelf even though it isn't a real NodeType value on its own axis. */
export const FOLDER_ORDER: { key: NodeType | "moc"; label: string }[] = [
  { key: "person", label: "People" },
  { key: "company", label: "Companies" },
  { key: "project", label: "Projects" },
  { key: "decision", label: "Decisions" },
  { key: "meeting", label: "Meetings" },
  { key: "daily", label: "Daily" },
  { key: "knowledge", label: "Knowledge" },
  { key: "concept", label: "Concepts" },
  { key: "moc", label: "Constellations" },
  { key: "other", label: "Other" },
];

export interface Folder {
  key: NodeType | "moc";
  label: string;
  nodes: GraphNode[];
}

/** Groups nodes into shelves the same way LibraryPanel does — "moc" kind wins the
 *  Constellations shelf regardless of its NodeType; everything else groups by type,
 *  falling back to "Other" for any type not in FOLDER_ORDER (tolerates unsorted/unknown
 *  types gracefully, never an error). */
export function groupIntoFolders(nodes: readonly GraphNode[]): Folder[] {
  const byKey = new Map<NodeType | "moc", GraphNode[]>();
  for (const n of nodes) {
    const key: NodeType | "moc" = n.kind === "moc" ? "moc" : n.type;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(n);
    else byKey.set(key, [n]);
  }
  const known = new Set(FOLDER_ORDER.map((f) => f.key));
  const folders = FOLDER_ORDER.map((f) => ({ ...f, nodes: byKey.get(f.key) ?? [] }));
  const other = folders.find((f) => f.key === "other");
  if (other) {
    for (const [key, list] of byKey) {
      if (!known.has(key)) other.nodes.push(...list);
    }
  }
  return folders.filter((f) => f.nodes.length > 0);
}
