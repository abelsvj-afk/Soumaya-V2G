import { useEffect, useRef, useState } from "react";
import {
  getPersona,
  refreshPersona,
  getInstructions,
  createInstruction,
  updateInstruction,
  deleteInstruction,
  getDocuments,
  uploadDocument,
  renameDocument,
  deleteDocument,
  askChat,
  type InstructionProfile,
  type KnowledgeDoc,
} from "../api/client.js";

/** Preset role names — pick one or type your own. */
const ROLE_PRESETS = [
  "Business Advisor",
  "Therapist",
  "Life Coach",
  "Creative Partner",
  "Strategic Council",
  "Fitness Coach",
  "Study Partner",
  "Mediator",
  "Career Coach",
  "Devil's Advocate",
];

/**
 * The 🧠 Companion tab: configure WHO Soumaya is to you.
 *  - About Me: auto-derived, who you are (she's aware, never becomes you).
 *  - Custom Instructions: stackable roles she adopts (editable; preset or custom name).
 *  - Knowledge: reference docs she retrieves from.
 *  - Try it: chat right here using the active roles + knowledge.
 */
export function CompanionPanel({ demo }: { demo?: boolean }) {
  if (demo) {
    return <p className="empty">The Companion is available in your own brain — sign in to configure it.</p>;
  }
  return (
    <div className="dock-body">
      <AboutMe />
      <Instructions />
      <Knowledge />
      <CompanionChat />
    </div>
  );
}

function AboutMe() {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getPersona().then(setBody);
  }, []);
  const refresh = async () => {
    setBusy(true);
    try {
      setBody(await refreshPersona());
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="companion-section">
      <h3>🪪 About Me</h3>
      <p className="companion-hint">
        What Soumaya has learned about you from your galaxy. She keeps this current on her own
        and stays aware of it when she talks to you — it isn't edited by hand.
      </p>
      <div className="companion-persona">
        {body ? body : "Soumaya is still getting to know you — add a few more memories."}
      </div>
      <div className="row">
        <button onClick={refresh} disabled={busy} title="Re-derive from your latest memories">
          {busy ? "Updating…" : "↻ Update now"}
        </button>
      </div>
    </section>
  );
}

function Instructions() {
  const [list, setList] = useState<InstructionProfile[]>([]);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<"always" | "auto">("always");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  // Inline edit state.
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editBody, setEditBody] = useState("");

  const refresh = () => getInstructions().then(setList);
  useEffect(() => {
    refresh();
  }, []);

  const add = async () => {
    if (!name.trim() || !body.trim()) {
      setMsg("Add a name and the instructions before saving.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      await createInstruction({ name: name.trim(), body: body.trim(), mode });
      setName("");
      setBody("");
      setMode("always");
      await refresh();
      setMsg("Added.");
      setTimeout(() => setMsg(""), 1500);
    } catch (err) {
      setMsg((err as Error).message || "Couldn't add that profile.");
    } finally {
      setBusy(false);
    }
  };
  const beginEdit = (p: InstructionProfile) => {
    setEditId(p.id);
    setEditName(p.name);
    setEditBody(p.body);
  };
  const saveEdit = async () => {
    if (editId == null) return;
    try {
      await updateInstruction(editId, { name: editName.trim(), body: editBody.trim() });
      setEditId(null);
      refresh();
    } catch (err) {
      setMsg((err as Error).message);
    }
  };
  const toggle = (p: InstructionProfile) => updateInstruction(p.id, { enabled: !p.enabled }).then(refresh);
  const cycleMode = (p: InstructionProfile) =>
    updateInstruction(p.id, { mode: p.mode === "always" ? "auto" : "always" }).then(refresh);
  const remove = (p: InstructionProfile) => deleteInstruction(p.id).then(refresh);

  return (
    <section className="companion-section">
      <h3>🎭 Custom Instructions</h3>
      <p className="companion-hint">
        Roles she can adopt. Toggle them on to stack them. <b>Always</b> = every message;
        <b> Auto</b> = she brings it in when the topic fits. Put in as much detail as you like.
      </p>
      <datalist id="role-presets">
        {ROLE_PRESETS.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      <ul className="companion-list">
        {list.map((p) =>
          editId === p.id ? (
            <li key={p.id} className="companion-item">
              <input
                className="tag-input wide"
                list="role-presets"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
              <textarea
                className="companion-textarea"
                rows={4}
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
              />
              <div className="row">
                <button onClick={saveEdit}>Save</button>
                <button className="mini" onClick={() => setEditId(null)}>
                  Cancel
                </button>
              </div>
            </li>
          ) : (
            <li key={p.id} className="companion-item">
              <div className="companion-item-head">
                <button
                  className={`tag-chip ${p.enabled ? "on" : ""}`}
                  onClick={() => toggle(p)}
                  title={p.enabled ? "Enabled — tap to disable" : "Disabled — tap to enable"}
                >
                  {p.enabled ? "●" : "○"} {p.name}
                </button>
                <button className="companion-mode" onClick={() => cycleMode(p)} title="Switch always/auto">
                  {p.mode}
                </button>
                <button className="companion-edit" onClick={() => beginEdit(p)} aria-label="Edit">
                  ✎
                </button>
                <button className="companion-del" onClick={() => remove(p)} aria-label="Delete">
                  ×
                </button>
              </div>
              <p className="companion-body">{p.body}</p>
            </li>
          ),
        )}
        {list.length === 0 && <li className="empty small">No profiles yet — create one below.</li>}
      </ul>
      <div className="companion-new">
        <input
          className="tag-input wide"
          list="role-presets"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Role name (pick a preset or type your own)"
        />
        <textarea
          className="companion-textarea"
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="How should she behave in this role? Frameworks, tone, decision rules, an entire operating manual — as much as you want…"
        />
        <div className="row">
          <select value={mode} onChange={(e) => setMode(e.target.value as "always" | "auto")}>
            <option value="always">always on</option>
            <option value="auto">auto (route by topic)</option>
          </select>
          <button onClick={add} disabled={busy}>
            {busy ? "Adding…" : "Add profile"}
          </button>
          <span className="msg">{msg}</span>
        </div>
      </div>
    </section>
  );
}

function Knowledge() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => getDocuments().then(setDocs);
  useEffect(() => {
    refresh();
  }, []);

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ""));
      // Always populate the name from the chosen file (strip extension).
      setName(file.name.replace(/\.(txt|md|markdown)$/i, ""));
    };
    reader.readAsText(file);
  };

  const upload = async () => {
    if (!text.trim() || !name.trim()) {
      setMsg("Pick a file (or paste text) and give it a name.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const doc = await uploadDocument(name.trim(), text);
      setMsg(`Added "${doc.name}" (${doc.chunks ?? 0} chunks)`);
      setName("");
      setText("");
      if (fileRef.current) fileRef.current.value = "";
      await refresh();
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const rename = async (d: KnowledgeDoc) => {
    const next = prompt("Rename document", d.name);
    if (next && next.trim() && next.trim() !== d.name) {
      await renameDocument(d.id, next.trim());
      refresh();
    }
  };
  const remove = (d: KnowledgeDoc) => deleteDocument(d.id).then(refresh);

  return (
    <section className="companion-section">
      <h3>📚 Knowledge</h3>
      <p className="companion-hint">
        Reference docs she draws from when answering (frameworks, notes, research). Text &amp;
        Markdown for now.
      </p>
      <ul className="companion-list">
        {docs.map((d) => (
          <li key={d.id} className="companion-item">
            <div className="companion-item-head">
              <span className="companion-doc-name">📄 {d.name}</span>
              <span className="companion-doc-meta">{d.chunks ?? 0} chunks</span>
              <button className="companion-edit" onClick={() => rename(d)} aria-label="Rename">
                ✎
              </button>
              <button className="companion-del" onClick={() => remove(d)} aria-label="Delete">
                ×
              </button>
            </div>
          </li>
        ))}
        {docs.length === 0 && <li className="empty small">No documents yet.</li>}
      </ul>
      <div className="companion-new">
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,.markdown,text/plain,text/markdown"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <input
          className="tag-input wide"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Document name"
        />
        <textarea
          className="companion-textarea"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="…or paste text directly"
        />
        <div className="row">
          <button onClick={upload} disabled={busy}>
            {busy ? "Embedding…" : "Add document"}
          </button>
          <span className="msg">{msg}</span>
        </div>
      </div>
    </section>
  );
}

function CompanionChat() {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!q.trim()) return;
    setBusy(true);
    setAnswer("");
    try {
      const r = await askChat(q.trim());
      setAnswer(r.answer || "(no answer)");
    } catch (err) {
      setAnswer((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="companion-section companion-try">
      <h3>💬 Try it</h3>
      <p className="companion-hint">
        Talk to Soumaya using your active roles + knowledge (same as the Chat tab).
      </p>
      {answer && <p className="companion-answer">{answer}</p>}
      <div className="companion-new">
        <textarea
          className="companion-textarea"
          rows={2}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask something…"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send();
          }}
        />
        <div className="row">
          <button onClick={send} disabled={busy}>
            {busy ? "Thinking…" : "Send"}
          </button>
        </div>
      </div>
    </section>
  );
}
