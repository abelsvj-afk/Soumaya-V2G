import { useEffect, useRef, useState } from "react";
import { currentSpace, updateProfile } from "../api/client.js";
import { isVoiceEnabled, setVoiceEnabled, isVoiceSupported } from "../voice.js";
import { sfxEnabled, setSfxEnabled } from "../graph/sfx.js";
import {
  getGraphics,
  setGraphicsMode,
  setGraphicsField,
  resolveGraphics,
  GRAPHICS_MODES,
  type GraphicsSettings,
  type Level,
} from "../graph/graphicsConfig.js";

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
  const [gfx, setGfx] = useState<GraphicsSettings>(getGraphics());
  const [liteOn, setLiteOn] = useState(() => {
    try { return localStorage.getItem("brain.lite") === "1"; } catch { return false; }
  });
  const voiceSupported = isVoiceSupported();
  const resolved = resolveGraphics(gfx);

  // Live FPS while this panel is open, so a graphics change visibly bites (the galaxy
  // keeps rendering behind the overlay). Sampled every 500ms.
  const [fps, setFps] = useState<number | null>(null);
  const fpsRef = useRef({ frames: 0, t0: 0, raf: 0 });
  useEffect(() => {
    const st = fpsRef.current;
    st.t0 = performance.now();
    const tick = () => {
      st.frames++;
      const now = performance.now();
      if (now - st.t0 >= 500) {
        setFps(Math.round((st.frames * 1000) / (now - st.t0)));
        st.frames = 0;
        st.t0 = now;
      }
      st.raf = requestAnimationFrame(tick);
    };
    st.raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(st.raf);
  }, []);
  const fpsClass = fps == null ? "" : fps >= 45 ? "good" : fps >= 25 ? "ok" : "bad";

  const pickMode = (m: GraphicsSettings["mode"]) => setGfx(setGraphicsMode(m));
  const setField = <K extends keyof GraphicsSettings>(k: K, v: GraphicsSettings[K]) => setGfx(setGraphicsField(k, v));
  const Seg = <T extends string>({ value, options, onPick }: { value: T; options: T[]; onPick: (v: T) => void }) => (
    <span className="seg">
      {options.map((o) => (
        <button key={o} className={value === o ? "on" : ""} onClick={() => onPick(o)}>
          {o[0]!.toUpperCase() + o.slice(1)}
        </button>
      ))}
    </span>
  );

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

        <section className="settings-section">
          <h3>🎨 Graphics &amp; performance</h3>
          <label className="settings-toggle">
            <span>
              Lite mode <em>Turn OFF the 3D galaxy. The app stays fully usable if your device can't render it.</em>
            </span>
            <button
              className={`switch ${liteOn ? "on" : ""}`}
              onClick={() => {
                const next = !liteOn;
                setLiteOn(next);
                try { localStorage.setItem("brain.lite", next ? "1" : "0"); } catch { /* ignore */ }
                setTimeout(() => window.location.reload(), 150); // remount without/with the galaxy
              }}
              aria-pressed={liteOn}
            >
              <span className="knob" />
            </button>
          </label>
          <div className="gfx-live">
            <span className={`gfx-fps ${fpsClass}`}>{fps == null ? "…" : fps} FPS</span>
            <span className="gfx-tier">tier: <b>{resolved.tier}</b></span>
            <span className="gfx-live-hint">live — watch it change as you tune below</span>
          </div>
          <p className="settings-note" style={{ fontSize: "12px", opacity: 0.75, margin: "0 0 10px" }}>
            One galaxy, tuned to your device. Weaker phones get the full experience, optimized —
            never fewer features.
          </p>
          <div className="gfx-modes">
            {GRAPHICS_MODES.map((m) => (
              <button
                key={m.id}
                className={`gfx-mode ${gfx.mode === m.id ? "on" : ""}`}
                onClick={() => pickMode(m.id)}
                title={m.hint}
              >
                <b>{m.label}</b>
                <em>{m.hint}</em>
              </button>
            ))}
          </div>

          <label className="settings-toggle">
            <span>Bloom glow <em>Cinematic light bloom (costly on weak GPUs).</em></span>
            <span className="gfx-when reload">reload</span>
            <button className={`switch ${gfx.bloom ? "on" : ""}`} onClick={() => setField("bloom", !gfx.bloom)} aria-pressed={gfx.bloom}>
              <span className="knob" />
            </button>
          </label>
          <div className="gfx-row"><span>Star density <em className="gfx-when reload">reload</em></span><Seg value={gfx.starDensity} options={["low", "medium", "high"] as Level[]} onPick={(v) => setField("starDensity", v)} /></div>
          <div className="gfx-row"><span>Particle effects <em className="gfx-when reload">reload</em></span><Seg value={gfx.particles} options={["low", "medium", "high"] as Level[]} onPick={(v) => setField("particles", v)} /></div>
          <div className="gfx-row"><span>Animation quality <em className="gfx-when instant">instant</em></span><Seg value={gfx.animationQuality} options={["low", "medium", "high"] as Level[]} onPick={(v) => setField("animationQuality", v)} /></div>
          <div className="gfx-row"><span>Render quality <em className="gfx-when instant">instant</em></span><Seg value={gfx.renderQuality} options={["auto", "low", "medium", "high"]} onPick={(v) => setField("renderQuality", v as GraphicsSettings["renderQuality"])} /></div>
          <div className="gfx-row"><span>FPS cap <em className="gfx-when instant">instant</em></span><Seg value={String(gfx.fpsCap)} options={["30", "45", "60"]} onPick={(v) => setField("fpsCap", Number(v) as GraphicsSettings["fpsCap"])} /></div>
          <div className="gfx-row"><span>Background scenery <em className="gfx-when reload">reload</em></span><Seg value={gfx.sceneryOverride ?? "auto"} options={["auto", "on", "off"]} onPick={(v) => setField("sceneryOverride", v as NonNullable<GraphicsSettings["sceneryOverride"]>)} /></div>
          <label className="settings-toggle">
            <span>Battery saver <em>Caps FPS, drops bloom + resolution to save power.</em></span>
            <span className="gfx-when instant">instant</span>
            <button className={`switch ${gfx.batterySaver ? "on" : ""}`} onClick={() => setField("batterySaver", !gfx.batterySaver)} aria-pressed={gfx.batterySaver}>
              <span className="knob" />
            </button>
          </label>
          <p className="settings-note" style={{ fontSize: "11px", opacity: 0.6, margin: "8px 0 0" }}>
            <b>instant</b> changes apply right away (watch the FPS above); <b>reload</b> ones take effect next open.
          </p>
        </section>
      </div>
    </div>
  );
}
