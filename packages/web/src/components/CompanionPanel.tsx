import { useEffect, useRef, useState } from "react";
import { extractFileText } from "../lib/extractFileText.js";
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
 *  - Custom Instructions: stackable roles she adopts (collapsible; editable).
 *  - Knowledge: reference docs she retrieves from (txt/md/pdf/docx).
 * (There's no chat here on purpose — talk to her in the 🛰️ Soumaya tab, which
 *  already uses these active roles + knowledge. Kept single to avoid redundancy.)
 */
export function CompanionPanel({ demo, spaceName = "Soumaya" }: { demo?: boolean; spaceName?: string }) {
  if (demo) {
    return <p className="empty">The Companion is available in your own brain — sign in to configure it.</p>;
  }
  return (
    <div className="dock-body">
      <AboutMe />
      <Instructions />
      <Knowledge />
      <p className="companion-hint companion-tryhint">
        💬 Try your active roles + knowledge by talking to her in the 🛰️ {spaceName} tab.
      </p>
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
  const [adding, setAdding] = useState(false); // the "new profile" form is collapsed by default
  const [expandedId, setExpandedId] = useState<number | null>(null); // which item shows its full body
  // Inline edit state.
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editMode, setEditMode] = useState<"always" | "auto">("always");

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
      setAdding(false);
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
    setEditMode(p.mode === "auto" ? "auto" : "always");
  };
  const saveEdit = async () => {
    if (editId == null) return;
    try {
      await updateInstruction(editId, { name: editName.trim(), body: editBody.trim(), mode: editMode });
      setEditId(null);
      refresh();
    } catch (err) {
      setMsg((err as Error).message);
    }
  };
  const toggle = (p: InstructionProfile) => updateInstruction(p.id, { enabled: !p.enabled }).then(refresh);
  const remove = (p: InstructionProfile) => deleteInstruction(p.id).then(refresh);

  return (
    <section className="companion-section">
      <h3>🎭 Custom Instructions</h3>
      <p className="companion-hint">
        Roles she can adopt. Toggle them on to stack them. <b>Always</b> = every message;
        <b> Auto</b> = she brings it in when the topic fits. Tap a role to expand it.
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
                rows={5}
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
              />
              <div className="row">
                <select value={editMode} onChange={(e) => setEditMode(e.target.value as "always" | "auto")}>
                  <option value="always">always on</option>
                  <option value="auto">auto (route by topic)</option>
                </select>
                <button onClick={saveEdit}>Save</button>
                <button className="mini" onClick={() => setEditId(null)}>
                  Cancel
                </button>
              </div>
            </li>
          ) : (
            <li key={p.id} className={`companion-item ${expandedId === p.id ? "open" : ""}`}>
              <div className="companion-item-head">
                <button
                  className="companion-expand"
                  onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                  aria-label={expandedId === p.id ? "Collapse" : "Expand"}
                  title={expandedId === p.id ? "Collapse" : "Expand"}
                >
                  {expandedId === p.id ? "▾" : "▸"}
                </button>
                <button
                  className={`tag-chip ${p.enabled ? "on" : ""}`}
                  onClick={() => toggle(p)}
                  title={p.enabled ? "Enabled — tap to disable" : "Disabled — tap to enable"}
                >
                  {p.enabled ? "●" : "○"} {p.name}
                </button>
                <span className="companion-mode-tag" title={`${p.mode} mode`}>{p.mode}</span>
                <button className="companion-edit" onClick={() => beginEdit(p)} aria-label="Edit">
                  ✎
                </button>
                <button className="companion-del" onClick={() => remove(p)} aria-label="Delete">
                  ×
                </button>
              </div>
              <p className={`companion-body ${expandedId === p.id ? "" : "clamp"}`} onClick={() => setExpandedId(p.id)}>
                {p.body}
              </p>
            </li>
          ),
        )}
        {list.length === 0 && <li className="empty small">No profiles yet — add one below.</li>}
      </ul>

      {adding ? (
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
            rows={5}
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
              {busy ? "Adding…" : "Save profile"}
            </button>
            <button className="mini" onClick={() => { setAdding(false); setMsg(""); }}>
              Cancel
            </button>
            <span className="msg">{msg}</span>
          </div>
        </div>
      ) : (
        <button className="companion-add-btn" onClick={() => setAdding(true)}>
          + New role
        </button>
      )}
    </section>
  );
}

function Knowledge() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [renameId, setRenameId] = useState<number | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => getDocuments().then(setDocs);
  useEffect(() => {
    refresh();
  }, []);

  const onFile = async (file: File) => {
    setMsg("Reading file…");
    try {
      const { text: extracted, name: suggested } = await extractFileText(file);
      setText(extracted);
      setName(suggested); // populate the name from the chosen file (extension stripped)
      setMsg(`Loaded "${file.name}" (${extracted.length.toLocaleString()} chars). Review + name it, then Add.`);
    } catch (err) {
      setMsg((err as Error).message);
    }
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
  const saveRename = async (d: KnowledgeDoc) => {
    const next = renameVal.trim();
    if (next && next !== d.name) {
      await renameDocument(d.id, next);
      await refresh();
    }
    setRenameId(null);
  };
  const remove = (d: KnowledgeDoc) => deleteDocument(d.id).then(refresh);

  return (
    <section className="companion-section">
      <h3>📚 Knowledge</h3>
      <p className="companion-hint">
        Reference docs she draws from when answering (frameworks, notes, research). Text, Markdown,
        PDF &amp; Word (.docx) — or paste text directly.
      </p>
      <ul className="companion-list">
        {docs.map((d) => (
          <li key={d.id} className="companion-item">
            {renameId === d.id ? (
              <div className="companion-item-head">
                <input
                  className="tag-input wide"
                  value={renameVal}
                  autoFocus
                  onChange={(e) => setRenameVal(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveRename(d)}
                />
                <button className="mini" onClick={() => saveRename(d)}>Save</button>
                <button className="mini ghost" onClick={() => setRenameId(null)}>Cancel</button>
              </div>
            ) : (
              <div className="companion-item-head">
                <span className="companion-doc-name">📄 {d.name}</span>
                <span className="companion-doc-meta">{d.chunks ?? 0} chunks</span>
                <button
                  className="companion-edit"
                  onClick={() => { setRenameId(d.id); setRenameVal(d.name); }}
                  aria-label="Rename"
                >
                  ✎
                </button>
                <button className="companion-del" onClick={() => remove(d)} aria-label="Delete">
                  ×
                </button>
              </div>
            )}
          </li>
        ))}
        {docs.length === 0 && <li className="empty small">No documents yet.</li>}
      </ul>
      <div className="companion-new">
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,.markdown,.pdf,.docx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
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
