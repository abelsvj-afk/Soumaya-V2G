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
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { GraphData, GraphNode } from "@brain/shared";
import { makeNodeObject } from "./nodeObject.js";
import { makeStarfield, makeNebulae, makeComets, makeGalaxies } from "./starfield.js";
import { makeSpaceBackground, makeConstellations, loadNebulaSkybox } from "./skybox.js";
import { addBloom } from "./bloom.js";
import { makeCollisionBursts } from "./effects.js";
import { makeSoumaya, type SoumayaHandle, type LinkTask, type RemovalTask } from "./soumaya.js";
import { makeSpaceStation } from "./spaceStation.js";
import { gltfLoader } from "./gltf.js";
import { makeSun, SUN_RADIUS_MAX } from "./sun.js";
import { makeOrbitSystem } from "./orbits.js";
import { makeVisitors, type VisitorSystem } from "./visitors.js";
import { isNodeProcessing, logVisits } from "../api/client.js";
import { makeSatellites, type SatelliteSystem } from "./satellites.js";
import { makeSubAgents, type SubAgentSystem, type SubAgentHazard } from "./subAgents.js";
import { BG, colorForType } from "./theme.js";

/** Live status of each fleet unit, read by the Fleet panel. */
export type FleetStatus = Record<string, { active: boolean; detail: string }>;

export interface Graph3DHandle {
  focusNode: (id: number) => void;
  /** Frame the whole galaxy back in view (fixes drift / "stuck on one side"). */
  recenter: () => void;
  /** On-screen zoom: factor < 1 zooms in, > 1 zooms out (for the +/- buttons). */
  zoomBy: (factor: number) => void;
  /** Toggle the camera focusing Soumaya's ship; returns the new state. */
  toggleFollowShip: (forceState?: boolean) => boolean;
  /** Toggle the camera focusing the space station; returns the new state. */
  toggleFollowStation: () => boolean;
  /** Toggle camera focusing slot 1 figurine; returns the new state. */
  toggleFollowFig1: () => boolean;
  /** Toggle camera focusing slot 2 figurine; returns the new state. */
  toggleFollowFig2: () => boolean;
  /** Jump to the next active Aura beacon (cycles through them). False if none. */
  cycleFollowSatellite: () => boolean;
  /** Jump to the next visitor craft (cycles through them). False if none. */
  cycleFollowVisitor: () => boolean;
  /** Isolate a memory's system: show only it + the bodies orbiting it. */
  isolateSystem: (id: number) => void;
  /** Exit the isolated system view (show the whole galaxy again). */
  exitCluster: () => void;
  /** Trigger a visual burst at a node (e.g., for user action rewards). */
  spawnBurst: (nodeId: number, type?: string) => void;
  /** Fire visual recall signals along synapses for cited node IDs. */
  fireRecall: (citationIds: number[]) => void;
  /** Live status of every fleet unit (ship/station/beacons/scout/defender). */
  getFleetStatus: () => FleetStatus;
  reorderTasks: (newOrder: { id: string; type: string }[]) => void;
}

interface Props {
  data: GraphData;
  onSelect: (node: GraphNode) => void;
  onSoumayaClick?: () => void;
  /** Fires when the number of active beacons changes (drives the pulsing FAB). */
  onSatelliteCount?: (count: number) => void;
  /** Fires when the number of visitors in the sandbox changes (drives the FAB). */
  onVisitorCount?: (count: number) => void;
  /** Currently-selected node — when set, only it + its links stay lit (tap-to-isolate). */
  selectedId?: number | null;
  /** True when the bottom sheet is open — shifts the followed body up so it clears it. */
  bottomInset?: boolean;
  /** Demo galaxy — don't report visitor activity to the real backend. */
  demo?: boolean;
  /** Show the floating "current task" label above Soumaya's ship. */
  showShipTask?: boolean;
  /** Progression flight-speed multiplier for Soumaya (~1.0 → ~1.9). */
  pilotSpeed?: number;
  /** True when the initial API fetch of the real galaxy is done. */
  loaded?: boolean;
  onTasksChange?: (tasks: any[]) => void;
  shipViewMode?: "orbit" | "cockpit";
  fuel?: any;
  equippedShip?: string;
  equippedFig1?: string;
  equippedFig2?: string;
  equippedTrail?: string;
  spaceId?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const linkEnd = (v: any): number => (typeof v === "object" && v !== null ? v.id : v);
/** Stable key for a connection (undirected) so we can track which are already drawn. */
const linkKey = (l: any): string => {
  const a = linkEnd(l.source);
  const b = linkEnd(l.target);
  return a < b ? `${a}-${b}` : `${b}-${a}`;
};

function updateFigurine(
  group: THREE.Group,
  type: string,
  position: THREE.Vector3,
  getEnv: () => THREE.Texture | null
) {
  // Clear previous children
  while (group.children.length > 0) {
    const child = group.children[0]!;
    group.remove(child);
  }

  if (type === "none") {
    group.visible = false;
    return;
  }

  group.visible = true;
  group.position.copy(position);

  let fallbackMesh: THREE.Object3D;
  let modelPath = "";
  let targetSize = 1000; // desired scale size in world units

  if (type === "station") {
    modelPath = "/space_station_3.glb";
    targetSize = 1300;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x7af9ff,
      roughness: 0.2,
      metalness: 0.8,
      emissive: 0x003355,
      emissiveIntensity: 0.5
    });
    fallbackMesh = new THREE.Mesh(new THREE.TorusGeometry(600, 100, 16, 48), mat);
  } else if (type === "satellite") {
    modelPath = "/aura-satellite.glb";
    targetSize = 1000;
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      roughness: 0.3,
      metalness: 0.9,
      emissive: 0x443300,
      emissiveIntensity: 0.3
    });
    fallbackMesh = new THREE.Mesh(new THREE.CylinderGeometry(150, 150, 800, 16), mat);
  } else if (type === "star_center") {
    modelPath = "/star-center.glb";
    targetSize = 1500;
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffbb44,
      emissive: 0xff8800,
      emissiveIntensity: 2.0,
      roughness: 0.1,
      metalness: 0.9
    });
    fallbackMesh = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 32), mat);
  } else if (type === "dyson_sphere") {
    modelPath = "/dyson-sphere.glb";
    targetSize = 1800;
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0xff3300,
      emissive: 0xff0000,
      emissiveIntensity: 1.8
    });
    const outerMat = new THREE.MeshStandardMaterial({
      color: 0x334466,
      roughness: 0.4,
      metalness: 0.8
    });
    const subGroup = new THREE.Group();
    const inner = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 32), innerMat);
    const outer = new THREE.Mesh(new THREE.TorusGeometry(750, 50, 8, 48), outerMat);
    outer.rotation.x = Math.PI / 4;
    subGroup.add(inner);
    subGroup.add(outer);
    fallbackMesh = subGroup;
  } else if (type === "quantum_core") {
    modelPath = "/space_station_3.glb";
    targetSize = 1100;
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      roughness: 0.9,
      metalness: 0.1
    });
    const outerMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 2.0
    });
    const subGroup = new THREE.Group();
    const inner = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 32), innerMat);
    const outer = new THREE.Mesh(new THREE.TorusGeometry(800, 40, 8, 48), outerMat);
    outer.rotation.x = Math.PI / 2;
    subGroup.add(inner);
    subGroup.add(outer);
    fallbackMesh = subGroup;
  } else if (type === "hyper_array") {
    modelPath = "/aura-satellite.glb";
    targetSize = 1200;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x00ff88,
      emissive: 0x008844,
      emissiveIntensity: 1.2,
      roughness: 0.3,
      metalness: 0.8
    });
    const subGroup = new THREE.Group();
    const torus1 = new THREE.Mesh(new THREE.TorusGeometry(600, 40, 8, 48), mat);
    const torus2 = new THREE.Mesh(new THREE.TorusGeometry(600, 40, 8, 48), mat);
    torus2.rotation.y = Math.PI / 2;
    subGroup.add(torus1);
    subGroup.add(torus2);
    fallbackMesh = subGroup;
  } else if (type === "shield_spire") {
    modelPath = "/space_station_3.glb";
    targetSize = 1400;
    const matBase = new THREE.MeshStandardMaterial({
      color: 0x557799,
      roughness: 0.4,
      metalness: 0.7
    });
    const matOrb = new THREE.MeshStandardMaterial({
      color: 0x7af9ff,
      emissive: 0x7af9ff,
      emissiveIntensity: 1.5,
      transparent: true,
      opacity: 0.65
    });
    const subGroup = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(50, 150, 900, 16), matBase);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(250, 16, 16), matOrb);
    orb.position.y = 450;
    subGroup.add(base);
    subGroup.add(orb);
    fallbackMesh = subGroup;
  } else {
    return;
  }

  // Add procedural fallback first
  group.add(fallbackMesh);

  // Load GLB
  gltfLoader().load(
    modelPath,
    (gltf) => {
      // Remove fallback
      group.remove(fallbackMesh);
      const model = gltf.scene;

      // Compute bounding box to normalize scale
      const box = new THREE.Box3().setFromObject(model);
      const dim = new THREE.Vector3();
      box.getSize(dim);
      const maxDim = Math.max(dim.x, dim.y, dim.z) || 1;
      const k = targetSize / maxDim;
      model.scale.setScalar(k);

      // Recenter model
      const center = new THREE.Vector3();
      box.getCenter(center);
      model.position.copy(center.multiplyScalar(-k));

      // Enable environment maps on loaded model if available
      const env = getEnv();
      if (env) {
        model.traverse((o: any) => {
          if (o.isMesh) {
            o.material.envMap = env;
            o.material.needsUpdate = true;
          }
        });
      }

      group.add(model);
    },
    undefined,
    (err) => {
      console.warn(`[figurine] failed to load '${modelPath}'; using procedural fallback`, err);
    }
  );
}

export const Graph3D = forwardRef<Graph3DHandle, Props>(function Graph3D(
  {
    data,
    onSelect,
    onSoumayaClick,
    onSatelliteCount,
    onVisitorCount,
    selectedId,
    bottomInset,
    demo,
    showShipTask,
    pilotSpeed,
    loaded,
    onTasksChange,
    shipViewMode,
    fuel,
    equippedShip = "default",
    equippedFig1 = "none",
    equippedFig2 = "none",
    equippedTrail = "blue",
    spaceId = "",
  },
  ref,
) {
  const fgRef = useRef<any>(null);
  const [hoverId, setHoverId] = useState<number | null>(null);
  // When set, only these node ids (a memory + its orbiting system) are shown.
  const [cluster, setCluster] = useState<Set<number> | null>(null);
  // Hover wins; otherwise the selected node drives the highlight (mobile = no hover).
  const activeId = hoverId ?? selectedId ?? null;
  const insetRef = useRef(false);
  useEffect(() => {
    insetRef.current = !!bottomInset;
  }, [bottomInset]);
  // Buffer visitor arrivals and flush them to the backend periodically (not in demo).
  const visitBufRef = useRef<{ nodeId: number; type: string }[]>([]);
  const demoRef = useRef(false);
  useEffect(() => {
    demoRef.current = !!demo;
  }, [demo]);
  const loadedRef = useRef(false);
  useEffect(() => {
    loadedRef.current = !!loaded;
  }, [loaded]);
  // Floating ship task label preference — kept in a ref for the engine loop, and
  // pushed to the live handle whenever the user toggles it.
  const showShipTaskRef = useRef(true);
  useEffect(() => {
    showShipTaskRef.current = !!showShipTask;
    soumayaHandleRef.current?.setTaskVisible(!!showShipTask);
  }, [showShipTask]);

  // Progression flight speed — pushed to Soumaya so she flies faster as you grow
  // the brain. Re-applied on change and once on (re)creation via the same handle.
  const pilotSpeedRef = useRef(1);
  useEffect(() => {
    pilotSpeedRef.current = pilotSpeed ?? 1;
    soumayaHandleRef.current?.setPilotSpeed?.(pilotSpeed ?? 1);
  }, [pilotSpeed]);

  // Hangar customization states and refs
  const fig1GroupRef = useRef<THREE.Group | null>(null);
  const fig2GroupRef = useRef<THREE.Group | null>(null);

  const equippedShipRef = useRef(equippedShip);
  const equippedFig1Ref = useRef(equippedFig1);
  const equippedFig2Ref = useRef(equippedFig2);
  const equippedTrailRef = useRef(equippedTrail);

  const spaceIdRef = useRef(spaceId);
  useEffect(() => {
    spaceIdRef.current = spaceId;
  }, [spaceId]);

  useEffect(() => {
    equippedShipRef.current = equippedShip;
    if (soumayaHandleRef.current?.setShipSkin) {
      soumayaHandleRef.current.setShipSkin(equippedShip);
    }
  }, [equippedShip]);

  useEffect(() => {
    equippedTrailRef.current = equippedTrail;
    if (soumayaHandleRef.current?.setTrailColor) {
      soumayaHandleRef.current.setTrailColor(equippedTrail);
    }
  }, [equippedTrail]);

  useEffect(() => {
    equippedFig1Ref.current = equippedFig1;
    if (fig1GroupRef.current) {
      updateFigurine(
        fig1GroupRef.current,
        equippedFig1,
        new THREE.Vector3(8000, 3000, -9500),
        () => fgRef.current?.scene?.()?.environment ?? null
      );
    }
  }, [equippedFig1]);

  useEffect(() => {
    equippedFig2Ref.current = equippedFig2;
    if (fig2GroupRef.current) {
      updateFigurine(
        fig2GroupRef.current,
        equippedFig2,
        new THREE.Vector3(-9000, -2000, -9500),
        () => fgRef.current?.scene?.()?.environment ?? null
      );
    }
  }, [equippedFig2]);

  // Live graph data for the Soumaya agent (react-force-graph mutates x/y/z on
  // these node objects each tick, so the agent always has current positions).
  const dataRef = useRef(data);
  // id → node map for O(1) lookups in the per-link accessors (see getLinkActivity).
  const nodeByIdRef = useRef<Map<number, any>>(new Map());
  const nodeThreeObjCacheRef = useRef<Map<number, { obj: THREE.Object3D; key: string }>>(new Map());
  const orbitsRef = useRef(makeOrbitSystem());
  useEffect(() => {
    dataRef.current = data;
    const liveIds = new Set((data.nodes as any[]).map((n) => n.id));
    for (const id of nodeThreeObjCacheRef.current.keys()) {
      if (!liveIds.has(id)) {
        nodeThreeObjCacheRef.current.delete(id);
      }
    }
    const prevById = nodeByIdRef.current; // last frame's nodes (for detecting deletions)
    nodeByIdRef.current = new Map((data.nodes as any[]).map((n: any) => [n.id, n]));
    orbitsRef.current.rebuild(data.nodes as any[], data.links as any[]);
    sunRef.current?.userData?.setBrainScale?.(data.nodes.length); // core-self size (clamped)
    // Place the station just outside the bodies (so planets never pass through it)
    // and size the zoom ceiling so you can frame the station — wrapped in stars —
    // but never zoom far enough to exit the surrounding star field.
    const reff = Math.max(orbitsRef.current.getRadius(), 1000);
    stationOrbitRef.current = reff + 800;
    maxDistRef.current = Math.min(6200, Math.max(3200, stationOrbitRef.current + 1400));

    // Detect freshly-formed connections so SOUMAYA flies out and draws them herself
    // (rather than the line just popping in). The first data load is the baseline —
    // we don't make her redraw the entire pre-existing graph.
    const keys = (data.links as any[]).map(linkKey);
    // A wholesale dataset swap (entering/leaving the demo galaxy) is NOT incremental
    // growth — re-baseline so the new graph shows fully wired up immediately instead
    // of dumping every link onto Soumaya's redraw queue (which left demo looking
    // empty and made "← Back to mine" feel broken).
    const datasetSwitched = prevDemoRef.current !== !!demo;
    prevDemoRef.current = !!demo;
    if (!linksInitedRef.current || datasetSwitched) {
      if (loaded || data.nodes.length > 0 || datasetSwitched) {
        knownLinksRef.current = new Set(keys);
        knownNodesRef.current = new Set((data.nodes as any[]).map((n) => n.id));
        pendingLinksRef.current.clear(); // everything visible now; nothing to redraw
        linksInitedRef.current = true;
        fgRef.current?.refresh?.();
        // Re-frame the whole galaxy once the new positions settle (reuses the
        // first-frame logic) so a demo<->real swap opens zoomed-out, not inside the sun.
        if (datasetSwitched) initialFramedRef.current = false;
      }
    } else {
      // New CONNECTIONS: Soumaya flies out and draws them (hidden until then).
      const fresh: LinkTask[] = [];
      for (const l of data.links as any[]) {
        const k = linkKey(l);
        if (!knownLinksRef.current.has(k)) {
          knownLinksRef.current.add(k);
          pendingLinksRef.current.add(k); // hide it until Soumaya draws it
          fresh.push({ id: `link-${k}`, source: linkEnd(l.source), target: linkEnd(l.target), key: k });
        }
      }
      if (fresh.length > 0) {
        soumayaHandleRef.current?.enqueueLinks(fresh);
        fgRef.current?.refresh?.(); // apply the new pending-hidden visibility
      }

      // New MEMORIES: park each at the waystation "dock" and have Soumaya ferry it
      // into its orbit slot (Phase 2). The orbit system holds it (won't place it)
      // until she drops it home. Falls back to normal placement if no dock yet.
      const dock = stationObjRef.current?.getWorldPosition(new THREE.Vector3()) ?? null;
      if (dock) {
        const freshNodes: number[] = [];
        for (const n of data.nodes as any[]) {
          if (!knownNodesRef.current.has(n.id)) {
            knownNodesRef.current.add(n.id);
            n.x = dock.x + (Math.random() - 0.5) * 90;
            n.y = dock.y + (Math.random() - 0.5) * 50;
            n.z = dock.z + (Math.random() - 0.5) * 90;
            n.fx = n.x; n.fy = n.y; n.fz = n.z; // wait at the dock
            orbitsRef.current.hold(n.id);
            freshNodes.push(n.id);
          }
        }
        if (freshNodes.length > 0) soumayaHandleRef.current?.enqueuePlacements(freshNodes);
      } else {
        // No station yet — just track them as known so they place normally.
        for (const n of data.nodes as any[]) knownNodesRef.current.add(n.id);
      }

      // DELETED memories: Soumaya drags each to the Sun and flings it in (Phase 2b).
      const liveIds = new Set((data.nodes as any[]).map((n) => n.id));
      const removals: RemovalTask[] = [];
      for (const id of knownNodesRef.current) {
        if (!liveIds.has(id)) {
          knownNodesRef.current.delete(id);
          orbitsRef.current.release(id); // in case it was mid-ferry
          const old = prevById.get(id);
          if (old && old.x != null) {
            removals.push({
              id: `removal-${id}-${Date.now()}`,
              x: old.x,
              y: old.y,
              z: old.z ?? 0,
              color: colorForType(old.type),
              size: 4 + (old.mass ?? 0.3) * 5,
            });
          }
        }
      }
      if (removals.length > 0) soumayaHandleRef.current?.enqueueRemovals(removals);
    }
  }, [data, demo, loaded]);

  // When set, the camera locks onto this node and rides along as it orbits, so a
  // body you jumped to doesn't drift out of frame.
  const followRef = useRef<number | null>(null);
  // Generic "focus on a non-memory object" (ship / station). On enable we snap to
  // the front of it once, then just track it so the user can orbit freely.
  const followObjRef = useRef<THREE.Object3D | null>(null);
  const followDistRef = useRef(30);
  const followSnapRef = useRef(false);
  const followKindRef = useRef<"ship" | "station" | "satellite" | "visitor" | "fig1" | "fig2" | null>(null);
  // Which active beacon we're cycling through with the satellite focus button.
  const satFollowIndexRef = useRef(0);
  // Ride-along anchor so focusing a moving body keeps a locked view (no swinging).
  const followObjAnchor = useRef(new THREE.Vector3());
  const followObjAnchored = useRef(false);
  // Camera zoom-out ceiling, kept just beyond the galaxy so you can never zoom so
  // far that the bodies leave the star field / you see its edge.
  const maxDistRef = useRef(5200);
  // Desired station orbit radius (sized to sit just outside the galaxy bodies).
  const stationOrbitRef = useRef(1700);

  const soumayaObjRef = useRef<THREE.Object3D | null>(null);
  const soumayaHandleRef = useRef<SoumayaHandle | null>(null);
  const stationObjRef = useRef<THREE.Object3D | null>(null);
  const sunRef = useRef<THREE.Object3D | null>(null);

  const onTasksChangeRef = useRef(onTasksChange);
  useEffect(() => {
    onTasksChangeRef.current = onTasksChange;
  }, [onTasksChange]);

  const shipViewModeRef = useRef<"orbit" | "cockpit">("orbit");
  useEffect(() => {
    if (shipViewMode) shipViewModeRef.current = shipViewMode;
  }, [shipViewMode]);

  const lastTasksJsonRef = useRef("");

  const bloomRef = useRef<{ strength: number } | null>(null);
  const initialFramedRef = useRef(false);
  // Link keys we've already seen, so only NEW connections get drawn by Soumaya.
  const knownLinksRef = useRef<Set<string>>(new Set());
  // Node ids we've already seen, so only BRAND-NEW memories get ferried into place.
  const knownNodesRef = useRef<Set<number>>(new Set());
  // Per-link last-repaired time (ms). Links decay with neglect; Soumaya re-forging
  // one refreshes it (Phase 3). Kept client-side so it needs no schema change.
  const linkHealthRef = useRef<Map<string, number>>(new Map());
  const linksInitedRef = useRef(false);
  // Tracks the demo flag across data updates so a demo<->real swap re-baselines links.
  const prevDemoRef = useRef(!!demo);
  // New links stay hidden until Soumaya physically flies out and connects them.
  const pendingLinksRef = useRef<Set<string>>(new Set());
  const satellitesRef = useRef<SatelliteSystem | null>(null);
  const subAgentsRef = useRef<SubAgentSystem | null>(null);
  const visitorsRef = useRef<VisitorSystem | null>(null);
  const visFollowIndexRef = useRef(0);
  const lastSatCountRef = useRef(-1);
  const lastVisCountRef = useRef(-1);
  const burstsRef = useRef<ReturnType<typeof makeCollisionBursts> | null>(null);

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

    // Image-based lighting: a PMREM environment so the glTF models (ship, station,
    // Aura satellites) — which use metallic PBR materials — actually catch light and
    // reflections instead of rendering as black silhouettes. Also gives every body a
    // subtle premium sheen. Generated once from a neutral procedural room.
    try {
      const renderer = fg.renderer() as THREE.WebGLRenderer;
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    } catch (err) {
      console.warn("[graph] environment map unavailable:", err);
    }

    // Declared outside try-catch so spawnBurst can access it
    let soumaya: SoumayaHandle | null = null;
    let visitors: VisitorSystem | null = null;
    let satellites: SatelliteSystem | null = null;
    let subAgents: SubAgentSystem | null = null;
    
    try {
      scene.background = makeSpaceBackground();
      loadNebulaSkybox(scene);
      scene.add(makeStarfield());
      scene.add(makeNebulae());
      scene.add(makeGalaxies());
      scene.add(makeConstellations());
      scene.add(makeComets());
      const bursts = makeCollisionBursts();
      burstsRef.current = bursts;
      scene.add(bursts.group);

      // Create background figurine groups and register them
      const fig1Group = new THREE.Group();
      const fig2Group = new THREE.Group();
      fig1GroupRef.current = fig1Group;
      fig2GroupRef.current = fig2Group;
      scene.add(fig1Group);
      scene.add(fig2Group);

      // Initialize background figurines with current values
      updateFigurine(fig1Group, equippedFig1Ref.current, new THREE.Vector3(8000, 3000, -9500), () => scene.environment);
      updateFigurine(fig2Group, equippedFig2Ref.current, new THREE.Vector3(-9000, -2000, -9500), () => scene.environment);

      soumaya = makeSoumaya(equippedShipRef.current);
      soumayaHandleRef.current = soumaya;
      if (soumaya.setTrailColor) {
        soumaya.setTrailColor(equippedTrailRef.current);
      }
      scene.add(soumaya.object);
      scene.add(soumaya.taskLabel);
      scene.add(soumaya.cargo); // the discarded memory she drags into the Sun
      soumaya.setTaskVisible(!!showShipTaskRef.current);
      soumaya.setPilotSpeed?.(pilotSpeedRef.current);
      soumayaObjRef.current = soumaya.object;
      // The Sun: the gigantic central body every cluster revolves around.
      const sun = makeSun();
      sunRef.current = sun;
      sun.userData.setBrainScale?.(dataRef.current.nodes.length);
      scene.add(sun);
      const station = makeSpaceStation();
      scene.add(station);
      stationObjRef.current = station;
      visitors = makeVisitors(3, (nodeId, type) => {
        if (!demoRef.current) visitBufRef.current.push({ nodeId, type });
      });
      visitorsRef.current = visitors;
      scene.add(visitors.group);
      satellites = makeSatellites();
      satellitesRef.current = satellites;
      scene.add(satellites.group);
      subAgents = makeSubAgents();
      subAgentsRef.current = subAgents;
      scene.add(subAgents.group);
      bloomRef.current = addBloom(fg, {});

      // Click detection for Soumaya's ship
      const canvas = fg.renderer().domElement;
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();
      const handleClick = (e: MouseEvent) => {
        if (!onSoumayaClick) return;
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, fg.camera());
        const intersects = raycaster.intersectObject(soumaya!.object, true);
        if (intersects.length > 0) {
          onSoumayaClick();
        }
      };
      canvas.addEventListener("click", handleClick);
      fg.__brainCleanupClick = () => canvas.removeEventListener("click", handleClick);

      // Motion is handled by the kinematic orbit system (orbits.ts), which pins
      // node positions each frame — so disable the force-engine layout entirely
      // (no charge/gravity tug-of-war, no collapse). Links are kept only as
      // visual tethers between the orbiting bodies.
      fg.d3Force("charge")?.strength(0);
      fg.d3Force("center", null);
      fg.d3Force("link")?.strength(0);
      fg.d3AlphaTarget(0.05); // Keep the simulation ticking forever so kinematic updates render correctly

      // Zoom-out ceiling is driven each frame by maxDistRef (sized to the galaxy)
      // so you can admire it all but never zoom past the star field. Smooth,
      // weighty controls (inertial damping + zoom-toward-cursor) for a premium,
      // non-jittery feel when flying around and zooming in on planets.
      if (controls) {
        controls.maxDistance = maxDistRef.current;
        controls.minDistance = 8;
        controls.enableDamping = true;
        controls.dampingFactor = 0.075;
        controls.rotateSpeed = 0.55;
        controls.zoomSpeed = 0.9;
        controls.panSpeed = 0.6;
        controls.zoomToCursor = true; // dolly toward whatever you point at
        controls.screenSpacePanning = true;
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

    const MACRO_DIST = 2600; // swap fidelity for points-of-light beyond this
    // (raised so bodies resolve into full 3D as you fly toward a cluster, not only
    // when you're right on top of them — dots are for genuinely distant bodies).

    // Brightness is INVERTED with zoom: a body blooms brightest from afar (the
    // galaxy reads as points of light) and dims/concentrates up close so you can
    // read its label and see the surface texture.
    const DIM_NEAR = 70;
    const BRIGHT_FAR = 430;
    const brightness = (d: number): number => {
      const t = Math.min(1, Math.max(0, (d - DIM_NEAR) / (BRIGHT_FAR - DIM_NEAR)));
      return 0.25 + 0.35 * t; // 0.25x up close .. 0.6x far away
    };

    // Nerve firing: emit single particles down links ON ACTIVITY (Soumaya tending a
    // memory, or fastening a new connection) instead of a constant random stream.
    // `emitParticle` fires one dot along a link using the particle accessors below.
    const fireAlongNode = (nodeId: number) => {
      const f = fgRef.current;
      if (!f?.emitParticle) return;
      let fired = 0;
      for (const l of dataRef.current.links as any[]) {
        if (fired >= 5) break;
        if (linkEnd(l.source) === nodeId || linkEnd(l.target) === nodeId) {
          try {
            f.emitParticle(l);
          } catch {
            /* link not mounted yet */
          }
          fired++;
        }
      }
    };
    const fireLink = (key: string) => {
      const f = fgRef.current;
      // A freshly drawn OR repaired connection is now fully fresh (Phase 3 decay).
      linkHealthRef.current.set(key, Date.now());
      // Reveal the freshly-drawn thread now that she's joined both ends.
      if (pendingLinksRef.current.delete(key)) f?.refresh?.();
      if (!f?.emitParticle) return;
      const l = (dataRef.current.links as any[]).find((x) => linkKey(x) === key);
      if (!l) return;
      // A short burst of dots so the new connection visibly "lights up".
      for (let i = 0; i < 4; i++) {
        window.setTimeout(() => {
          try {
            f.emitParticle(l);
          } catch {
            /* ignore */
          }
        }, i * 160);
      }
      // Spark at both endpoints to read as "connected".
      const s = (dataRef.current.nodes as any[]).find((n) => n.id === linkEnd(l.source));
      const t2 = (dataRef.current.nodes as any[]).find((n) => n.id === linkEnd(l.target));
      if (s?.x != null) burstsRef.current?.spawn(s.x, s.y, s.z ?? 0, "synthesis");
      if (t2?.x != null) burstsRef.current?.spawn(t2.x, t2.y, t2.z ?? 0, "synthesis");
    };

    // Faint idle pulse: so dormant threads aren't lifeless, occasionally send a
    // single slow dot down a few random visible links (much quieter than the
    // activity firing).
    const IDLE_PULSE_EVERY_BASE = 4; // base seconds between ambient pulses
    let idlePulseT = IDLE_PULSE_EVERY_BASE;
    // Flush buffered visitor arrivals to the backend every ~20s.
    let visitFlushT = 20;
    // Phase 3: how often to scan for decayed links to send Soumaya to repair.
    let repairScanT = 18;
    const idlePulse = () => {
      const f = fgRef.current;
      if (!f?.emitParticle) return;
      const links = (dataRef.current.links as any[]).filter(
        (l) => !pendingLinksRef.current.has(linkKey(l)),
      );
      if (links.length === 0) return;
      // Intensify pulse density with node count: more links shimmer for larger brains (capped at 15 to prevent flooding)
      const numNodes = dataRef.current.nodes.length;
      const pulseLinksCount = Math.min(15, Math.max(2, Math.floor(numNodes / 10)));
      for (let i = 0; i < Math.min(pulseLinksCount, links.length); i++) {
        // Tournament selection: pick two random links and choose the one connected to
        // higher-degree nodes (i.e. denser clusters).
        const l1 = links[Math.floor(Math.random() * links.length)];
        const l2 = links[Math.floor(Math.random() * links.length)];
        const n1s = (dataRef.current.nodes as any[]).find((x) => x.id === linkEnd(l1.source));
        const n1t = (dataRef.current.nodes as any[]).find((x) => x.id === linkEnd(l1.target));
        const n2s = (dataRef.current.nodes as any[]).find((x) => x.id === linkEnd(l2.source));
        const n2t = (dataRef.current.nodes as any[]).find((x) => x.id === linkEnd(l2.target));
        
        const deg1 = (n1s?.degree ?? 0) + (n1t?.degree ?? 0);
        const deg2 = (n2s?.degree ?? 0) + (n2t?.degree ?? 0);
        const l = deg1 >= deg2 ? l1 : l2;

        try {
          f.emitParticle(l);
        } catch {
          /* link not mounted */
        }
      }
    };

    let raf = 0;
    let last = performance.now() * 0.001;
    let lastDist = 0;
    let lastRefreshTime = 0;
    const followAnchor = new THREE.Vector3();
    let followAnchorId: number | null = null;
    const followPos = new THREE.Vector3();
    const tick = () => {
      const now = performance.now() * 0.001;
      const dt = Math.min(0.05, now - last);
      last = now;

      // Sync tasks changes back to React UI
      if (soumayaHandleRef.current && onTasksChangeRef.current) {
        const currentTasks = soumayaHandleRef.current.getTasks(dataRef.current.nodes);
        const tasksJson = JSON.stringify(currentTasks);
        if (tasksJson !== lastTasksJsonRef.current) {
          lastTasksJsonRef.current = tasksJson;
          onTasksChangeRef.current(currentTasks);
        }
      }

      // Make link curvature/opacity zoom-bias live:
      // Track camera distance and periodically refresh link styles when zooming/scrolling
      const camera = fgRef.current?.camera();
      if (camera) {
        const dist = camera.position.length();
        const nowMs = performance.now();
        if (Math.abs(dist - lastDist) > 35 && nowMs - lastRefreshTime > 250) {
          lastDist = dist;
          lastRefreshTime = nowMs;
          fgRef.current?.refresh?.();
        }
      }

      // Ambient "alive" shimmer on idle threads.
      idlePulseT -= dt;
      if (idlePulseT <= 0) {
        idlePulse();
        // Intensify idle pulse frequency with node count (down to every 1 second)
        const numNodes = dataRef.current.nodes.length;
        const pulseEvery = Math.max(1, IDLE_PULSE_EVERY_BASE - Math.floor(numNodes / 20));
        idlePulseT = pulseEvery;
      }

      // Phase 3 — link decay & repair: periodically hand Soumaya the most-degraded
      // visible connections so she flies out and re-forges them (which refreshes
      // their freshness via fireLink). Demo galaxy is left alone.
      repairScanT -= dt;
      if (repairScanT <= 0) {
        repairScanT = 14; // throttle: a calm, occasional housekeeping pass
        if (!demoRef.current) {
          const stale = (dataRef.current.links as any[])
            .filter((l) => !pendingLinksRef.current.has(linkKey(l)) && getLinkActivity(l) < 0.12)
            .slice(0, 30) // bound the work
            .map((l) => ({ l, key: linkKey(l) }))
            .sort((a, b) => getLinkActivity(a.l) - getLinkActivity(b.l))
            .slice(0, 2)
            .map(({ l, key }) => ({ source: linkEnd(l.source), target: linkEnd(l.target), key }));
          if (stale.length > 0) soumayaHandleRef.current?.enqueueLinks(stale);
        }
      }

      // Persist visitor arrivals in batches.
      visitFlushT -= dt;
      if (visitFlushT <= 0) {
        visitFlushT = 20;
        if (visitBufRef.current.length > 0) {
          logVisits(visitBufRef.current.splice(0, visitBufRef.current.length));
        }
      }

      // Advance every body along its orbit first, so the camera + Soumaya read
      // up-to-date positions this frame.
      orbitsRef.current.update(dt, dataRef.current.nodes as any[]);

      // First frame with real positions → open zoomed-out (not inside the sun).
      if (!initialFramedRef.current) {
        if (loadedRef.current) {
          const ns = dataRef.current.nodes as any[];
          if (ns.length === 0 || ns.some((n) => n.x != null && !isNaN(n.x))) {
            initialFramedRef.current = true;
            frameGalaxy(3200, undefined, true);
          }
        }
      }

      // Focus dim: when the camera is locked onto a body, fade the sun's glare +
      // soften bloom so the body reads clearly; restore when free/recentered.
      const focused = followRef.current != null || followObjRef.current != null;
      sunRef.current?.userData?.setFocusDim?.(focused);
      if (bloomRef.current) {
        const target = focused ? 0.16 : 0.35;
        bloomRef.current.strength += (target - bloomRef.current.strength) * Math.min(1, dt * 3);
      }

      // Beacons launch from the station/ship, so hand the satellites their world positions.
      const stationWorld = stationObjRef.current
        ? stationObjRef.current.getWorldPosition(new THREE.Vector3())
        : null;
      const soumayaPos = soumayaObjRef.current
        ? soumayaObjRef.current.position.clone()
        : null;
      satellites?.update(dt, dataRef.current.nodes as any[], stationWorld, soumayaPos);
      if (satellites && soumayaHandleRef.current) {
        const pending = satellites.getPendingDispatches();
        if (pending.length > 0) {
          soumayaHandleRef.current.enqueueBeacons(pending);
          if (spaceIdRef.current) {
            const key = `stat.beacons_deployed.${spaceIdRef.current}`;
            localStorage.setItem(key, String(parseInt(localStorage.getItem(key) || "0", 10) + pending.length));
            // Force evaluate achievements in App
            fgRef.current?.refresh?.();
          }
        }
      }
      // Defender live drifter intercept: wire visitor positions as a hazard context
      let subAgentHazard: SubAgentHazard | undefined = undefined;
      if (visitors) {
        subAgentHazard = {
          positions: visitors.getActive().map((v) => {
            const p = new THREE.Vector3();
            v.object.getWorldPosition(p);
            return p;
          }),
        };
      }
      subAgents?.update(dt, dataRef.current.nodes as any[], subAgentHazard);
      // Drifters fear/hate the beacons: hand the visitor system the live hazard set.
      visitors?.update(
        dt,
        dataRef.current.nodes as any[],
        satellites
          ? { beaconedIds: satellites.getBeaconedIds(), positions: satellites.getPositions() }
          : undefined,
      );
      // Tell React how many beacons are live, so the focus button can pulse.
      if (satellites) {
        const active = satellites.getActive();
        if (active.length !== lastSatCountRef.current) {
          lastSatCountRef.current = active.length;
          onSatelliteCount?.(active.length);
        }
        // If the beacon we're following went dark, release the camera.
        if (followKindRef.current === "satellite") {
          const stillActive = active.some((a) => a.object === followObjRef.current);
          if (!stillActive) {
            followObjRef.current = null;
            followKindRef.current = null;
          }
        }
      }
      // Tell React how many visitors are around (drives the "jump to visitor" FAB).
      if (visitors) {
        const vActive = visitors.getActive();
        if (vActive.length !== lastVisCountRef.current) {
          lastVisCountRef.current = vActive.length;
          onVisitorCount?.(vActive.length);
        }
        // Release the camera if the visitor we were following has left.
        if (followKindRef.current === "visitor") {
          const stillHere = vActive.some((a) => a.object === followObjRef.current);
          if (!stillHere) {
            followObjRef.current = null;
            followKindRef.current = null;
          }
        }
      }

      // Keep the zoom ceiling matched to the current galaxy size.
      if (controls) controls.maxDistance = maxDistRef.current;
      // Keep the station orbiting just outside the bodies (scales with the galaxy).
      stationObjRef.current?.userData?.setOrbit?.(stationOrbitRef.current);

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
          // rides above the panel instead of being centered behind it. On desktop,
          // look a bit to the right to shift the focused target to the left.
          if (insetRef.current) {
            if (window.innerWidth <= 720) {
              const down = new THREE.Vector3(0, -1, 0).applyQuaternion(camera.quaternion);
              controls.target.addScaledVector(down, camera.position.distanceTo(followPos) * 0.18);
            } else {
              const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
              controls.target.addScaledVector(right, camera.position.distanceTo(followPos) * 0.095);
            }
          }
          followAnchor.copy(followPos);
          followAnchorId = fid;
        }
      } else {
        followAnchorId = null;
      }

      // Slowly rotate the deep space background figurines
      if (fig1GroupRef.current) {
        fig1GroupRef.current.rotation.y += 0.001;
      }
      if (fig2GroupRef.current) {
        fig2GroupRef.current.rotation.y += 0.0008;
      }

      // 1. Update background / global objects
      scene.traverse((o: any) => {
        if (typeof o.userData?.update === "function") o.userData.update(now);
      });

      // 2. Optimized node updates (LOD + Pulse + Corona)
      // Instead of traversing the WHOLE scene (including starfield/nebulae), we
      // only iterate the bodies themselves. react-force-graph keeps them in a
      // dedicated group.
      // Find the group react-force-graph keeps the node objects in. Identify it by
      // its CONTENTS (children carrying a nodeId) rather than a fragile children-
      // count heuristic, which could latch onto the link group and silently stop
      // spin/pulse/LOD from ever running.
      const graphGroup = scene.children.find(
        (c: any) => c.type === "Group" && c.children?.some((ch: any) => ch.userData?.nodeId != null),
      );
      if (graphGroup) {
        graphGroup.children.forEach((o: any) => {
          if (o.userData?.nodeId == null) return;
          const id = o.userData.nodeId;

          const n = nodeByIdRef.current.get(id);
          if (n && n.x != null && !isNaN(n.x)) {
            o.position.set(n.x, n.y, n.z ?? 0);
          }

          o.getWorldPosition(tmp);
          const dist = tmp.distanceTo(camera.position);
          const isSelected = id === activeId;
          const isMacroView = dist > MACRO_DIST && !isSelected;

          const processing = isNodeProcessing(id);
          if (processing) {
            // Strong size pulse during processing/LLM activity
            const scalePulse = 1.0 + 0.28 * (Math.sin(now * 8.0) * 0.5 + 0.5);
            o.scale.setScalar(scalePulse);
          } else {
            o.scale.setScalar(1.0);
          }

          o.children.forEach((child: any) => {
            // Self-rotation: the body (+ rings) spins on its own axis while the
            // orbit system carries it around its neighbor. (Lives on the fidelity
            // group so labels don't rotate.)
            if (child.userData?.spin) child.rotation.y += child.userData.spinSpeed ?? 0.005;
            // Pulse/Brightness
            if (child.userData?.pulse) {
              const bf = brightness(dist);
              const p = child.userData.pulse;
              
              let s;
              let intensity;
              if (processing) {
                // Faster, stronger pulse during processing
                s = Math.sin(now * 8.0) * 0.5 + 0.5;
                intensity = (p.base * 1.5 + 0.65 * s) * bf;
              } else {
                s = Math.sin(now * p.speed + p.phase) * 0.5 + 0.5;
                intensity = (p.base + p.amp * s) * bf * (p.vitality ?? 1);
              }

              const mat = child.material as any;
              if (mat?.isShaderMaterial) {
                mat.uniforms.uBrightness.value = intensity;
                mat.uniforms.uTime.value = now;
              } else if (mat && mat.emissiveIntensity != null) {
                mat.emissiveIntensity = intensity;
              }
            }
            // Corona
            if (child.userData?.corona) {
              const bf = brightness(dist);
              const c = child.userData.corona;
              const k = c.base * (1 + 0.2 * (Math.sin(now * c.speed + c.phase) * 0.5 + 0.5));
              child.scale.set(k, k, 1);
              (child.material as THREE.SpriteMaterial).opacity = c.baseOpacity * Math.min(1, bf);
            }

            // LOD Swapping
            if (child.userData?.isFidelity) child.visible = !isMacroView;
            if (child.userData?.isMacro) child.visible = isMacroView;
            if (child.userData?.isSectorTitle) {
              child.visible = isMacroView;
              if (child.visible) {
                const mat = child.material as THREE.SpriteMaterial;
                mat.opacity = 0.8;
                const mq = child.userData.marquee;
                if (mq) {
                  mq.t += dt * 0.36;
                  mat.map!.offset.x = (Math.sin(mq.t) * 0.5 + 0.5) * mq.range;
                }
              }
            } else if (child.userData?.isLabel) {
              const labelVis = (isMacroView && !isSelected) ? 0 : Math.min(1, Math.max(0, (FADE_FAR - dist) / (FADE_FAR - FADE_NEAR)));
              child.visible = labelVis > 0.02;
              if (child.visible) {
                const mat = child.material as THREE.SpriteMaterial;
                mat.opacity = labelVis * 0.95;
                const mq = child.userData.marquee;
                if (mq) {
                  mq.t += dt * 0.36;
                  mat.map!.offset.x = (Math.sin(mq.t) * 0.5 + 0.5) * mq.range;
                }
              }
            }
          });
        });
      }

      // Drive Soumaya along the live graph; spark a maintenance burst on arrival.
      if (soumaya) {
        const d = dataRef.current;
        const stationP = stationObjRef.current
          ? stationObjRef.current.getWorldPosition(new THREE.Vector3())
          : null;
        soumaya.update(
          dt,
          d.nodes as any[],
          d.links as any[],
          (x, y, z, type, nodeId) => {
            if (spaceIdRef.current) {
              const hopKey = `stat.travel_hops.${spaceIdRef.current}`;
              localStorage.setItem(hopKey, String(parseInt(localStorage.getItem(hopKey) || "0", 10) + 1));
            }
            if (type === "beacon_dispatch" && nodeId != null) {
              satellitesRef.current?.release(nodeId);
              burstsRef.current?.spawn(x, y, z, "synthesis");
            } else if (type === "consume") {
              // A discarded memory hit the Sun — fiery burst + a corona eruption.
              burstsRef.current?.spawn(x, y, z, "consume");
              sunRef.current?.userData?.flare?.();
            } else {
              burstsRef.current?.spawn(x, y, z, type);
            }
            // Nerve firing: when she tends a memory, pulse signal down its synapses.
            if (nodeId != null) fireAlongNode(nodeId);
          },
          stationP,
          // When she fastens a new connection, fire a burst of pulses down it.
          (key) => fireLink(key),
          // Orbit seam: lets her ferry a held new memory to its live slot, then
          // release it back to normal orbiting once she drops it home.
          {
            slotOf: (id: number) => orbitsRef.current.slotOf(id),
            release: (id: number) => orbitsRef.current.release(id),
          },
          fuel,
          controls?.target,
        );
      }

      // Focus on a non-memory object (ship/station): snap to its FRONT once, then
      // just track it so the body stays centered while you orbit the camera freely.
      const fo = followObjRef.current;
      if (fo && controls) {
        const sp = new THREE.Vector3();
        fo.getWorldPosition(sp);
        
        // Disable damping when following her ship to prevent aggravating lag/trailing.
        if (followKindRef.current === "ship") {
          controls.enableDamping = false;
        } else {
          controls.enableDamping = true;
        }

        if (followKindRef.current === "ship" && shipViewModeRef.current === "cockpit") {
          // Cockpit Lock: camera is locked in front of the ship, looking back at the nose.
          const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(fo.quaternion).normalize();
          const up = new THREE.Vector3(0, 1, 0).applyQuaternion(fo.quaternion).normalize();
          const dist = 28;
          const camPos = sp.clone().addScaledVector(fwd, dist).addScaledVector(up, 8);
          camera.position.copy(camPos);
          
          const target = sp.clone();
          if (insetRef.current) {
            if (window.innerWidth <= 720) {
              const down = new THREE.Vector3(0, -1, 0).applyQuaternion(camera.quaternion);
              target.addScaledVector(down, camera.position.distanceTo(sp) * 0.18);
            } else {
              const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
              target.addScaledVector(right, camera.position.distanceTo(sp) * 0.095);
            }
          }
          controls.target.copy(target);
          followObjAnchored.current = false;
        } else if (followKindRef.current === "fig1" || followKindRef.current === "fig2") {
          // Figurine Focus: place camera in front of it and slightly below, looking up.
          if (followSnapRef.current) {
            const dir = sp.clone().normalize();
            const camPos = sp.clone().addScaledVector(dir, -4000);
            camPos.y -= 800; // Looking up from below
            camera.position.copy(camPos);
            followObjAnchor.current.copy(sp);
            followObjAnchored.current = true;
            followSnapRef.current = false;
          }
          const target = sp.clone();
          if (insetRef.current) {
            if (window.innerWidth <= 720) {
              const down = new THREE.Vector3(0, -1, 0).applyQuaternion(camera.quaternion);
              target.addScaledVector(down, camera.position.distanceTo(sp) * 0.18);
            } else {
              const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
              target.addScaledVector(right, camera.position.distanceTo(sp) * 0.095);
            }
          }
          controls.target.copy(target);
        } else {
          // Standard Orbit Follow: snap once, then ride along.
          if (followSnapRef.current) {
            const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(fo.quaternion).normalize();
            const d = followDistRef.current;
            camera.position.copy(sp).addScaledVector(fwd, d).add(new THREE.Vector3(0, d * 0.35, 0));
            followObjAnchor.current.copy(sp);
            followObjAnchored.current = true;
            followSnapRef.current = false;
          } else if (followObjAnchored.current) {
            // Ride along with the moving body: translate the camera by the body's
            // delta so the view stays locked instead of swinging to chase it.
            camera.position.add(sp.clone().sub(followObjAnchor.current));
            followObjAnchor.current.copy(sp);
          }
          const target = sp.clone();
          // Offset the target when panel is open
          if (insetRef.current) {
            if (window.innerWidth <= 720) {
              const down = new THREE.Vector3(0, -1, 0).applyQuaternion(camera.quaternion);
              target.addScaledVector(down, camera.position.distanceTo(sp) * 0.18);
            } else {
              const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
              target.addScaledVector(right, camera.position.distanceTo(sp) * 0.095);
            }
          }
          controls.target.copy(target);
        }
      } else if (controls) {
        // Ensure damping is enabled when not following any object
        controls.enableDamping = true;
      }

      // Sync computed coordinates from dataRef.current.nodes back to the active simulated nodes
      // in react-force-graph-3d.
      const fg = fgRef.current;
      const liveNodes = fg?.graphData?.()?.nodes as any[];
      if (liveNodes && liveNodes.length > 0) {
        const liveById = new Map<number, any>(liveNodes.map((n) => [n.id, n]));
        for (const n of dataRef.current.nodes as any[]) {
          const live = liveById.get(n.id);
          if (live) {
            live.x = n.x;
            live.y = n.y;
            live.z = n.z;
            live.fx = n.fx;
            live.fy = n.fy;
            live.fz = n.fz;
          }
        }
      }

      // Single damped update per frame (required for inertia + zoom-to-cursor).
      controls?.update();

      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      if (fg.__brainCleanupClick) fg.__brainCleanupClick();
    };
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
    followObjRef.current = null; // jumping to a node releases object-follow
    followKindRef.current = null;
    fg.cameraPosition({ x: camPos.x, y: camPos.y, z: camPos.z }, target, 1000);
    window.setTimeout(() => {
      followRef.current = n.id;
    }, 1050);
  };

  // Snap to a flattering "best view" of the whole galaxy: a consistent cinematic
  // 3/4 angle (slightly above + to the side) framed to the galaxy's bounding
  // sphere, rather than zoomToFit's lock to whatever angle the camera drifted to.
  const frameGalaxy = (ms = 900, filter?: (n: any) => boolean, isIntro = false) => {
    const fg = fgRef.current;
    if (!fg) return;
    const pts = (dataRef.current.nodes as any[]).filter(
      (n) => n.x != null && !isNaN(n.x) && n.y != null && !isNaN(n.y) && (!filter || filter(n)),
    );
    if (pts.length === 0) {
      fg.zoomToFit(ms, 80, filter);
      return;
    }
    const center = new THREE.Vector3();
    for (const n of pts) center.add(new THREE.Vector3(n.x, n.y, n.z ?? 0));
    center.multiplyScalar(1 / pts.length);
    const distances = pts.map((n) =>
      center.distanceTo(new THREE.Vector3(n.x, n.y, n.z ?? 0))
    );
    distances.sort((a, b) => a - b);
    const pctIndex = Math.min(distances.length - 1, Math.floor(distances.length * 0.85));
    let radius = distances[pctIndex] || 1;
    // Always enclose the (gigantic) sun at the origin too, plus headroom.
    radius = Math.max(radius, center.length() + SUN_RADIUS_MAX) * 1.12;
    const cam = fg.camera() as THREE.PerspectiveCamera;
    const fov = ((cam.fov ?? 60) * Math.PI) / 180;
    const aspect = cam.aspect ?? 1;
    // Fit by the tighter of vertical/horizontal FOV, with margin for labels/orbits.
    const vFit = radius / Math.sin(fov / 2);
    const hFit = radius / Math.sin(Math.atan(Math.tan(fov / 2) * aspect));
    let dist = Math.max(vFit, hFit) * 1.25;
    dist = Math.min(dist, maxDistRef.current * 0.95);
    const az = Math.PI * 0.22; // gentle yaw so it doesn't look dead-on
    const el = Math.PI * 0.2; // lift above the orbital plane for depth
    const dirv = new THREE.Vector3(
      Math.cos(el) * Math.sin(az),
      Math.sin(el),
      Math.cos(el) * Math.cos(az),
    );
    const camPos = center.clone().addScaledVector(dirv, dist);

    if (isIntro) {
      // Cinematic start: position camera far away, at a steep angle, rotated around the sun
      const startAz = az + Math.PI * 0.42; // offset yaw by ~75 degrees
      const startEl = Math.PI * 0.38;       // steeper elevation to look down
      const startDir = new THREE.Vector3(
        Math.cos(startEl) * Math.sin(startAz),
        Math.sin(startEl),
        Math.cos(startEl) * Math.cos(startAz)
      );
      const startPos = center.clone().addScaledVector(startDir, dist * 3.0);
      fg.cameraPosition({ x: startPos.x, y: startPos.y, z: startPos.z }, center, 0);

      // Lock user controls during the cinematic fly-in to keep it smooth
      const controls = fg.controls?.();
      if (controls) {
        controls.enabled = false;
        window.setTimeout(() => {
          controls.enabled = true;
        }, ms);
      }
    }

    fg.cameraPosition({ x: camPos.x, y: camPos.y, z: camPos.z }, center, ms);
  };

  const getLinkActivity = (l: any) => {
    // O(1) id→node lookup (rebuilt on each data change) — the link color/width/
    // curvature accessors call this per link on every refresh, so a .find() scan
    // here was O(links × nodes) and janked larger brains on mobile.
    const byId = nodeByIdRef.current;
    const sourceNode = byId.get(linkEnd(l.source));
    const targetNode = byId.get(linkEnd(l.target));
    if (!sourceNode || !targetNode) return 0;
    const timeStr = sourceNode.lastTendedAt ?? sourceNode.createdAt ?? targetNode.lastTendedAt ?? targetNode.createdAt;
    let act = 0;
    if (timeStr) {
      const ageMs = Date.now() - Date.parse(timeStr);
      if (!Number.isNaN(ageMs)) act = Math.max(0, Math.exp(-ageMs / (3 * 24 * 3600 * 1000))); // 3-day decay
    }
    // A link Soumaya recently re-forged/repaired counts as fresh too (Phase 3:
    // links decay with neglect, then she revives them). Decays over ~3 days.
    const repaired = linkHealthRef.current.get(linkKey(l));
    if (repaired) act = Math.max(act, Math.exp(-(Date.now() - repaired) / (3 * 24 * 3600 * 1000)));
    return act;
  };

  useImperativeHandle(
    ref,
    () => ({
      focusNode: (id: number) => flyTo((data.nodes as any[]).find((x) => x.id === id)),
      recenter: () => {
        followRef.current = null; // release every follow-lock so we can frame all
        followObjRef.current = null;
        followKindRef.current = null;
        setCluster(null); // exit any isolated system view
        frameGalaxy(900);
      },
      zoomBy: (factor: number) => {
        const fg = fgRef.current;
        if (!fg) return;
        const cam = fg.camera() as THREE.PerspectiveCamera;
        const controls = fg.controls?.();
        if (!controls) return;
        const target = controls.target as THREE.Vector3;
        const offset = cam.position.clone().sub(target);
        const dist = offset.length();
        const following = followRef.current != null || followObjRef.current != null;
        const ceiling = maxDistRef.current;
        const NEAR = 120; // closest we dolly to a pivot before we start travelling

        if (following) {
          // Locked on a body → classic dolly toward/away from it (clamped).
          const min = controls.minDistance ?? 8;
          const len = Math.max(min, Math.min(ceiling, dist * factor));
          cam.position.copy(target.clone().add(offset.normalize().multiplyScalar(len)));
        } else if (factor < 1 && dist * factor < NEAR) {
          // Zooming in but already near the pivot → TRAVEL forward through space
          // (move the camera AND its look-pivot together) instead of stopping dead
          // at a wall. This is what makes free roaming feel continuous.
          const fwd = offset.clone().multiplyScalar(-1).normalize(); // camera → pivot
          const step = dist * (1 - factor);
          const newCam = cam.position.clone().addScaledVector(fwd, step);
          if (newCam.length() <= ceiling) {
            cam.position.copy(newCam);
            target.addScaledVector(fwd, step); // keep the pivot ahead of us
          }
        } else {
          // Normal dolly toward/away from the pivot, clamped to the star-field shell.
          const len = Math.max(NEAR, Math.min(ceiling, dist * factor));
          cam.position.copy(target.clone().add(offset.normalize().multiplyScalar(len)));
        }
        controls.update?.();
      },
      toggleFollowShip: (forceState?: boolean) => {
        const on = forceState !== undefined ? forceState : followKindRef.current !== "ship";
        followKindRef.current = on ? "ship" : null;
        followObjRef.current = on ? soumayaObjRef.current : null;
        followDistRef.current = 26;
        followSnapRef.current = on;
        followObjAnchored.current = false;
        if (on) followRef.current = null;
        return on;
      },
      reorderTasks: (newOrder: { id: string; type: string }[]) => {
        soumayaHandleRef.current?.reorderTasks(newOrder);
      },
      toggleFollowStation: () => {
        const on = followKindRef.current !== "station";
        followKindRef.current = on ? "station" : null;
        followObjRef.current = on ? stationObjRef.current : null;
        followDistRef.current = 700; // station is colossal — stand well back
        followSnapRef.current = on;
        followObjAnchored.current = false;
        if (on) followRef.current = null;
        return on;
      },
      toggleFollowFig1: () => {
        const on = followKindRef.current !== "fig1";
        followKindRef.current = on ? "fig1" : null;
        followObjRef.current = on ? fig1GroupRef.current : null;
        followDistRef.current = 4500;
        followSnapRef.current = on;
        followObjAnchored.current = false;
        if (on) followRef.current = null;
        return on;
      },
      toggleFollowFig2: () => {
        const on = followKindRef.current !== "fig2";
        followKindRef.current = on ? "fig2" : null;
        followObjRef.current = on ? fig2GroupRef.current : null;
        followDistRef.current = 4500;
        followSnapRef.current = on;
        followObjAnchored.current = false;
        if (on) followRef.current = null;
        return on;
      },
      cycleFollowSatellite: () => {
        const active = satellitesRef.current?.getActive() ?? [];
        if (active.length === 0) return false;
        // Advance to the next beacon each press (wraps around the fleet).
        const i = satFollowIndexRef.current % active.length;
        satFollowIndexRef.current = (i + 1) % active.length;
        followKindRef.current = "satellite";
        followObjRef.current = active[i]!.object;
        followDistRef.current = 30; // probes are small — sit in close
        followSnapRef.current = true;
        followObjAnchored.current = false;
        followRef.current = null;
        return true;
      },
      cycleFollowVisitor: () => {
        const active = visitorsRef.current?.getActive() ?? [];
        if (active.length === 0) return false;
        const i = visFollowIndexRef.current % active.length;
        visFollowIndexRef.current = (i + 1) % active.length;
        followKindRef.current = "visitor";
        followObjRef.current = active[i]!.object;
        followDistRef.current = 34; // craft are small — sit in fairly close
        followSnapRef.current = true;
        followObjAnchored.current = false;
        followRef.current = null;
        return true;
      },
      isolateSystem: (id: number) => {
        // Show only this memory + everything orbiting it, then frame the WHOLE
        // system in view (not a close-up of the central star).
        const sys = orbitsRef.current.getDescendants(id);
        setCluster(sys);
        followRef.current = null;
        followObjRef.current = null;
        followKindRef.current = null;
        // Let the visibility filter apply, then fit the camera to the system, and
        // once framed, gently track its centre so it doesn't drift out of view.
        window.setTimeout(() => {
          frameGalaxy(900, (n: any) => sys.has(n.id));
        }, 80);
        window.setTimeout(() => {
          followRef.current = id;
        }, 1050);
      },
      exitCluster: () => {
        setCluster(null);
        followRef.current = null;
        frameGalaxy(800);
      },
      spawnBurst: (id: number, type = "user") => {
        const n = (data.nodes as any[]).find((x) => x.id === id);
        if (n && n.x != null) {
          burstsRef.current?.spawn(n.x, n.y, n.z ?? 0, type);
        }
      },
      fireRecall: (ids: number[]) => {
        const f = fgRef.current;
        if (!f?.emitParticle) return;
        if (ids.length === 0) return;

        // Build adjacency graph
        // Map: nodeId -> array of { neighborId, link }
        const adj = new Map<number, Array<{ neighborId: number; link: any }>>();
        for (const l of dataRef.current.links as any[]) {
          const s = linkEnd(l.source);
          const t = linkEnd(l.target);
          
          if (!adj.has(s)) adj.set(s, []);
          if (!adj.has(t)) adj.set(t, []);
          
          adj.get(s)!.push({ neighborId: t, link: l });
          adj.get(t)!.push({ neighborId: s, link: l });
        }

        // Determine the seed (source) node for the path.
        // If activeId is in the graph, use it. Otherwise, use the first cited ID.
        const allNodes = dataRef.current.nodes as any[];
        let seed: number = ids[0]!;
        if (activeId !== null && allNodes.some(n => n.id === activeId)) {
          seed = activeId;
        }

        // Run BFS from seed to find shortest path parent pointers
        const parent = new Map<number, { parentId: number; link: any }>();
        const queue: number[] = [seed];
        const visited = new Set<number>([seed]);

        while (queue.length > 0) {
          const curr = queue.shift()!;
          const neighbors = adj.get(curr) || [];
          for (const n of neighbors) {
            if (!visited.has(n.neighborId)) {
              visited.add(n.neighborId);
              parent.set(n.neighborId, { parentId: curr, link: n.link });
              queue.push(n.neighborId);
            }
          }
        }

        // For each cited node, reconstruct the path from seed and fire particles sequentially
        for (const targetId of ids) {
          if (targetId === seed) {
            const n = allNodes.find((x) => x.id === seed);
            if (n && n.x != null) {
              burstsRef.current?.spawn(n.x, n.y, n.z ?? 0, "synthesis");
            }
            continue;
          }

          const pathLinks: any[] = [];
          let curr = targetId;
          while (parent.has(curr)) {
            const p = parent.get(curr)!;
            pathLinks.unshift(p.link); // trace order: seed -> ... -> targetId
            curr = p.parentId;
          }

          if (pathLinks.length > 0) {
            // Emit particles sequentially down the path.
            pathLinks.forEach((link, index) => {
              window.setTimeout(() => {
                try {
                  f.emitParticle(link);
                  window.setTimeout(() => {
                    try {
                      f.emitParticle(link);
                    } catch {}
                  }, 80);
                } catch {}
              }, index * 220);
            });

            // After the path completes, spawn a visual burst at the target node
            const targetNode = allNodes.find((x) => x.id === targetId);
            if (targetNode && targetNode.x != null) {
              window.setTimeout(() => {
                try {
                  if (targetNode.x != null) {
                    burstsRef.current?.spawn(targetNode.x, targetNode.y, targetNode.z ?? 0, "synthesis");
                  }
                } catch {}
              }, pathLinks.length * 220 + 350);
            }
          } else {
            // Fallback: no path found, spawn a burst directly
            const targetNode = allNodes.find((x) => x.id === targetId);
            if (targetNode && targetNode.x != null) {
              burstsRef.current?.spawn(targetNode.x, targetNode.y, targetNode.z ?? 0, "synthesis");
            }
          }
        }
      },
      getFleetStatus: (): FleetStatus => {
        const labelOf = (nid: number) =>
          (dataRef.current.nodes as any[]).find((n) => n.id === nid)?.label ?? `#${nid}`;
        const active = satellitesRef.current?.getActive() ?? [];
        const sub = subAgentsRef.current?.getStatus() ?? [];
        const status: FleetStatus = {
          ship: { active: true, detail: "On her rounds" },
          station: { active: true, detail: "Holding orbit" },
          beacon: {
            active: active.length > 0,
            detail:
              active.length > 0
                ? `${active.length} deployed → ${active.map((a) => labelOf(a.targetId)).join(", ")}`
                : "None deployed",
          },
        };
        for (const s of sub) status[s.id] = { active: s.active, detail: s.detail };
        return status;
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
      cooldownTicks={9999999}
      cooldownTime={9999999}
      nodeVisibility={(n: any) => !cluster || cluster.has(n.id)}
      linkVisibility={(l: any) =>
        // Hidden while pending (Soumaya hasn't drawn it yet), and respects the
        // isolate-system cluster filter.
        !pendingLinksRef.current.has(linkKey(l)) &&
        (!cluster || (cluster.has(linkEnd(l.source)) && cluster.has(linkEnd(l.target))))
      }
      nodeThreeObject={(node: any) => {
        const cacheKey = `${node.label}_${node.importance}_${node.degree}_${node.entropy}_${node.color || ""}_${node.kind}`;
        const cached = nodeThreeObjCacheRef.current.get(node.id);
        let obj;
        if (cached && cached.key === cacheKey) {
          obj = cached.obj;
        } else {
          obj = makeNodeObject(node);
          nodeThreeObjCacheRef.current.set(node.id, { obj, key: cacheKey });
        }
        return obj;
      }}
      nodeLabel={(n: any) => {
        const proc = isNodeProcessing(n.id) ? " ⚙️ (Writing...)" : "";
        return `${n.label}${proc} · ${String(n.type).replace(/_/g, " ")}`;
      }}
      onNodeClick={(n: any) => {
        onSelect(n);
        flyTo(n);
      }}
      onNodeHover={(n: any) => setHoverId(n ? n.id : null)}
      // Connections read as faint gravitational filaments; the relationship is
      // carried by streams of drifting "space dust" rather than solid lines.
      // Curvature and opacity are biased by activity (recent tending) and zoom distance.
      linkColor={(l: any) => {
        const lit = activeId === null || (isLit(linkEnd(l.source)) && isLit(linkEnd(l.target)));
        if (!lit) return "rgba(110, 115, 140, 0.08)"; // raised unlit floor to prevent flickering/glitchy fade
        
        const activity = getLinkActivity(l);
        const camera = fgRef.current?.camera();
        const dist = camera ? camera.position.length() : 1200;
        const macroFactor = Math.min(1.5, Math.max(0.6, dist / 800));
        
        if (dist > 800) {
          // Macro zoom: cold links remain legible (floor 0.22), active axons glow cyan
          const opacity = (0.22 + activity * 0.55) * macroFactor;
          if (activity > 0.12) {
            return `rgba(122, 249, 255, ${Math.min(0.85, opacity)})`; // glowing cyan
          }
          return `rgba(150, 180, 255, ${Math.min(0.8, opacity)})`;
        }
        
        // Standard zoom: raised opacity floor (0.32 .. 0.76) for clearer persistent connections
        const opacity = 0.32 + activity * 0.44;
        return `rgba(150, 180, 255, ${Math.min(0.85, opacity * macroFactor)})`;
      }}
      linkWidth={(l: any) => {
        const activity = getLinkActivity(l);
        const camera = fgRef.current?.camera();
        const dist = camera ? camera.position.length() : 1200;
        
        if (dist > 800) {
          // Macro zoom: links become thin, fine filaments, active threads are thicker
          return 0.08 + (l.weight ?? 0.4) * 0.25 + activity * 0.42;
        }
        return 0.15 + (l.weight ?? 0.4) * 0.5 + activity * 0.3; // active lines are slightly thicker
      }}
      linkCurvature={(l: any) => {
        const activity = getLinkActivity(l);
        const camera = fgRef.current?.camera();
        const dist = camera ? camera.position.length() : 1200;
        
        // At macro zoom (> 800 distance), links curve significantly with organic wavy variance per link
        if (dist > 800) {
          const linkSeed = l.id || 0;
          const baseCurvature = 0.25 + (Math.abs(Math.sin(linkSeed * 1.7)) * 0.15);
          return baseCurvature + activity * 0.18;
        }
        
        return 0.12 + activity * 0.16; // active lines wander/curve more organically
      }}
      // No constant stream — connections fire like synapses only when something
      // real happens on them (Soumaya tending a memory or forging a link). The
      // pulses are emitted imperatively via fg.emitParticle (fireAlongNode/fireLink).
      linkDirectionalParticles={0}
      linkDirectionalParticleSpeed={(l: any) => 0.004 + (l.weight ?? 0.4) * 0.004}
      linkDirectionalParticleWidth={(l: any) => 1.6 + (l.weight ?? 0.4) * 2.0}
      linkDirectionalParticleColor={(l: any) => {
        const lit = activeId === null || (isLit(linkEnd(l.source)) && isLit(linkEnd(l.target)));
        return lit ? "rgba(205,215,255,0.95)" : "rgba(150,160,200,0.06)";
      }}
    />
  );
});
