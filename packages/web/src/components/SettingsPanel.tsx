import { useEffect, useRef, useState } from "react";
import { currentSpace, updateProfile } from "../api/client.js";
import { isVoiceEnabled, setVoiceEnabled, isVoiceSupported } from "../voice.js";
import { sfxEnabled, setSfxEnabled } from "../graph/sfx.js";
import { isColorblind, setColorblind } from "../graph/theme.js";
import { prefersReducedMotion, setReducedMotionOverride } from "../graph/motion.js";
import {
  isDiagnosticsEnabled,
  setDiagnosticsEnabled,
} from "../diagnostics/config.js";
import {
  clearDiagnosticEvents,
  getDiagnosticSnapshot,
} from "../diagnostics/buffer.js";
import {
  getGraphics,
  setGraphicsMode,
  setGraphicsField,
  resolveGraphics,
  GRAPHICS_MODES,
  type GraphicsSettings,
  type Level,
} from "../graph/graphicsConfig.js";
import { perfHudEnabled, setPerfHudEnabled } from "./PerfHUD.js";
import { pushToast } from "./Toasts.js";
import { loadPersistedRung, RUNG_TABLE, ADAPTIVE_MODEL_VERSION } from "../graph/adaptiveController.js";

/** Was defined INSIDE SettingsPanel's render body — a fresh function identity on
 *  every render, which React treats as a brand-new component type. This panel
 *  re-renders ~2x/sec while open (the live FPS sampler below), so all 6 `<Seg>`
 *  usages were fully unmounting and remounting their DOM twice a second. */
function Seg<T extends string>({ value, options, onPick }: { value: T; options: T[]; onPick: (v: T) => void }) {
  return (
    <span className="seg">
      {options.map((o) => (
        <button key={o} className={value === o ? "on" : ""} onClick={() => onPick(o)}>
          {o[0]!.toUpperCase() + o.slice(1)}
        </button>
      ))}
    </span>
  );
}

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
  const [profileDirty, setProfileDirty] = useState(false);
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (msgTimer.current) clearTimeout(msgTimer.current);
  }, []);
  const [voice, setVoice] = useState(isVoiceEnabled());
  const [sfx, setSfx] = useState(sfxEnabled());
  const [gfx, setGfx] = useState<GraphicsSettings>(getGraphics());
  const [liteOn, setLiteOn] = useState(() => {
    try { return localStorage.getItem("brain.lite") === "1"; } catch { return false; }
  });
  const [colorblind, setCb] = useState(isColorblind());
  const [reduceMotion, setRm] = useState(prefersReducedMotion());
  const [diagnosticsOn, setDiagnosticsOn] = useState(isDiagnosticsEnabled());
  const [perfHudOn, setPerfHudOn] = useState(perfHudEnabled());
  const [diagReport, setDiagReport] = useState<string | null>(null);
  const voiceSupported = isVoiceSupported();
  // Stage 6: reflect the adaptive controller's last-persisted rung (auto mode only —
  // resolveGraphics ignores it otherwise) so this label shows what's actually
  // rendering, not just the one-shot detectTier() guess. Re-read on every render; the
  // FPS sampler below already re-renders this panel ~2x/sec while it's open, so this
  // stays reasonably live without any extra event wiring.
  const persistedRung = loadPersistedRung(ADAPTIVE_MODEL_VERSION);
  const resolved = resolveGraphics(gfx, persistedRung ? RUNG_TABLE[persistedRung.rung] : undefined);

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

  useEffect(() => {
    let cancelled = false;
    currentSpace()
      .then((s) => {
        if (cancelled || !s) return;
        setName(s.name ?? "");
        setGamerTag(s.gamerTag ?? "");
      })
      .catch(() => { /* profile fields just stay blank — nothing to save yet */ });
    return () => {
      cancelled = true;
    };
  }, []);

  const saveProfile = async () => {
    setBusy(true);
    setMsg("");
    try {
      const updated = await updateProfile({ name: name.trim(), gamerTag: gamerTag.trim() });
      setName(updated.name);
      setGamerTag(updated.gamerTag);
      setProfileDirty(false);
      onProfileUpdated?.(updated.name);
      setMsg("Saved ✓");
      if (msgTimer.current) clearTimeout(msgTimer.current);
      msgTimer.current = setTimeout(() => setMsg(""), 2000);
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
            <input
              value={name}
              maxLength={40}
              disabled={busy}
              onChange={(e) => { setName(e.target.value); setProfileDirty(true); }}
              placeholder="Your name (anything)"
            />
          </label>
          <label className="settings-field">
            <span>Gamer tag <em>(unique)</em></span>
            <input
              value={gamerTag}
              maxLength={40}
              disabled={busy}
              onChange={(e) => { setGamerTag(e.target.value); setProfileDirty(true); }}
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
          <h3>♿ Accessibility</h3>
          <label className="settings-toggle">
            <span>
              Colorblind-safe colours
              <em>Swaps the link/emotion palette to blue · orange · grey (the Legend follows).</em>
            </span>
            <button
              className={`switch ${colorblind ? "on" : ""}`}
              onClick={() => {
                const next = !colorblind;
                setCb(next);
                setColorblind(next);
              }}
              aria-pressed={colorblind}
            >
              <span className="knob" />
            </button>
          </label>
          <label className="settings-toggle">
            <span>
              Reduce motion
              <em>Calms the galaxy — slows orbital drift, ribbon flow &amp; glow pulsing; skips link sparks.</em>
            </span>
            <button
              className={`switch ${reduceMotion ? "on" : ""}`}
              onClick={() => {
                const next = !reduceMotion;
                setRm(next);
                setReducedMotionOverride(next);
              }}
              aria-pressed={reduceMotion}
            >
              <span className="knob" />
            </button>
          </label>
        </section>

        <section className="settings-section">
          <h3>🔬 Diagnostics</h3>
          <label className="settings-toggle">
            <span>
              Diagnostic recording
              <em>{diagnosticsOn ? "ON - Events are being logged." : "OFF - Zero overhead."}</em>
            </span>
            <button
              className={`switch ${diagnosticsOn ? "on" : ""}`}
              onClick={() => {
                const next = !diagnosticsOn;
                setDiagnosticsOn(next);
                setDiagnosticsEnabled(next);
              }}
              aria-pressed={diagnosticsOn}
            >
              <span className="knob" />
            </button>
          </label>
          <div className="row" style={{ marginTop: "10px", gap: "8px", display: "flex", flexWrap: "wrap" }}>
            <button onClick={() => { if (confirm("Clear all recorded diagnostic events?")) clearDiagnosticEvents(); }}>Clear Events</button>
            <button onClick={() => setDiagReport(JSON.stringify(getDiagnosticSnapshot(), null, 2))}>View Report</button>
            {diagReport && (
              <button
                onClick={() => {
                  // Was fire-and-forget with an unconditional "it worked" alert right
                  // after — on a denied clipboard permission or an insecure context
                  // this claimed success while doing nothing, and blocked the UI with
                  // alert() instead of this panel's own toast system.
                  navigator.clipboard
                    .writeText(diagReport)
                    .then(() => pushToast("Report copied to clipboard.", "📋", 3000))
                    .catch(() => pushToast("Couldn't copy — your browser blocked clipboard access.", "⚠️", 4000));
                }}
              >
                Copy Report
              </button>
            )}
          </div>
          {diagReport && (
            <div style={{ marginTop: "10px", padding: "8px", background: "#222", color: "#fff", fontSize: "10px", maxHeight: "150px", overflow: "auto", whiteSpace: "pre-wrap", border: "1px solid #444", borderRadius: "4px" }}>
              {/* The visible clipping above is CSS-only — a large event buffer still
                  put the FULL string in the DOM. "Copy Report" still copies the
                  complete, untruncated `diagReport`; only this rendered preview caps. */}
              {diagReport.length > 20000 ? `${diagReport.slice(0, 20000)}\n… (truncated in this preview — Copy Report still copies everything)` : diagReport}
            </div>
          )}
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
                // A reload wipes any unsaved Display name/Gamer tag edit sitting
                // in the fields above with no warning — this used to fire
                // regardless.
                if (profileDirty && !confirm("You have an unsaved profile change that will be lost. Continue?")) return;
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
            <span className="gfx-tier">
              tier: <b>{resolved.tier}</b>
              {resolved.detailTier !== resolved.tier && (
                <> → <b>{resolved.detailTier}</b> (learned)</>
              )}
            </span>
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
          <label className="settings-toggle">
            <span>
              Performance readout
              <em>{perfHudOn ? "ON — a small overlay showing real frame-time/GPU numbers." : "OFF — the on-screen diagnostic HUD for tuning performance."}</em>
            </span>
            <span className="gfx-when instant">instant</span>
            <button
              className={`switch ${perfHudOn ? "on" : ""}`}
              onClick={() => {
                const next = !perfHudOn;
                setPerfHudOn(next);
                setPerfHudEnabled(next);
              }}
              aria-pressed={perfHudOn}
            >
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
