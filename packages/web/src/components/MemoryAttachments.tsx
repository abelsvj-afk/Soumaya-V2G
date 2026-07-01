import { useEffect, useRef, useState } from "react";
import type { Attachment } from "@brain/shared";
import { listAttachments, addAttachment, deleteAttachment, downloadAttachment } from "../api/client.js";
import { pushToast } from "./Toasts.js";

/**
 * Attachments on a memory note — the downloadable "doc kept inside a memory". Pick a
 * file, it's read to base64 and stored against this node; each shows a download + a
 * remove control. Disabled in demo (no backend). Small files only (server-capped).
 */
const fmtSize = (b: number) => (b < 1024 ? `${b} B` : b < 1e6 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1e6).toFixed(1)} MB`);

export function MemoryAttachments({ nodeId, demo }: { nodeId: number; demo?: boolean }) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (demo) return;
    let alive = true;
    listAttachments(nodeId).then((a) => alive && setItems(a)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [nodeId, demo]);

  const onPick = async (file: File) => {
    setBusy(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.includes("base64,") ? dataUrl.slice(dataUrl.indexOf("base64,") + 7) : dataUrl;
      const meta = await addAttachment(nodeId, {
        filename: file.name,
        mime: file.type || "application/octet-stream",
        data: base64,
      });
      setItems((prev) => [meta, ...prev]);
      pushToast(`Attached "${file.name}" 📎`, "📎", 3500);
    } catch (err) {
      pushToast((err as Error).message || "Attach failed", "⚠️", 4500);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onRemove = async (att: Attachment) => {
    if (!(await deleteAttachment(nodeId, att.id))) return;
    setItems((prev) => prev.filter((a) => a.id !== att.id));
  };

  if (demo) return null;

  return (
    <div style={{ marginTop: "0.85rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
        <h4 style={{ margin: 0, fontSize: "0.82rem" }}>📎 Attachments</h4>
        <button className="mini" disabled={busy} onClick={() => inputRef.current?.click()} title="Attach a document to this memory">
          {busy ? "Uploading…" : "+ Add file"}
        </button>
        <input
          ref={inputRef}
          type="file"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onPick(f);
          }}
        />
      </div>
      {items.length === 0 ? (
        <p style={{ fontSize: "0.74rem", opacity: 0.6, margin: 0 }}>No files yet — keep a PDF, doc, image, or note right on this memory.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          {items.map((a) => (
            <li key={a.id} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem" }}>
              <button
                className="pill"
                style={{ flex: 1, textAlign: "left" }}
                onClick={() => downloadAttachment(a).catch(() => pushToast("Download failed", "⚠️", 3500))}
                title="Download this file"
              >
                ⬇ {a.filename}
              </button>
              <span style={{ opacity: 0.5, fontSize: "0.68rem" }}>{fmtSize(a.size)}</span>
              <button className="mini" style={{ padding: "0.1rem 0.4rem" }} onClick={() => void onRemove(a)} title="Remove">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
