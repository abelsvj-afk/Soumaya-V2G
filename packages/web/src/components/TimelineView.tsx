import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GraphNode, TimelineChapter, ChapterTrend } from "@brain/shared";
import { getTimeline, addTimelineChapter, deleteTimelineChapter, listAttachments, attachmentObjectUrl } from "../api/client.js";

/**
 * The Chronicle — a 3D flowing-river timeline of your life. Chapters (written by
 * Soumaya on real change, or added by you) are strung along a glowing ribbon whose
 * colour flows in the galaxy's emotion palette. Memories that carry a photo appear
 * as whitish glowing bubbles with a random colour-light that CYCLES when you click
 * them. See docs/TIMELINE_DESIGN.md.
 */

// The galaxy's link/emotion palette (3–4 colours) — the ribbon + bubbles reuse it.
const PALETTE = ["#ffcd46", "#9686ff", "#46f58c", "#ffcf6b"];
const TREND_COLOR: Record<ChapterTrend, string> = {
  growth: "#46f58c",
  decline: "#9686ff",
  mixed: "#ffcd46",
  neutral: "#cfe3ff",
};
const TREND_LABEL: Record<ChapterTrend, string> = {
  growth: "▲ growth",
  decline: "▼ heavier",
  mixed: "◆ mixed",
  neutral: "● steady",
};

/** Soft radial sprite for glows (additive). Cached once. */
function glowTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.7)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

/** A repeating horizontal gradient through the palette — scrolls to make colour flow. */
function ribbonTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 4;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 512, 0);
  const stops = [...PALETTE, PALETTE[0]!];
  stops.forEach((col, i) => grad.addColorStop(i / (stops.length - 1), col));
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 4);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

interface Props {
  spaceName: string;
  nodes: GraphNode[];
  onClose: () => void;
  onFocus?: (id: number) => void;
}

export function TimelineView({ spaceName, nodes, onClose, onFocus }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [chapters, setChapters] = useState<TimelineChapter[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [images, setImages] = useState<Record<number, string>>({});
  // The click handler inside the THREE loop needs a live setter without re-mounting.
  const selectRef = useRef<(i: number) => void>(() => {});
  selectRef.current = (i: number) => setSelected(i);

  const labelOf = (id: number) => nodes.find((n) => n.id === id)?.label ?? `Memory #${id}`;

  useEffect(() => {
    void getTimeline().then(setChapters);
  }, []);

  const reload = async () => {
    setChapters(await getTimeline());
  };
  const addNow = async () => {
    setAdding(true);
    const ch = await addTimelineChapter();
    const fresh = await getTimeline();
    setChapters(fresh);
    setAdding(false);
    if (ch) {
      const idx = fresh.findIndex((c) => c.id === ch.id);
      if (idx >= 0) setSelected(idx);
    }
  };
  const removeChapter = async (id: number) => {
    await deleteTimelineChapter(id);
    setSelected(null);
    await reload();
  };

  // Load photo thumbnails for the selected chapter (lazy — only what's on screen).
  useEffect(() => {
    if (selected == null || selected < 0 || !chapters) return;
    const ch = chapters[selected];
    if (!ch) return;
    let cancelled = false;
    const urls: string[] = [];
    (async () => {
      for (const id of ch.photoIds) {
        if (images[id]) continue;
        const atts = await listAttachments(id);
        const img = atts.find((a) => a.mime.startsWith("image/"));
        if (!img) continue;
        const url = await attachmentObjectUrl(img);
        if (url && !cancelled) {
          urls.push(url);
          setImages((m) => ({ ...m, [id]: url }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, chapters]);

  // Build the 3D scene once chapters are loaded.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !chapters || chapters.length === 0) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#05010d");
    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 0.1, 4000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    const disposables: { dispose: () => void }[] = [];
    const track = <T extends { dispose: () => void }>(o: T): T => {
      disposables.push(o);
      return o;
    };
    const glowTex = track(glowTexture());
    const ribbonTex = track(ribbonTexture());

    // --- Chapter positions along a gently meandering river ---
    const N = chapters.length;
    const SPACING = 72;
    const points = chapters.map(
      (_, i) => new THREE.Vector3((i - (N - 1) / 2) * SPACING, Math.sin(i * 0.9) * 16, Math.cos(i * 0.6) * 20),
    );
    const center = points.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / N);

    // --- Flowing ribbon (2+ chapters) ---
    if (N >= 2) {
      const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.5);
      const geo = track(new THREE.TubeGeometry(curve, N * 24, 1.6, 10, false));
      ribbonTex.repeat.set(N * 1.5, 1);
      const mat = track(
        new THREE.MeshBasicMaterial({ map: ribbonTex, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      scene.add(new THREE.Mesh(geo, mat));

      // Colour packets drifting along the river for extra life.
      const packets: { sprite: THREE.Sprite; t: number; speed: number }[] = [];
      for (let i = 0; i < N * 2; i++) {
        const col = new THREE.Color(PALETTE[i % PALETTE.length]!);
        const spr = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
        spr.scale.setScalar(6);
        scene.add(spr);
        packets.push({ sprite: spr, t: i / (N * 2), speed: 0.02 + (i % 3) * 0.006 });
      }
      (scene.userData as { packets?: typeof packets; curve?: THREE.CatmullRomCurve3 }).packets = packets;
      (scene.userData as { curve?: THREE.CatmullRomCurve3 }).curve = curve;
    }

    // --- Chapter nodes + photo bubbles ---
    const clickTargets: THREE.Object3D[] = [];
    const bubbleCycles: { sprite: THREE.Sprite; seed: number }[] = [];
    chapters.forEach((ch, idx) => {
      const pos = points[idx]!;
      const trendCol = new THREE.Color(TREND_COLOR[ch.trend]);
      const r = 3 + ch.score * 6;
      const node = new THREE.Mesh(
        track(new THREE.SphereGeometry(r, 24, 24)),
        track(new THREE.MeshBasicMaterial({ color: trendCol })),
      );
      node.position.copy(pos);
      node.userData = { type: "chapter", index: idx };
      scene.add(node);
      clickTargets.push(node);

      const halo = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glowTex, color: trendCol, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
      halo.scale.setScalar(r * 4.5);
      halo.position.copy(pos);
      scene.add(halo);

      // Photo memories → whitish glowing bubbles orbiting the node.
      ch.photoIds.forEach((memId, k) => {
        const ang = (k / Math.max(1, ch.photoIds.length)) * Math.PI * 2;
        const rad = r + 10 + (k % 2) * 5;
        const bpos = new THREE.Vector3(pos.x + Math.cos(ang) * rad, pos.y + Math.sin(ang) * rad, pos.z + (k % 2 ? 6 : -6));
        const bubble = new THREE.Mesh(
          track(new THREE.SphereGeometry(2.6, 18, 18)),
          track(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })),
        );
        bubble.position.copy(bpos);
        const seed = Math.abs(memId * 2654435761) >>> 0;
        const inner = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(PALETTE[seed % PALETTE.length]!), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
        inner.scale.setScalar(9);
        inner.position.copy(bpos);
        scene.add(inner);
        scene.add(bubble);
        bubble.userData = { type: "photo", memId, index: idx, glow: inner, cycle: 0 };
        clickTargets.push(bubble);
        bubbleCycles.push({ sprite: inner, seed });
      });
    });

    // --- Camera framing ---
    const span = Math.max(SPACING * N, 120);
    camera.position.set(center.x, center.y + span * 0.18, span * 0.72);
    controls.target.copy(center);
    controls.update();

    // --- Interaction: click a chapter (select) or a photo bubble (cycle its colour) ---
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let downX = 0, downY = 0;
    const onDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      if (Math.abs(e.clientX - downX) > 6 || Math.abs(e.clientY - downY) > 6) return; // a drag, not a click
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(clickTargets, false)[0];
      if (!hit) return;
      const ud = hit.object.userData as { type: string; index: number; glow?: THREE.Sprite; cycle?: number };
      if (ud.type === "chapter") {
        selectRef.current(ud.index);
      } else if (ud.type === "photo" && ud.glow) {
        // Cycle to a new palette colour (never the same as current).
        ud.cycle = (ud.cycle ?? 0) + 1 + Math.floor(Math.random() * (PALETTE.length - 1));
        (ud.glow.material as THREE.SpriteMaterial).color.set(PALETTE[ud.cycle % PALETTE.length]!);
        selectRef.current(ud.index);
      }
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    // --- Render loop ---
    const clock = new THREE.Clock();
    let raf = 0;
    const sceneData = scene.userData as { packets?: { sprite: THREE.Sprite; t: number; speed: number }[]; curve?: THREE.CatmullRomCurve3 };
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(0.05, clock.getDelta());
      ribbonTex.offset.x -= dt * 0.05; // colour flows along the river
      // Twinkle the photo bubbles.
      const t = clock.elapsedTime;
      bubbleCycles.forEach((b, i) => {
        const s = 8 + Math.sin(t * 2 + i) * 1.6;
        b.sprite.scale.setScalar(s);
      });
      // Drift packets along the curve.
      if (sceneData.packets && sceneData.curve) {
        for (const p of sceneData.packets) {
          p.t = (p.t + dt * p.speed) % 1;
          sceneData.curve.getPointAt(p.t, p.sprite.position);
        }
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [chapters]);

  // Revoke object URLs on unmount.
  useEffect(() => () => Object.values(images).forEach((u) => URL.revokeObjectURL(u)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const sel = selected != null && selected >= 0 && chapters ? chapters[selected] : null;

  return (
    <div className="timeline-overlay">
      <div className="timeline-head">
        <div className="timeline-title">
          <span className="tl-glyph">🌌</span> {spaceName}'s Chronicle
          <span className="tl-sub">the river of your becoming</span>
        </div>
        <div className="timeline-actions">
          <button className="tl-add" onClick={() => void addNow()} disabled={adding}>
            {adding ? "…" : "✍️ Mark this moment"}
          </button>
          <button className="tl-close" onClick={onClose} aria-label="Close">×</button>
        </div>
      </div>

      <div ref={mountRef} className="timeline-canvas" />

      {chapters && chapters.length === 0 && (
        <div className="timeline-empty">
          <p>Your chronicle begins as you live.</p>
          <p className="tl-empty-sub">
            Soumaya writes a chapter when enough truly changes — growth, a hard season, a turning point.
            You can mark one yourself anytime.
          </p>
          <button className="tl-add" onClick={() => void addNow()} disabled={adding}>✍️ Write my first chapter</button>
        </div>
      )}
      {chapters === null && <div className="timeline-empty"><p>Unspooling your timeline…</p></div>}

      {sel && (
        <div className="timeline-card" style={{ borderColor: TREND_COLOR[sel.trend] }}>
          <button className="tl-card-x" onClick={() => setSelected(null)} aria-label="Close">×</button>
          <div className="tl-card-trend" style={{ color: TREND_COLOR[sel.trend] }}>{TREND_LABEL[sel.trend]}</div>
          <h3>{sel.title}</h3>
          <div className="tl-card-when">
            {new Date(sel.periodStart).toLocaleDateString()} → {new Date(sel.periodEnd).toLocaleDateString()}
            {sel.origin === "user" && <span className="tl-origin"> · you marked this</span>}
          </div>
          <p className="tl-card-summary">{sel.summary}</p>
          {sel.threads.length > 0 && (
            <div className="tl-threads">
              {sel.threads.map((th) => (
                <span key={th.name} className="tl-thread" style={{ borderColor: TREND_COLOR[th.trend] }}>
                  {th.name} <span style={{ color: TREND_COLOR[th.trend] }}>{TREND_LABEL[th.trend].split(" ")[0]}</span>
                </span>
              ))}
            </div>
          )}
          {sel.photoIds.length > 0 && (
            <div className="tl-photos">
              {sel.photoIds.map((id) =>
                images[id] ? (
                  <img key={id} src={images[id]} alt={labelOf(id)} title={labelOf(id)} onClick={() => onFocus?.(id)} />
                ) : (
                  <span key={id} className="tl-photo-load">📷</span>
                ),
              )}
            </div>
          )}
          {sel.memoryIds.length > 0 && (
            <div className="tl-mems">
              <div className="tl-mems-label">Memories from this chapter</div>
              {sel.memoryIds.map((id) => (
                <button key={id} className="tl-mem" onClick={() => onFocus?.(id)} title="Find it in the galaxy">
                  {labelOf(id)}
                </button>
              ))}
            </div>
          )}
          <button className="tl-del" onClick={() => void removeChapter(sel.id)}>Delete chapter</button>
        </div>
      )}

      {chapters && chapters.length > 0 && (
        <div className="timeline-hint">Drag to orbit · scroll to zoom · tap a star to open its chapter · tap a 📷 bubble to recolour it</div>
      )}
    </div>
  );
}
