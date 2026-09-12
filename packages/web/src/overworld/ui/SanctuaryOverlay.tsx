import { useEffect, useState } from "react";
import { COGNITIVE_KINDS, COGNITIVE_META } from "@brain/shared";
import {
  addThought,
  createCognitive,
  dismissThought,
  getCognitive,
  getThoughts,
  promoteThought,
  reinforceThought,
  setCognitiveProgress,
  type CognitiveItem,
  type Thought,
} from "../../api/mind.js";
import { recordBuildingWork } from "../data/npcJobs.js";

export interface SanctuaryOverlayProps {
  spaceId: string;
  onClose: () => void;
}

/**
 * The Sanctuary / Meditation Garden (Mind tab equivalent). Working-memory "motes" are
 * real server state (GET/POST /working, api/mind.ts) — they're ephemeral thoughts, not a
 * client-only ambient effect. Cognitive items (goals/ideas/skills/…) are the durable
 * cognitive layer, grouped by COGNITIVE_META the same way the galaxy already labels them.
 * A thought actually logged, or a goal/idea/skill actually planted, is the Sanctuary's own
 * real work event (npc-economy.md) — every OTHER action here (reinforce/promote/dismiss/bump)
 * is real too, but those are gestures toward EXISTING items, not new real work created.
 */
export function SanctuaryOverlay({ spaceId, onClose }: SanctuaryOverlayProps) {
  const [thoughts, setThoughts] = useState<Thought[] | null>(null);
  const [items, setItems] = useState<CognitiveItem[] | null>(null);
  const [newThought, setNewThought] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [newGoalKind, setNewGoalKind] = useState<string>(COGNITIVE_KINDS[0] ?? "goal");
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadThoughts = async () => setThoughts(await getThoughts());
  const loadItems = async () => setItems(await getCognitive());

  useEffect(() => {
    void loadThoughts();
    void loadItems();
  }, []);

  const reinforce = async (t: Thought) => {
    setBusyId(t.id);
    try {
      await reinforceThought(t.id);
      await loadThoughts();
    } finally {
      setBusyId(null);
    }
  };
  const promote = async (t: Thought) => {
    setBusyId(t.id);
    try {
      await promoteThought(t.id);
      await loadThoughts();
    } finally {
      setBusyId(null);
    }
  };
  const dismiss = async (t: Thought) => {
    setBusyId(t.id);
    try {
      await dismissThought(t.id);
      await loadThoughts();
    } finally {
      setBusyId(null);
    }
  };
  const addMote = async () => {
    const text = newThought.trim();
    if (!text) return;
    await addThought(text, "manual");
    recordBuildingWork(spaceId, "sanctuary");
    setNewThought("");
    await loadThoughts();
  };
  const bumpGoalProgress = async (item: CognitiveItem) => {
    const current = item.progress ?? 0;
    await setCognitiveProgress(item.id, Math.min(1, current + 0.1));
    await loadItems();
  };
  const addCognitive = async () => {
    const label = newGoal.trim();
    if (!label) return;
    await createCognitive(newGoalKind, label);
    recordBuildingWork(spaceId, "sanctuary");
    setNewGoal("");
    await loadItems();
  };

  return (
    <div
      role="dialog"
      aria-label="Sanctuary"
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
      <h2 style={{ marginTop: 0 }}>🧘 Sanctuary</h2>

      <h3>Working memory</h3>
      {thoughts === null ? (
        <p>Settling the fireflies...</p>
      ) : thoughts.length === 0 ? (
        <p>Nothing drifting right now.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {thoughts.map((t) => (
            <li key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
              <span style={{ flex: 1 }}>{t.text}</span>
              <button type="button" onClick={() => reinforce(t)} disabled={busyId === t.id}>
                Keep
              </button>
              <button type="button" onClick={() => promote(t)} disabled={busyId === t.id}>
                ★ Save
              </button>
              <button type="button" onClick={() => dismiss(t)} disabled={busyId === t.id}>
                Let go
              </button>
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          aria-label="New thought"
          value={newThought}
          onChange={(e) => setNewThought(e.target.value)}
          style={{ flex: 1 }}
        />
        <button type="button" onClick={addMote} disabled={!newThought.trim()}>
          Drop a thought
        </button>
      </div>

      <h3>Goals, ideas & skills</h3>
      {items === null ? (
        <p>Loading...</p>
      ) : items.length === 0 ? (
        <p>Nothing planted yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {items.map((item) => {
            const meta = COGNITIVE_META[item.kind as keyof typeof COGNITIVE_META];
            return (
              <li key={item.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
                <span aria-hidden="true">{meta?.icon ?? "🌱"}</span>
                <span style={{ flex: 1 }}>
                  {item.label} <span style={{ opacity: 0.6 }}>({meta?.label ?? item.kind})</span>
                  {meta?.hasProgress && item.progress != null && ` — ${Math.round(item.progress * 100)}%`}
                </span>
                {meta?.hasProgress && (
                  <button type="button" onClick={() => bumpGoalProgress(item)}>
                    +10%
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <select aria-label="New item kind" value={newGoalKind} onChange={(e) => setNewGoalKind(e.target.value)}>
          {COGNITIVE_KINDS.map((k) => (
            <option key={k} value={k}>
              {COGNITIVE_META[k].label}
            </option>
          ))}
        </select>
        <input aria-label="New item label" value={newGoal} onChange={(e) => setNewGoal(e.target.value)} style={{ flex: 1 }} />
        <button type="button" onClick={addCognitive} disabled={!newGoal.trim()}>
          Plant
        </button>
      </div>

      <button type="button" onClick={onClose}>
        Leave
      </button>
    </div>
  );
}
