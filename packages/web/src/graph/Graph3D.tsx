import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";
import type { GraphData, GraphNode } from "@brain/shared";
import { makeNodeObject } from "./nodeObject.js";
import { makeStarfield, makeNebulae, makeComets, makeGalaxies } from "./starfield.js";
import { makeSpaceBackground, makeConstellations, loadNebulaSkybox } from "./skybox.js";
import { addBloom } from "./bloom.js";
import { makeCollisionBursts } from "./effects.js";
import { makeSamaya, type SamayaHandle } from "./samaya.js";
import { makeSpaceStation } from "./spaceStation.js";
import { makeOrbitSystem } from "./orbits.js";
import { BG } from "./theme.js";

export interface Graph3DHandle {
  focusNode: (id: number) => void;
  /** Frame the whole galaxy back in view (fixes drift / "stuck on one side"). */
  recenter: () => void;
  /** Toggle the camera chasing Samaya's ship; returns the new state. */
  toggleFollowShip: () => boolean;
}

interface Props {
  data: GraphData;
  onSelect: (node: GraphNode) => void;
  /** Currently-selected node — when set, only it + its links stay lit (tap-to-isolate). */
  selectedId?: number | null;
  /** True when the bottom sheet is open — shifts the followed body up so it clears it. */
  bottomInset?: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const linkEnd = (v: any): number => (typeof v === "object" && v !== null ? v.id : v);

export const Graph3D = forwardRef<Graph3DHandle, Props>(function Graph3D(
  { data, onSelect, selectedId, bottomInset },
  ref,
) {
  const fgRef = useRef<any>(null);
  const [hoverId, setHoverId] = useState<number | null>(null);
  // Hover wins; otherwise the selected node drives the highlight (mobile = no hover).
  const activeId = hoverId ?? selectedId ?? null;
  const insetRef = useRef(false);
  useEffect(() => {
    insetRef.current = !!bottomInset;
  }, [bottomInset]);

  // Live graph data for the Samaya agent (react-force-graph mutates x/y/z on
  // these node objects each tick, so the agent always has current positions).
  const dataRef = useRef(data);
  const orbitsRef = useRef(makeOrbitSystem());
  useEffect(() => {
    dataRef.current = data;
    orbitsRef.current.rebuild(data.nodes as any[], data.links as any[]);
  }, [data]);

  // When set, the camera locks onto this node and rides along as it orbits, so a
  // body you jumped to doesn't drift out of frame.
  const followRef = useRef<number | null>(null);
  // When true, the camera chases Samaya's ship instead.
  const followShipRef = useRef(false);

  // Undirected adjacency for neighbor highlighting.
  const adjacency = useMemo(() => {
    const m = new Map<number, Set<number>>();
    for (const l of data.links) {
      const s = linkEnd(l.source);
      const t = linkEnd(l.target);
      if (!m.has(s)) m.set(s, new Set());
      if (!m.has(t)) m.set(t, new Set());
      m.get(s)!.add(t);
      m.get(t)!.add(s);
    }
    return m;
  }, [data]);

  const isLit = (id: number): boolean =>
    activeId === null || id === activeId || (adjacency.get(activeId)?.has(id) ?? false);

  // One-time imperative scene setup: lights, starfield, bloom, spin loop.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || fg.__brainInited) return;
    fg.__brainInited = true;

    const scene: THREE.Scene = fg.scene();
    const controls = fg.controls?.();
    // See the far galaxies + the nebula skybox shell (~12000 out).
    const pcam = fg.camera() as THREE.PerspectiveCamera;
    if (pcam?.isPerspectiveCamera) {
      pcam.far = 30000;
      pcam.updateProjectionMatrix();
    }
    scene.add(new THREE.AmbientLight(0x8888aa, 1.2));
    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(1, 1, 1);
    scene.add(dir);

    // Scene embellishments + physics are best-effort: if any imperative call
    // fails we still render the graph rather than blanking the whole screen.
    let bursts: ReturnType<typeof makeCollisionBursts> | null = null;
    let samaya: SamayaHandle | null = null;
    try {
      scene.background = makeSpaceBackground();
      loadNebulaSkybox(scene);
      scene.add(makeStarfield());
      scene.add(makeNebulae());
      scene.add(makeGalaxies());
      scene.add(makeConstellations());
      scene.add(makeComets());
      bursts = makeCollisionBursts();
      scene.add(bursts.group);
      samaya = makeSamaya();
      scene.add(samaya.object);
      scene.add(makeSpaceStation());
      addBloom(fg, {});

      // Motion is handled by the kinematic orbit system (orbits.ts), which pins
      // node positions each frame — so disable the force-engine layout entirely
      // (no charge/gravity tug-of-war, no collapse). Links are kept only as
      // visual tethers between the orbiting bodies.
      fg.d3Force("charge")?.strength(0);
      fg.d3Force("center", null);
      fg.d3Force("link")?.strength(0);

      // Generous zoom-out (to admire it all) but stay well inside the nebula
      // skybox shell so you never exit it.
      if (controls) {
        controls.maxDistance = 7000;
        controls.minDistance = 12;
      }
    } catch (err) {
      console.error("[graph] scene setup failed:", err);
    }

    // Labels fade in as you approach and out when far, so a zoomed-out galaxy
    // reads as points of light instead of a wall of text (Obsidian-style LOD).
    const camera: THREE.Camera = fg.camera();
    const tmp = new THREE.Vector3();
    const FADE_NEAR = 170; // labels fully visible at/under this camera distance
    const FADE_FAR = 540; // labels fully hidden at/over this distance

    // Brightness is INVERTED with zoom: a body blooms brightest from afar (the
    // galaxy reads as points of light) and dims/concentrates up close so you can
    // read its label and see the surface texture.
    const DIM_NEAR = 70;
    const BRIGHT_FAR = 430;
    const brightness = (d: number): number => {
      const t = Math.min(1, Math.max(0, (d - DIM_NEAR) / (BRIGHT_FAR - DIM_NEAR)));
      return 0.25 + 0.35 * t; // 0.25x up close .. 0.6x far away
    };

    let raf = 0;
    let last = performance.now() * 0.001;
    const followAnchor = new THREE.Vector3();
    let followAnchorId: number | null = null;
    const followPos = new THREE.Vector3();
    const tick = () => {
      const now = performance.now() * 0.001;
      const dt = Math.min(0.05, now - last);
      last = now;

      // Advance every body along its orbit first, so the camera + Samaya read
      // up-to-date positions this frame.
      orbitsRef.current.update(dt, dataRef.current.nodes as any[]);

      // Follow-lock: keep the jumped-to body centered as it orbits/drifts.
      const fid = followRef.current;
      if (fid != null && controls) {
        const fn = (dataRef.current.nodes as any[]).find((n) => n.id === fid);
        if (fn && fn.x != null) {
          followPos.set(fn.x, fn.y, fn.z ?? 0);
          if (followAnchorId === fid) {
            camera.position.add(followPos.clone().sub(followAnchor)); // ride along
          }
          controls.target.copy(followPos);
          // When the bottom sheet is open on mobile, look a bit lower so the body
          // rides above the panel instead of being centered behind it.
          if (insetRef.current && window.innerWidth <= 720) {
            const down = new THREE.Vector3(0, -1, 0).applyQuaternion(camera.quaternion);
            controls.target.addScaledVector(down, camera.position.distanceTo(followPos) * 0.18);
          }
          controls.update();
          followAnchor.copy(followPos);
          followAnchorId = fid;
        }
      } else {
        followAnchorId = null;
      }

      scene.traverse((o: any) => {
        // Self-animating background objects (comets, nebulae).
        if (typeof o.userData?.update === "function") o.userData.update(now);
        if (o.userData?.spin) {
          o.rotation.y += 0.008; // bodies turn on their axis, calmly
        }
        // Pulsing emissive light, scaled DOWN as the camera nears (so close-ups
        // are readable instead of blinding) and UP when far (bright galaxy).
        if (o.userData?.pulse) {
          o.getWorldPosition(tmp);
          const bf = brightness(tmp.distanceTo(camera.position));
          const p = o.userData.pulse;
          const s = Math.sin(now * p.speed + p.phase) * 0.5 + 0.5;
          const intensity = (p.base + p.amp * s) * bf * (p.vitality ?? 1);
          const mat = o.material as any;
          if (mat?.isShaderMaterial) {
            mat.uniforms.uBrightness.value = intensity;
            mat.uniforms.uTime.value = now;
          } else if (mat && mat.emissiveIntensity != null) {
            mat.emissiveIntensity = intensity;
          }
        }
        // Breathing corona / atmosphere — also dims up close.
        if (o.userData?.corona) {
          o.getWorldPosition(tmp);
          const bf = brightness(tmp.distanceTo(camera.position));
          const c = o.userData.corona;
          const k = c.base * (1 + 0.2 * (Math.sin(now * c.speed + c.phase) * 0.5 + 0.5));
          o.scale.set(k, k, 1);
          (o.material as THREE.SpriteMaterial).opacity = c.baseOpacity * Math.min(1, bf);
        }
        if (o.userData?.isLabel) {
          o.getWorldPosition(tmp);
          const dist = tmp.distanceTo(camera.position);
          const vis = Math.min(1, Math.max(0, (FADE_FAR - dist) / (FADE_FAR - FADE_NEAR)));
          o.visible = vis > 0.02;
          const mat = o.material as THREE.SpriteMaterial;
          mat.opacity = vis * 0.95;
          const mq = o.userData.marquee;
          if (mq && o.visible) {
            mq.t += 0.006;
            // Ease at the ends so the name is readable, not a constant blur.
            mat.map!.offset.x = (Math.sin(mq.t) * 0.5 + 0.5) * mq.range;
          }
        }
      });

      // Drive Samaya along the live graph; spark a maintenance burst on arrival.
      if (samaya) {
        const d = dataRef.current;
        samaya.update(dt, d.nodes as any[], d.links as any[], (x, y, z) => bursts?.spawn(x, y, z));

        // Zoom-to-ship: smoothly chase Samaya from just behind/above.
        if (followShipRef.current && controls && samaya.object.visible) {
          const sp = samaya.object.position;
          controls.target.lerp(sp, 0.12);
          camera.position.lerp(sp.clone().add(new THREE.Vector3(0, 16, 52)), 0.06);
          controls.update();
        }
      }

      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  // Hover highlighting: dim node groups that aren't the focus or its neighbors.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg?.scene) return;
    fg.scene().traverse((o: any) => {
      const id = o.userData?.nodeId;
      if (id == null) return;
      const lit = isLit(id);
      o.traverse((child: any) => {
        const mat = child.material;
        if (!mat) return;
        mat.transparent = true;
        mat.opacity = lit ? 1 : 0.12;
        if (mat.emissiveIntensity != null) mat.emissiveIntensity = lit ? 0.85 : 0.08;
      });
    });
  }, [activeId, adjacency]);

  // Fly to a node so it lands centered in the *visible* area at a consistent
  // zoom. We keep the current viewing angle (no jarring swing) and nudge the
  // look-target so the node clears whichever panel is open: a bottom sheet on
  // mobile, the right dock on desktop.
  const flyTo = (n: any) => {
    const fg = fgRef.current;
    if (!fg || !n || n.x == null) return;
    const D = 115; // consistent camera distance from the node
    const cam: THREE.Camera = fg.camera();
    const node = new THREE.Vector3(n.x, n.y, n.z ?? 0);

    let dir = new THREE.Vector3().subVectors(cam.position, node);
    if (dir.lengthSq() < 1e-3) dir.set(0, 0, 1);
    dir.normalize();
    const camPos = node.clone().addScaledVector(dir, D);

    // Offset the look-target (in screen space) so the node sits in clear sky.
    const target = node.clone();
    if (window.innerWidth <= 720) {
      const down = new THREE.Vector3(0, -1, 0).applyQuaternion(cam.quaternion);
      target.addScaledVector(down, D * 0.22); // look lower → node rides higher
    } else {
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      target.addScaledVector(right, D * 0.2); // look right → node sits left of dock
    }

    // Don't fight the fly tween; lock the follow-cam on once it lands.
    followRef.current = null;
    followShipRef.current = false; // jumping to a node releases ship-follow
    fg.cameraPosition({ x: camPos.x, y: camPos.y, z: camPos.z }, target, 1000);
    window.setTimeout(() => {
      followRef.current = n.id;
    }, 1050);
  };

  useImperativeHandle(
    ref,
    () => ({
      focusNode: (id: number) => flyTo((data.nodes as any[]).find((x) => x.id === id)),
      recenter: () => {
        followRef.current = null; // release the follow-locks so we can frame everything
        followShipRef.current = false;
        fgRef.current?.zoomToFit(800, 70);
      },
      toggleFollowShip: () => {
        followShipRef.current = !followShipRef.current;
        if (followShipRef.current) followRef.current = null;
        return followShipRef.current;
      },
    }),
    [data],
  );

  return (
    <ForceGraph3D
      ref={fgRef}
      graphData={data as any}
      backgroundColor={BG}
      showNavInfo={false}
      warmupTicks={30}
      cooldownTicks={Infinity}
      cooldownTime={Infinity}
      nodeThreeObject={(node: any) => makeNodeObject(node)}
      nodeLabel={(n: any) => `${n.label} · ${String(n.type).replace(/_/g, " ")}`}
      onNodeClick={(n: any) => {
        onSelect(n);
        flyTo(n);
      }}
      onNodeHover={(n: any) => setHoverId(n ? n.id : null)}
      // Connections read as faint gravitational filaments; the relationship is
      // carried by streams of drifting "space dust" rather than solid lines.
      linkColor={(l: any) => {
        const lit = activeId === null || (isLit(linkEnd(l.source)) && isLit(linkEnd(l.target)));
        return lit ? "rgba(150,180,255,0.22)" : "rgba(120,120,150,0.02)";
      }}
      linkWidth={(l: any) => 0.15 + (l.weight ?? 0.4) * 0.5}
      linkCurvature={0.18}
      linkDirectionalParticles={(l: any) => Math.round(2 + (l.weight ?? 0.4) * 4)}
      linkDirectionalParticleSpeed={(l: any) => 0.0006 + (l.weight ?? 0.4) * 0.0022}
      linkDirectionalParticleWidth={(l: any) => 1.0 + (l.weight ?? 0.4) * 1.6}
      linkDirectionalParticleColor={(l: any) => {
        const lit = activeId === null || (isLit(linkEnd(l.source)) && isLit(linkEnd(l.target)));
        return lit ? "rgba(205,215,255,0.95)" : "rgba(150,160,200,0.06)";
      }}
    />
  );
});
