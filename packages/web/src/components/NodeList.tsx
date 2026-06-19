import { Fragment, useMemo, useState } from "react";
import {
  type GraphNode,
  type CelestialClass,
  type NodeType,
  CELESTIAL_ICON,
  CELESTIAL_LABEL,
  CELESTIAL_CLASSES,
} from "@brain/shared";
import { TYPE_COLORS } from "../graph/theme.js";

interface Props {
  nodes: GraphNode[];
  onFocus: (id: number) => void;
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
export function NodeList({ nodes, onFocus }: Props) {
  const [q, setQ] = useState("");
  const [tier, setTier] = useState<CelestialClass | "all">("all");
  const [emotion, setEmotion] = useState<Emotion>("all");
  const [type, setType] = useState<NodeType | "all">("all");
  const [cooling, setCooling] = useState(false);
  const [sort, setSort] = useState<Sort>("mass");
  const [tag, setTag] = useState<string | null>(null);
  const [timeline, setTimeline] = useState(false);

  const memories = useMemo(() => nodes.filter((n) => n.kind !== "action"), [nodes]);

  const allTags = useMemo(() => {
    const f = new Map<string, number>();
    for (const n of memories) for (const t of n.tags ?? []) f.set(t, (f.get(t) ?? 0) + 1);
    return [...f.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => t);
  }, [memories]);

  const types = useMemo(
    () => [...new Set(memories.map((n) => n.type))].sort(),
    [memories],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = memories.filter((n) => {
      if (needle && !n.label.toLowerCase().includes(needle) && !n.content.toLowerCase().includes(needle))
        return false;
      if (tier !== "all" && (n.celestial ?? "moon") !== tier) return false;
      if (type !== "all" && n.type !== type) return false;
      if (emotion !== "all" && emotionBucket(n.emotionalWeight) !== emotion) return false;
      if (cooling && (n.entropy ?? 0) < 0.45) return false;
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
  }, [memories, q, tier, type, emotion, cooling, tag, sort]);

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

  if (memories.length === 0) {
    return <p className="empty">No memories yet — dump a thought to begin.</p>;
  }

  const renderRow = (n: GraphNode) => {
    const cls = n.celestial ?? "moon";
    const emo = emotionBucket(n.emotionalWeight);
    const when = relative(n.occurredAt ?? n.createdAt);
    return (
      <li key={n.id}>
        <button onClick={() => onFocus(n.id)}>
          <span className="dot" style={{ background: TYPE_COLORS[n.type] }} />
          <span className="nl-main">
            <span className="nl-label">{n.label}</span>
            <span className="nl-meta2">
              <span title="growth stage">{CELESTIAL_ICON[cls]} {CELESTIAL_LABEL[cls]}</span>
              {(n.degree ?? 0) > 0 && <span title="connections">· {n.degree} link{n.degree === 1 ? "" : "s"}</span>}
              {when && <span title="when">· {when}</span>}
              <span className="nl-emodot" style={{ background: EMOTION_DOT[emo] }} title={`${emo} feeling`} />
              {(n.entropy ?? 0) >= 0.45 && <span title="cooling">· ❄️</span>}
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
        <select value={type} onChange={(e) => setType(e.target.value as NodeType | "all")} title="Memory type">
          <option value="all">any type</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
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
          className={`tag-chip ${timeline ? "on" : ""}`}
          onClick={() => setTimeline((t) => !t)}
          title="Group by when each memory happened"
        >
          🕰 timeline
        </button>
      </div>

      {allTags.length > 0 && (
        <div className="discovery-tags">
          {allTags.map((t) => (
            <button
              key={t}
              className={`tag-chip ${tag === t ? "on" : ""}`}
              onClick={() => setTag(tag === t ? null : t)}
            >
              {t}
            </button>
          ))}
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
