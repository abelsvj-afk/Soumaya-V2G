import { Fragment, useEffect, useMemo, useState } from "react";
import {
  type GraphNode,
  type CelestialClass,
  type NodeType,
  CELESTIAL_ICON,
  CELESTIAL_LABEL,
  CELESTIAL_CLASSES,
  NODE_TYPE_LABEL,
  normalizeNodeType,
} from "@brain/shared";
import { colorForType, TYPE_COLORS } from "../graph/theme.js";
import { getConstellations, getVisitorActivity, useProcessingNodes, type VisitedMemory } from "../api/client.js";

interface Props {
  nodes: GraphNode[];
  onFocus: (id: number) => void;
  initialTag?: string | null;
  onTagChange?: (tag: string | null) => void;
}

type Emotion = "all" | "positive" | "neutral" | "negative";
type Sort = "mass" | "recent" | "links" | "name";

/** Parse a SQLite/ISO timestamp → ms (tolerant), or NaN. */
function ms(raw?: string): number {
  if (!raw) return NaN;
  const iso = raw.includes("Z") || raw.includes("+") ? raw : raw.replace(" ", "T") + "Z";
  return Date.parse(iso);
}
function relative(raw?: string): string {
  const t = ms(raw);
  if (Number.isNaN(t)) return "";
  const d = Math.round((Date.now() - t) / 8.64e7);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.round(d / 30)}mo ago`;
  return `${Math.round(d / 365)}y ago`;
}
function emotionBucket(ew?: number): Exclude<Emotion, "all"> {
  if (typeof ew !== "number") return "neutral";
  if (ew > 0.2) return "positive";
  if (ew < -0.2) return "negative";
  return "neutral";
}
const EMOTION_DOT: Record<Exclude<Emotion, "all">, string> = {
  positive: "#ffcf6b",
  neutral: "#9b96c4",
  negative: "#6bb7ff",
};

/** Bucket a timestamp into a human time period (for timeline grouping). */
function bucket(t: number): { key: string; label: string; rank: number } {
  if (Number.isNaN(t)) return { key: "undated", label: "Undated", rank: -Infinity };
  const days = Math.floor((Date.now() - t) / 8.64e7);
  if (days <= 0) return { key: "today", label: "Today", rank: 1e15 };
  if (days === 1) return { key: "yesterday", label: "Yesterday", rank: 1e15 - 1 };
  if (days < 7) return { key: "week", label: "Earlier this week", rank: 1e15 - 2 };
  const d = new Date(t);
  const now = new Date();
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth())
    return { key: "month", label: "This month", rank: 1e15 - 3 };
  const label = d.toLocaleString(undefined, { month: "long", year: "numeric" });
  return { key: `${d.getFullYear()}-${d.getMonth()}`, label, rank: d.getFullYear() * 12 + d.getMonth() };
}

/**
 * Discovery-oriented memory index: rich metadata per row + visual/emotional/time
 * filters, so a memory can be found WITHOUT remembering its name ("the large blue
 * planet, cooling, from a while back"). All data is already derived on each node.
 */
export function NodeList({ nodes, onFocus, initialTag, onTagChange }: Props) {
  const processing = useProcessingNodes();
  const [q, setQ] = useState("");
  const [tier, setTier] = useState<CelestialClass | "all">("all");
  const [emotion, setEmotion] = useState<Emotion>("all");
  const [type, setType] = useState<NodeType | "all">("all");
  const [cooling, setCooling] = useState(false);
  const [drifting, setDrifting] = useState(false); // orphan lint: memories with no links
  const [sort, setSort] = useState<Sort>("recent");
  const [tag, setTag] = useState<string | null>(initialTag ?? null);
  const [timeline, setTimeline] = useState(true);
  const [visited, setVisited] = useState<VisitedMemory[]>([]);
  const [constellationMap, setConstellationMap] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    if (initialTag !== undefined) {
      setTag(initialTag);
    }
  }, [initialTag]);

  const handleTagChange = (newTag: string | null) => {
    setTag(newTag);
    onTagChange?.(newTag);
  };

  useEffect(() => {
    const load = () => getVisitorActivity().then(setVisited).catch(() => {});
    load();
    const iv = window.setInterval(load, 15000);
    return () => window.clearInterval(iv);
  }, []);

  useEffect(() => {
    getConstellations()
      .then((cs) => {
        const map = new Map<number, string>();
        for (const c of cs) for (const n of c.nodes) map.set(n.id, c.name);
        setConstellationMap(map);
      })
      .catch(() => {});
  }, []);

  const visitorMap = useMemo(() => {
    const map = new Map<number, VisitedMemory>();
    for (const v of visited) {
      map.set(v.nodeId, v);
    }
    return map;
  }, [visited]);

  const memories = useMemo(() => nodes.filter((n) => n.kind !== "action"), [nodes]);

  const allTagsWithCounts = useMemo(() => {
    const f = new Map<string, number>();
    for (const n of memories) for (const t of n.tags ?? []) f.set(t, (f.get(t) ?? 0) + 1);
    return [...f.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, count]) => ({ name, count }));
  }, [memories]);

  // Distinct kinds present (legacy values normalized to the canonical taxonomy).
  const types = useMemo(
    () => [...new Set(memories.map((n) => normalizeNodeType(n.type)))].sort(),
    [memories],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = memories.filter((n) => {
      if (needle && !n.label.toLowerCase().includes(needle) && !n.content.toLowerCase().includes(needle))
        return false;
      if (tier !== "all" && (n.celestial ?? "moon") !== tier) return false;
      if (type !== "all" && normalizeNodeType(n.type) !== type) return false;
      if (emotion !== "all" && emotionBucket(n.emotionalWeight) !== emotion) return false;
      if (cooling && (n.entropy ?? 0) < 0.45) return false;
      if (drifting && (n.degree ?? 0) > 0) return false;
      if (tag && !(n.tags ?? []).includes(tag)) return false;
      return true;
    });
    out.sort((a, b) => {
      switch (sort) {
        case "recent":
          return (ms(b.occurredAt ?? b.createdAt) || 0) - (ms(a.occurredAt ?? a.createdAt) || 0);
        case "links":
          return (b.degree ?? 0) - (a.degree ?? 0);
        case "name":
          return a.label.localeCompare(b.label);
        default:
          return (b.mass ?? 0) - (a.mass ?? 0);
      }
    });
    return out;
  }, [memories, q, tier, type, emotion, cooling, drifting, tag, sort]);

  // Timeline grouping: bucket the filtered set by when each memory happened.
  const groups = useMemo(() => {
    if (!timeline) return [];
    const map = new Map<string, { label: string; rank: number; items: GraphNode[] }>();
    for (const n of shown) {
      const b = bucket(ms(n.occurredAt ?? n.createdAt));
      if (!map.has(b.key)) map.set(b.key, { label: b.label, rank: b.rank, items: [] });
      map.get(b.key)!.items.push(n);
    }
    return [...map.values()].sort((a, b) => b.rank - a.rank);
  }, [timeline, shown]);

  const todayMemories = useMemo(() => {
    const todayStr = new Date().toLocaleDateString();
    return memories.filter(n => {
      const timestamp = ms(n.occurredAt ?? n.createdAt);
      return !Number.isNaN(timestamp) && new Date(timestamp).toLocaleDateString() === todayStr;
    });
  }, [memories]);

  const upcomingReminders = useMemo(() => {
    const now = Date.now();
    return nodes.filter(n => {
      if (!n.remindAt) return false;
      const timestamp = ms(n.remindAt);
      return !Number.isNaN(timestamp) && timestamp > now && timestamp - now < 24 * 3600 * 1000; // next 24 hours
    });
  }, [nodes]);

  const relativeFuture = (raw?: string) => {
    const t = ms(raw);
    if (Number.isNaN(t)) return "";
    const diff = t - Date.now();
    if (diff <= 0) return "now";
    const h = Math.round(diff / 3.6e6);
    if (h < 24) return `in ${h}h`;
    const d = Math.round(diff / 8.64e7);
    return `in ${d}d`;
  };

  if (memories.length === 0) {
    return <p className="empty">No memories yet — dump a thought to begin.</p>;
  }

  const renderRow = (n: GraphNode) => {
    const cls = n.celestial ?? "moon";
    const emo = emotionBucket(n.emotionalWeight);
    const when = relative(n.occurredAt ?? n.createdAt);
    const timestamp = ms(n.occurredAt ?? n.createdAt);
    const fullDate = !Number.isNaN(timestamp) ? new Date(timestamp).toLocaleDateString() : "";
    const showExactDate = sort === "recent" || timeline;
    const v = visitorMap.get(n.id);
    const constel = constellationMap.get(n.id);
    const isProcessing = processing.has(n.id);
    return (
      <li key={n.id} className={isProcessing ? "processing" : ""}>
        <button onClick={() => onFocus(n.id)}>
          <span className="dot" style={{ background: colorForType(n.type) }} />
          <span className="nl-main">
            <span className="nl-label">
              {n.label}
              {isProcessing && <span className="nl-writing">⚙️ Writing...</span>}
            </span>
            <span className="nl-meta2">
              <span title="growth stage">{CELESTIAL_ICON[cls]} {CELESTIAL_LABEL[cls]}</span>
              {(n.degree ?? 0) > 0 && <span title="connections">· {n.degree} link{n.degree === 1 ? "" : "s"}</span>}
              {when && (
                <span title="when">
                  ·{" "}
                  {showExactDate && fullDate ? (
                    <abbr title={fullDate} style={{ textDecoration: "none" }}>
                      {fullDate} ({when})
                    </abbr>
                  ) : (
                    <abbr title={fullDate || "when"} style={{ textDecoration: "none" }}>
                      {when}
                    </abbr>
                  )}
                </span>
              )}
              <span className="nl-emodot" style={{ background: EMOTION_DOT[emo] }} title={`${emo} feeling`} />
              {(n.entropy ?? 0) >= 0.45 && <span title="cooling">· ❄️</span>}
              {v && <span title={`visited ${v.visits}× · last ${relative(v.lastAt)}`}>· 👽 {v.visits}</span>}
              {constel && <span className="nl-constel" title={`constellation: ${constel}`}>· 🌌 {constel}</span>}
            </span>
            {n.tags && n.tags.length > 0 && (
              <span className="nl-tags">{n.tags.slice(0, 4).map((t) => `#${t}`).join(" ")}</span>
            )}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="dock-body">
      <input
        className="list-filter"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`Search ${memories.length} memories…`}
      />

      {(todayMemories.length > 0 || upcomingReminders.length > 0) && (
        <div className="sticky-today-strip" style={{
          margin: "10px 0",
          padding: "8px 12px",
          background: "rgba(91, 214, 255, 0.08)",
          border: "1px solid rgba(91, 214, 255, 0.25)",
          borderRadius: "8px",
          fontSize: "12px",
          color: "#eaf2ff",
        }}>
          {todayMemories.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: upcomingReminders.length > 0 ? "6px" : 0 }}>
              <span>📅</span>
              <span><strong>Today:</strong> {todayMemories.length} new star{todayMemories.length === 1 ? "" : "s"} added.</span>
            </div>
          )}
          {upcomingReminders.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span>🔔</span>
              <span><strong>Reminder incoming:</strong> "{upcomingReminders[0]!.label.slice(0, 30)}..." {relativeFuture(upcomingReminders[0]!.remindAt)}</span>
            </div>
          )}
        </div>
      )}

      <div className="discovery-filters">
        <select value={tier} onChange={(e) => setTier(e.target.value as CelestialClass | "all")} title="Size / growth stage">
          <option value="all">any size</option>
          {[...CELESTIAL_CLASSES].reverse().map((c) => (
            <option key={c} value={c}>
              {CELESTIAL_ICON[c]} {CELESTIAL_LABEL[c]}
            </option>
          ))}
        </select>
        <select value={emotion} onChange={(e) => setEmotion(e.target.value as Emotion)} title="Emotional signature">
          <option value="all">any feeling</option>
          <option value="positive">● warm</option>
          <option value="neutral">● neutral</option>
          <option value="negative">● heavy</option>
        </select>
        <select value={type} onChange={(e) => setType(e.target.value as NodeType | "all")} title="Memory kind">
          <option value="all">any kind</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {NODE_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} title="Sort by">
          <option value="mass">heaviest</option>
          <option value="recent">most recent</option>
          <option value="links">most connected</option>
          <option value="name">name A–Z</option>
        </select>
        <button
          className={`tag-chip ${cooling ? "on" : ""}`}
          onClick={() => setCooling((c) => !c)}
          title="Memories going cold (neglected)"
        >
          ❄️ cooling
        </button>
        <button
          className={`tag-chip ${drifting ? "on" : ""}`}
          onClick={() => setDrifting((d) => !d)}
          title="Drifting memories — no connections yet"
        >
          🪐 drifting
        </button>
        <button
          className={`tag-chip ${timeline ? "on" : ""}`}
          onClick={() => setTimeline((t) => !t)}
          title="Group by when each memory happened"
        >
          🕰 timeline
        </button>
      </div>

      {types.length > 1 && (
        <div className="kind-legend">
          {types.map((t) => (
            <button
              key={t}
              className={`kind-key ${type === t ? "on" : ""}`}
              onClick={() => setType(type === t ? "all" : t)}
              title={`Filter to ${NODE_TYPE_LABEL[t]}`}
            >
              <span className="kind-dot" style={{ background: TYPE_COLORS[t] }} />
              {NODE_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      )}

      {allTagsWithCounts.length > 0 && (
        <div className="discovery-tags" style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
          {allTagsWithCounts.map(({ name: t, count }) => {
            const maxCount = Math.max(...allTagsWithCounts.map(tc => tc.count), 1);
            const fontSize = `${11 + (count / maxCount) * 5}px`;
            const isHot = count >= 3 || (count / maxCount) >= 0.5;
            return (
              <button
                key={t}
                className={`tag-chip ${tag === t ? "on" : ""} ${isHot ? "hot" : ""}`}
                style={{ fontSize }}
                onClick={() => handleTagChange(tag === t ? null : t)}
                title={`Filter by tag #${t} (${count} memories)`}
              >
                #{t} <span style={{ opacity: 0.6, fontSize: "0.8em" }}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <ul className="neighbors node-list">
        {!timeline && shown.map(renderRow)}
        {timeline &&
          groups.map((g) => (
            <Fragment key={g.label}>
              <li className="nl-group">{g.label}</li>
              {g.items.map(renderRow)}
            </Fragment>
          ))}
        {shown.length === 0 && <li className="empty">No matches — loosen the filters.</li>}
      </ul>
    </div>
  );
}
