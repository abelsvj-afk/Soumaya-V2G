import { useEffect, useState } from "react";
import { currentSpace, updateProfile, getSettings, updateSetting } from "../api/client.js";
import { isVoiceEnabled, setVoiceEnabled, isVoiceSupported } from "../voice.js";
import { sfxEnabled, setSfxEnabled } from "../graph/sfx.js";

/**
 * Settings overlay (⚙️). Account (display name + unique gamer tag) plus app
 * preferences. Opened from a FAB; floats over the galaxy like the Observatory.
 */
export function SettingsPanel({
  onClose,
  onProfileUpdated,
  showShipTask,
  setShowShipTask,
}: {
  onClose: () => void;
  /** Push the new display name back to the app header. */
  onProfileUpdated?: (name: string) => void;
  showShipTask?: boolean;
  setShowShipTask?: (v: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [gamerTag, setGamerTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [research, setResearch] = useState(false);
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
    getSettings().then((s) => setResearch(s.research_enabled === "true")).catch(() => {});
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

  const toggleResearch = async () => {
    const next = !research;
    setResearch(next);
    await updateSetting("research_enabled", String(next)).catch(() => setResearch(!next));
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
          <label className="settings-toggle">
            <span>
              Research Mode
              <em>Lets Soumaya spend fuel on deep-dive research &amp; charting.</em>
            </span>
            <button className={`switch ${research ? "on" : ""}`} onClick={toggleResearch} aria-pressed={research}>
              <span className="knob" />
            </button>
          </label>
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
          {setShowShipTask && (
            <label className="settings-toggle">
              <span>
                Show Soumaya's task label
                <em>The floating tag above her ship.</em>
              </span>
              <button
                className={`switch ${showShipTask ? "on" : ""}`}
                onClick={() => setShowShipTask(!showShipTask)}
                aria-pressed={!!showShipTask}
              >
                <span className="knob" />
              </button>
            </label>
          )}
        </section>
      </div>
    </div>
  );
}
