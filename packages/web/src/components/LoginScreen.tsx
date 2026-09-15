import { useState } from "react";
import { authSpace } from "../api/client.js";

/**
 * The gate to a private brain. A gamer tag + passcode opens an existing brain (on any
 * device) or creates a new one with a custom companion name.
 */
export function LoginScreen({ onAuthed }: { onAuthed: (space: { id: string; name: string }) => void }) {
  const [gamerTag, setGamerTag] = useState("");
  const [brainName, setBrainName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmedGamerTag = gamerTag.trim();
    const trimmedBrainName = brainName.trim();

    if (isSignUp) {
      if (trimmedGamerTag.toLowerCase() === "soumaya") {
        setError("The name/gamer tag 'Soumaya' is reserved.");
        return;
      }
      if (trimmedBrainName.toLowerCase() === "soumaya") {
        setError("The name/gamer tag 'Soumaya' is reserved.");
        return;
      }
      if (!trimmedBrainName) {
        setError("Please enter a name for your second brain/companion.");
        return;
      }
    }

    setBusy(true);
    try {
      const res = await authSpace(trimmedGamerTag, passcode, isSignUp ? trimmedBrainName : undefined);
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
          {isSignUp
            ? "Create a new private town. Choose a unique gamer tag and name your companion."
            : "Open your private town with your gamer tag and passcode."}
        </p>

        <div className="login-tabs" style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
          <button
            type="button"
            className={`login-tab-btn ${!isSignUp ? "active" : ""}`}
            onClick={() => {
              setIsSignUp(false);
              setError("");
            }}
            style={{
              background: !isSignUp ? "rgba(255, 255, 255, 0.15)" : "transparent",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              color: "white",
              padding: "0.5rem 1rem",
              borderRadius: "4px",
              cursor: "pointer",
              flex: 1,
            }}
          >
            Enter My Town
          </button>
          <button
            type="button"
            className={`login-tab-btn ${isSignUp ? "active" : ""}`}
            onClick={() => {
              setIsSignUp(true);
              setError("");
            }}
            style={{
              background: isSignUp ? "rgba(255, 255, 255, 0.15)" : "transparent",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              color: "white",
              padding: "0.5rem 1rem",
              borderRadius: "4px",
              cursor: "pointer",
              flex: 1,
            }}
          >
            Create New Town
          </button>
        </div>

        <form onSubmit={submit} className="login-form">
          <label>
            Gamer tag
            <input
              value={gamerTag}
              onChange={(e) => setGamerTag(e.target.value)}
              placeholder="e.g. wanderer77"
              autoCapitalize="none"
              autoCorrect="off"
              minLength={2}
              maxLength={40}
              required
            />
          </label>

          {isSignUp && (
            <label>
              Brain / Companion name
              <input
                value={brainName}
                onChange={(e) => setBrainName(e.target.value)}
                placeholder="e.g. Luna"
                autoCapitalize="none"
                autoCorrect="off"
                minLength={2}
                maxLength={40}
                required
              />
            </label>
          )}

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
          <button
            type="submit"
            disabled={
              busy ||
              gamerTag.trim().length < 2 ||
              (isSignUp && brainName.trim().length < 2) ||
              passcode.length < 4
            }
          >
            {busy ? "Opening…" : isSignUp ? "Create my town" : "Enter my town"}
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
