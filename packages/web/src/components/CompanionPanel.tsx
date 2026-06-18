import { useEffect, useRef, useState } from "react";
import {
  getPersona,
  setPersona,
  getInstructions,
  createInstruction,
  updateInstruction,
  deleteInstruction,
  getDocuments,
  uploadDocument,
  deleteDocument,
  type InstructionProfile,
  type KnowledgeDoc,
} from "../api/client.js";

/**
 * The 🧠 Companion tab: configure WHO Soumaya is to you.
 *  - About Me: who you are (she's always aware, never becomes you).
 *  - Custom Instructions: stackable roles she adopts (always-on or intent-routed).
 *  - Knowledge: reference docs she retrieves from when answering.
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
    </div>
  );
}

function AboutMe() {
  const [body, setBody] = useState("");
  const [saved, setSaved] = useState(true);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    getPersona().then((b) => setBody(b));
  }, []);
  const save = async () => {
    await setPersona(body);
    setSaved(true);
    setMsg("Saved");
    setTimeout(() => setMsg(""), 1500);
  };
  return (
    <section className="companion-section">
      <h3>🪪 About Me</h3>
      <p className="companion-hint">
        Who you are, what matters to you, how you like to be spoken to. Soumaya is always aware
        of this and tailors her replies — she never pretends to be you.
      </p>
      <textarea
        className="companion-textarea"
        rows={5}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setSaved(false);
        }}
        placeholder="e.g. I'm a founder juggling a startup and family. Be direct, a little warm, and challenge my assumptions…"
      />
      <div className="row">
        <button onClick={save} disabled={saved}>
          {saved ? "Saved" : "Save"}
        </button>
        <span className="msg">{msg}</span>
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
  const refresh = () => getInstructions().then(setList);
  useEffect(() => {
    refresh();
  }, []);

  const add = async () => {
    if (!name.trim() || !body.trim()) return;
    setBusy(true);
    try {
      await createInstruction({ name: name.trim(), body: body.trim(), mode });
      setName("");
      setBody("");
      setMode("always");
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (p: InstructionProfile) => {
    await updateInstruction(p.id, { enabled: !p.enabled });
    refresh();
  };
  const cycleMode = async (p: InstructionProfile) => {
    await updateInstruction(p.id, { mode: p.mode === "always" ? "auto" : "always" });
    refresh();
  };
  const remove = async (p: InstructionProfile) => {
    await deleteInstruction(p.id);
    refresh();
  };

  return (
    <section className="companion-section">
      <h3>🎭 Custom Instructions</h3>
      <p className="companion-hint">
        Roles she can adopt — Therapist, Business Advisor, Creative Partner… Toggle them on to
        stack them. <b>Always</b> = applied every message; <b>Auto</b> = she brings it in when the
        topic fits.
      </p>
      <ul className="companion-list">
        {list.map((p) => (
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
              <button className="companion-del" onClick={() => remove(p)} aria-label="Delete">
                ×
              </button>
            </div>
            <p className="companion-body">{p.body}</p>
          </li>
        ))}
        {list.length === 0 && <li className="empty small">No profiles yet — create one below.</li>}
      </ul>
      <div className="companion-new">
        <input
          className="tag-input wide"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Profile name (e.g. Therapist)"
        />
        <textarea
          className="companion-textarea"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="How should she behave in this role? Frameworks, tone, what to focus on…"
        />
        <div className="row">
          <select value={mode} onChange={(e) => setMode(e.target.value as "always" | "auto")}>
            <option value="always">always on</option>
            <option value="auto">auto (route by topic)</option>
          </select>
          <button onClick={add} disabled={busy}>
            {busy ? "Adding…" : "Add profile"}
          </button>
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
      if (!name.trim()) setName(file.name.replace(/\.(txt|md|markdown)$/i, ""));
    };
    reader.readAsText(file);
  };

  const upload = async () => {
    if (!text.trim() || !name.trim()) return;
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
  const remove = async (d: KnowledgeDoc) => {
    await deleteDocument(d.id);
    refresh();
  };

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
