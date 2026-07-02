import { useEffect, useState } from "react";
import { currentSpace, updateProfile } from "../api/client.js";
import { isVoiceEnabled, setVoiceEnabled, isVoiceSupported } from "../voice.js";
import { sfxEnabled, setSfxEnabled } from "../graph/sfx.js";

/**
 * Settings overlay (⚙️). Account (display name + unique gamer tag) plus app
 * preferences. Opened from a FAB; floats over the galaxy like the Observatory.
 * Soumaya-specific switches (Research Mode, ship-task label) live in HER tab —
 * this panel deliberately doesn't duplicate them.
 */
export function SettingsPanel({
  onClose,
  onProfileUpdated,
}: {
  onClose: () => void;
  /** Push the new display name back to the app header. */
  onProfileUpdated?: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [gamerTag, setGamerTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [voice, setVoice] = useState(isVoiceEnabled());
  const [sfx, setSfx] = useState(sfxEnabled());
  const voiceSupported = isVoiceSupported();

  useEffect(() => {
    currentSpace().then((s) => {
      if (s) {
        setName(s.name ?? "");
        setGamerTag(s.gamerTag ?? "");
      }
    });
  }, []);

  const saveProfile = async () => {
    setBusy(true);
    setMsg("");
    try {
      const updated = await updateProfile({ name: name.trim(), gamerTag: gamerTag.trim() });
      setName(updated.name);
      setGamerTag(updated.gamerTag);
      onProfileUpdated?.(updated.name);
      setMsg("Saved ✓");
      setTimeout(() => setMsg(""), 2000);
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleVoice = () => {
    const next = !voice;
    setVoice(next);
    setVoiceEnabled(next);
  };

  return (
    <div className="settings-overlay" role="dialog" aria-label="Settings">
      <div className="settings-card">
        <header className="settings-head">
          <h2>⚙️ Settings</h2>
          <button className="settings-close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <section className="settings-section">
          <h3>Account</h3>
          <label className="settings-field">
            <span>Display name</span>
            <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Your name (anything)" />
          </label>
          <label className="settings-field">
            <span>Gamer tag <em>(unique)</em></span>
            <input
              value={gamerTag}
              maxLength={40}
              onChange={(e) => setGamerTag(e.target.value)}
              placeholder="A unique handle"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </label>
          <div className="row">
            <button onClick={saveProfile} disabled={busy || gamerTag.trim().length < 2 || name.trim().length < 1}>
              {busy ? "Saving…" : "Save profile"}
            </button>
            <span className="msg">{msg}</span>
          </div>
        </section>

        <section className="settings-section">
          <h3>Preferences</h3>
          {/* Research Mode + the ship-task label live in the Soumaya tab (🛰️),
              next to the fuel they relate to — two unsynced copies of the same
              switch here kept drifting out of step. */}
          <p className="settings-note" style={{ fontSize: "12px", opacity: 0.75, margin: "0 0 10px" }}>
            Research Mode and her floating task label are in the <b>🛰️ Soumaya</b> tab.
          </p>
          {voiceSupported && (
            <label className="settings-toggle">
              <span>
                Voice replies
                <em>She reads chat answers aloud.</em>
              </span>
              <button className={`switch ${voice ? "on" : ""}`} onClick={toggleVoice} aria-pressed={voice}>
                <span className="knob" />
              </button>
            </label>
          )}
          <label className="settings-toggle">
            <span>
              Interface sounds
              <em>Soft taps &amp; cues for clicks, saves, and notifications.</em>
            </span>
            <button
              className={`switch ${sfx ? "on" : ""}`}
              onClick={() => {
                const next = !sfx;
                setSfx(next);
                setSfxEnabled(next);
              }}
              aria-pressed={sfx}
            >
              <span className="knob" />
            </button>
          </label>
        </section>
      </div>
    </div>
  );
}
