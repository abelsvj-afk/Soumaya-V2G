import { useState } from "react";
import { authSpace } from "../api/client.js";

/**
 * The gate to a private brain. A name + passcode opens an existing brain (on any
 * device) or creates a new one if the name is free — no email, no accounts.
 */
export function LoginScreen({ onAuthed }: { onAuthed: (space: { id: string; name: string }) => void }) {
  const [name, setName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await authSpace(name.trim(), passcode);
      onAuthed({ id: res.id, name: res.name });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>
          Soumaya <span className="sep">·</span> Second Brain
        </h1>
        <p className="login-sub">
          Open your private galaxy with a name and a passcode. Use the same pair on any
          device to return to it. A new name creates a fresh brain.
        </p>
        <form onSubmit={submit} className="login-form">
          <label>
            Brain name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. soumaya"
              autoCapitalize="none"
              autoCorrect="off"
              minLength={2}
              maxLength={40}
              required
            />
          </label>
          <label>
            Passcode
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="at least 4 characters"
              minLength={4}
              required
            />
          </label>
          {error && <p className="login-error">{error}</p>}
          <button type="submit" disabled={busy || name.trim().length < 2 || passcode.length < 4}>
            {busy ? "Opening…" : "Enter my galaxy"}
          </button>
        </form>
        <p className="login-note">
          Your passcode is hashed and never stored in the clear. Keep it safe — it's the
          only way back into this brain.
        </p>
      </div>
    </div>
  );
}
