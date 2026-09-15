import { useEffect, useState } from "react";
import { COGNITIVE_KINDS, COGNITIVE_META, type GraphData } from "@brain/shared";
import {
  acceptCandidate,
  addThought,
  answerInquiry,
  createCognitive,
  dismissCandidate,
  dismissInquiry,
  dismissPersonSuggestion,
  dismissThought,
  getCandidates,
  getCognitive,
  getInquiries,
  getPersonProfile,
  getPersonSuggestions,
  getThoughts,
  promoteThought,
  reinforceThought,
  rejectInquiry,
  setCognitiveProgress,
  type Candidate,
  type CognitiveItem,
  type Inquiry,
  type PersonProfile,
  type Thought,
} from "../../api/mind.js";
import { recordBuildingWork } from "../data/npcJobs.js";
import { actionButtonStyle, ConfirmButton, fieldStyle, OverlayShell } from "./OverlayShell.js";
import { color } from "./theme.js";

export interface SanctuaryOverlayProps {
  spaceId: string;
  graph: GraphData;
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
 *
 * Overlay quality-parity audit (2026-09-13, task #79) — three whole real, working,
 * server-backed sub-features had zero UI anywhere: Inquiries, Suggested Connections
 * (Candidates), and Person suggestions (`docs/overworld/sanctuary-inquiries-candidates.md`).
 * Answering an Inquiry or accepting a Candidate is the Sanctuary's own real work event, same
 * convention as everything else above; merely dismissing/rejecting is not.
 *
 * Backlog #85 (task #117, follow-up to the audit above) — the deferred `getPersonProfile` view
 * is now real: tapping a confirmed person node (a real `graph.nodes` entry, `type === "person"`,
 * distinct from the still-unconfirmed name suggestions below) expands its real profile
 * (interaction count/tone/history) inline, no new navigation pattern invented. Letting go of a
 * thought is a genuine server-side delete (`DELETE /working/:id`) that was a single unconfirmed
 * click — now wrapped in the same real `ConfirmButton` two-tap pattern every other destructive
 * action in this app already uses. Editing a thought's own text stays deliberately unwired:
 * thoughts are meant to be captured and evolve via reinforcement, not hand-edited, matching the
 * "no raw text editing anywhere in the Overworld" convention confirmed across every overlay.
 */
export function SanctuaryOverlay({ spaceId, graph, onClose }: SanctuaryOverlayProps) {
  const [thoughts, setThoughts] = useState<Thought[] | null>(null);
  const [items, setItems] = useState<CognitiveItem[] | null>(null);
  const [newThought, setNewThought] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [newGoalKind, setNewGoalKind] = useState<string>(COGNITIVE_KINDS[0] ?? "goal");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [inquiries, setInquiries] = useState<Inquiry[] | null>(null);
  const [inquiryAnswers, setInquiryAnswers] = useState<Record<number, string>>({});
  const [busyInquiryId, setBusyInquiryId] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [busyCandidateId, setBusyCandidateId] = useState<number | null>(null);
  const [personSuggestions, setPersonSuggestions] = useState<{ name: string; count: number }[] | null>(null);
  const [expandedPersonId, setExpandedPersonId] = useState<number | null>(null);
  const [personProfile, setPersonProfile] = useState<PersonProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const loadThoughts = async () => setThoughts(await getThoughts());
  const loadItems = async () => setItems(await getCognitive());
  const loadInquiries = async () => setInquiries(await getInquiries());
  const loadCandidates = async () => setCandidates((await getCandidates()).candidates);
  const loadPersonSuggestions = async () => setPersonSuggestions(await getPersonSuggestions());

  useEffect(() => {
    void loadThoughts();
    void loadItems();
    void loadInquiries();
    void loadCandidates();
    void loadPersonSuggestions();
  }, []);

  const submitInquiryAnswer = async (inquiry: Inquiry) => {
    const text = (inquiryAnswers[inquiry.id] ?? "").trim();
    if (!text) return;
    setBusyInquiryId(inquiry.id);
    try {
      const result = await answerInquiry(inquiry.id, text);
      if (result) {
        recordBuildingWork(spaceId, "sanctuary");
        setInquiryAnswers((cur) => ({ ...cur, [inquiry.id]: "" }));
        await loadInquiries();
      }
    } finally {
      setBusyInquiryId(null);
    }
  };
  const dismissInquiryRow = async (inquiry: Inquiry) => {
    setBusyInquiryId(inquiry.id);
    try {
      await dismissInquiry(inquiry.id);
      await loadInquiries();
    } finally {
      setBusyInquiryId(null);
    }
  };
  const rejectInquiryRow = async (inquiry: Inquiry) => {
    setBusyInquiryId(inquiry.id);
    try {
      await rejectInquiry(inquiry.id);
      await loadInquiries();
    } finally {
      setBusyInquiryId(null);
    }
  };

  const acceptCandidateRow = async (candidate: Candidate) => {
    setBusyCandidateId(candidate.id);
    try {
      const ok = await acceptCandidate(candidate.id);
      if (ok) recordBuildingWork(spaceId, "sanctuary");
      await loadCandidates();
    } finally {
      setBusyCandidateId(null);
    }
  };
  const dismissCandidateRow = async (candidate: Candidate) => {
    setBusyCandidateId(candidate.id);
    try {
      await dismissCandidate(candidate.id);
      await loadCandidates();
    } finally {
      setBusyCandidateId(null);
    }
  };

  const dismissPersonRow = async (name: string) => {
    await dismissPersonSuggestion(name);
    await loadPersonSuggestions();
  };

  const togglePersonProfile = async (nodeId: number) => {
    if (expandedPersonId === nodeId) {
      setExpandedPersonId(null);
      setPersonProfile(null);
      return;
    }
    setExpandedPersonId(nodeId);
    setPersonProfile(null);
    setLoadingProfile(true);
    try {
      setPersonProfile(await getPersonProfile(nodeId));
    } finally {
      setLoadingProfile(false);
    }
  };

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
    <OverlayShell icon="🧘" title="Sanctuary" onClose={onClose}>
      <h3 style={{ marginTop: 0 }}>Working memory</h3>
      {thoughts === null ? (
        <p>Settling the fireflies...</p>
      ) : thoughts.length === 0 ? (
        <p>Nothing drifting right now.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {thoughts.map((t) => (
            <li
              key={t.id}
              style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${color.divider}` }}
            >
              <span style={{ flex: 1 }}>{t.text}</span>
              <button type="button" onClick={() => reinforce(t)} disabled={busyId === t.id} style={actionButtonStyle(busyId === t.id)}>
                Keep
              </button>
              <button type="button" onClick={() => promote(t)} disabled={busyId === t.id} style={actionButtonStyle(busyId === t.id)}>
                ★ Save
              </button>
              <ConfirmButton
                label="Let go"
                confirmLabel="Really let go?"
                ariaLabel={`Let go of ${t.text}`}
                onConfirm={() => dismiss(t)}
                disabled={busyId === t.id}
              />
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: "flex", gap: 8, margin: "8px 0" }}>
        <input
          aria-label="New thought"
          value={newThought}
          onChange={(e) => setNewThought(e.target.value)}
          style={{ ...fieldStyle, flex: 1 }}
        />
        <button type="button" onClick={addMote} disabled={!newThought.trim()} style={actionButtonStyle(!newThought.trim())}>
          Drop a thought
        </button>
      </div>

      <h3>Goals, ideas & skills</h3>
      {items === null ? (
        <p>Loading...</p>
      ) : items.length === 0 ? (
        <p>Nothing planted yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((item) => {
            const meta = COGNITIVE_META[item.kind as keyof typeof COGNITIVE_META];
            return (
              <li
                key={item.id}
                style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${color.divider}` }}
              >
                <span aria-hidden="true">{meta?.icon ?? "🌱"}</span>
                <span style={{ flex: 1 }}>
                  {item.label} <span style={{ opacity: 0.6 }}>({meta?.label ?? item.kind})</span>
                  {meta?.hasProgress && item.progress != null && ` — ${Math.round(item.progress * 100)}%`}
                </span>
                {meta?.hasProgress && (
                  <button type="button" onClick={() => bumpGoalProgress(item)} style={actionButtonStyle()}>
                    +10%
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <select
          aria-label="New item kind"
          value={newGoalKind}
          onChange={(e) => setNewGoalKind(e.target.value)}
          style={fieldStyle}
        >
          {COGNITIVE_KINDS.map((k) => (
            <option key={k} value={k}>
              {COGNITIVE_META[k].label}
            </option>
          ))}
        </select>
        <input
          aria-label="New item label"
          value={newGoal}
          onChange={(e) => setNewGoal(e.target.value)}
          style={{ ...fieldStyle, flex: 1 }}
        />
        <button type="button" onClick={addCognitive} disabled={!newGoal.trim()} style={actionButtonStyle(!newGoal.trim())}>
          Plant
        </button>
      </div>

      <h3>Inquiries</h3>
      {inquiries === null ? (
        <p>Loading...</p>
      ) : inquiries.length === 0 ? (
        <p>Nothing she's wondering about right now.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {inquiries.map((inquiry) => (
            <li key={inquiry.id} style={{ padding: "6px 0", borderBottom: `1px solid ${color.divider}` }}>
              <div>{inquiry.question}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{inquiry.nodes.map((n) => n.label).join(" · ")}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <input
                  aria-label={`Answer: ${inquiry.question}`}
                  value={inquiryAnswers[inquiry.id] ?? ""}
                  onChange={(e) => setInquiryAnswers((cur) => ({ ...cur, [inquiry.id]: e.target.value }))}
                  style={{ ...fieldStyle, flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => submitInquiryAnswer(inquiry)}
                  disabled={busyInquiryId === inquiry.id || !(inquiryAnswers[inquiry.id] ?? "").trim()}
                  style={actionButtonStyle(busyInquiryId === inquiry.id || !(inquiryAnswers[inquiry.id] ?? "").trim())}
                >
                  Answer
                </button>
                <button type="button" onClick={() => dismissInquiryRow(inquiry)} disabled={busyInquiryId === inquiry.id} style={actionButtonStyle(busyInquiryId === inquiry.id)}>
                  Not now
                </button>
                <button type="button" onClick={() => rejectInquiryRow(inquiry)} disabled={busyInquiryId === inquiry.id} style={actionButtonStyle(busyInquiryId === inquiry.id)}>
                  Not relevant
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3>Suggested connections</h3>
      {candidates === null ? (
        <p>Loading...</p>
      ) : candidates.length === 0 ? (
        <p>No suggested connections waiting for review.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {candidates.map((c) => (
            <li key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${color.divider}` }}>
              <span style={{ flex: 1 }}>
                {c.aLabel} ↔ {c.bLabel}
                {c.reason && <span style={{ opacity: 0.7 }}> — {c.reason}</span>}
              </span>
              <button
                type="button"
                onClick={() => acceptCandidateRow(c)}
                disabled={busyCandidateId === c.id}
                style={actionButtonStyle(busyCandidateId === c.id)}
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => dismissCandidateRow(c)}
                disabled={busyCandidateId === c.id}
                style={actionButtonStyle(busyCandidateId === c.id)}
              >
                Dismiss
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3>Known people</h3>
      {(() => {
        const people = graph.nodes.filter((n) => n.type === "person");
        return people.length === 0 ? (
          <p>No confirmed people in your collection yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {people.map((p) => (
              <li key={p.id} style={{ padding: "6px 0", borderBottom: `1px solid ${color.divider}` }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ flex: 1 }}>{p.label}</span>
                  <button type="button" onClick={() => togglePersonProfile(p.id)} style={actionButtonStyle()}>
                    {expandedPersonId === p.id ? "Hide profile" : "View profile"}
                  </button>
                </div>
                {expandedPersonId === p.id && (
                  <div style={{ marginTop: 6, paddingLeft: 8, fontSize: 12, opacity: 0.9 }}>
                    {loadingProfile ? (
                      <p style={{ margin: 0 }}>Reading your history together...</p>
                    ) : !personProfile ? (
                      <p style={{ margin: 0 }}>No profile data yet.</p>
                    ) : (
                      <>
                        <div>
                          {personProfile.count} interaction{personProfile.count === 1 ? "" : "s"} — tone: {personProfile.tone}
                          {personProfile.lastAt && ` — last ${new Date(personProfile.lastAt).toLocaleDateString()}`}
                        </div>
                        {personProfile.interactions.length > 0 && (
                          <ul style={{ listStyle: "none", padding: 0, margin: "4px 0 0" }}>
                            {personProfile.interactions.map((i) => (
                              <li key={i.id} style={{ padding: "2px 0" }}>
                                {i.label} <span style={{ opacity: 0.6 }}>({new Date(i.createdAt).toLocaleDateString()})</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        );
      })()}

      <h3>Suggested people</h3>
      {personSuggestions === null ? (
        <p>Loading...</p>
      ) : personSuggestions.length === 0 ? (
        <p>No new names noticed across your memories.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {personSuggestions.map((p) => (
            <li key={p.name} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${color.divider}` }}>
              <span style={{ flex: 1 }}>
                {p.name} — mentioned {p.count} time{p.count === 1 ? "" : "s"}
              </span>
              <button type="button" onClick={() => dismissPersonRow(p.name)} style={actionButtonStyle()}>
                Not a person
              </button>
            </li>
          ))}
        </ul>
      )}
    </OverlayShell>
  );
}
