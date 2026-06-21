/* eslint-disable @typescript-eslint/no-explicit-any */
import * as THREE from "three";
import { gltfLoader } from "./gltf.js";
import { SUN_RADIUS_MAX } from "./sun.js";
import { getNextMaintenanceJob, completeMaintenanceJob, type MaintenanceJob } from "../api/client.js";

/** A connection Soumaya should personally fly out and forge (source → target). */
export interface LinkTask {
  id?: string;
  source: number;
  target: number;
  key: string;
}

/** A discarded memory Soumaya should drag to the Sun and fling in (deletion). */
export interface RemovalTask {
  id?: string;
  x: number;
  y: number;
  z: number;
  color?: string;
  size?: number;
}

export interface SoumayaHandle {
  object: THREE.Object3D;
  /** Advance the agent; reads live node/link positions, sparks on arrival. */
  update: (
    dt: number,
    nodes: any[],
    links: any[],
    onArrive: (x: number, y: number, z: number, type: string, nodeId?: number) => void,
    stationPos?: THREE.Vector3 | null,
    onLinkConnect?: (key: string) => void,
    orbit?: { slotOf: (id: number) => THREE.Vector3 | null; release: (id: number) => void },
  ) => void;
  /** Queue new connections for her to draw herself (takes priority over patrol). */
  enqueueLinks: (tasks: LinkTask[]) => void;
  /** Queue brand-new memories for her to physically ferry from the dock into their
   *  orbit slot (held by the orbit system until she drops them). */
  enqueuePlacements: (ids: number[]) => void;
  /** Queue beacon targets for her to fly to and dispatch (takes priority over patrol). */
  enqueueBeacons: (ids: number[]) => void;
  /** Queue discarded memories for her to drag to the Sun and fling in (deletion). */
  enqueueRemovals: (tasks: RemovalTask[]) => void;
  /** The body she's currently dragging to the Sun — added to the scene by Graph3D
   *  so it animates in world space (not parented to the banking ship). */
  cargo: THREE.Object3D;
  /** Floating "current task" billboard — added to the scene by Graph3D so the
   *  ship's banking never tilts it. Toggle its visibility via setTaskVisible. */
  taskLabel: THREE.Object3D;
  /** Turn the floating task label on/off (user preference). */
  setTaskVisible: (v: boolean) => void;
  getTasks: (nodes: any[]) => { id: string; type: string; label: string; status: "doing" | "planned" | "done" }[];
  reorderTasks: (newOrder: { id: string; type: string }[]) => void;
}

const vecOf = (n: any): THREE.Vector3 => new THREE.Vector3(n.x ?? 0, n.y ?? 0, n.z ?? 0);

/** Smoothstep ease (slow start + slow finish) — gives accel/decel along a path. */
const smooth = (x: number): number => {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c);
};

/**
 * A billboard "task" label that floats above the ship and shows what she's doing.
 * Long text marquee-scrolls. Kept as a standalone object (added to the scene by
 * Graph3D) so the ship's banking/roll never tilts or swings it.
 */
function makeTaskLabel() {
  const canvas = document.createElement("canvas");
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.visible = false;
  const H = 56; // canvas px height
  const HU = 11; // world height
  const MAXW = 120; // world width before it marquees
  let scroll = false;
  let off = 0;
  let widthUnits = HU;

  const draw = (text: string) => {
    const ctx = canvas.getContext("2d")!;
    const FS = 32;
    const pad = 22;
    ctx.font = `600 ${FS}px system-ui, -apple-system, sans-serif`;
    const textWidth = Math.ceil(ctx.measureText(text).width) + pad * 2;
    const baseWidthUnits = (textWidth / H) * HU;
    const needScroll = baseWidthUnits > MAXW;
    
    // Add gap space at the end if scrolling so it doesn't loop-clump immediately
    const gap = needScroll ? 140 : 0;
    const w = Math.max(64, textWidth + gap);
    
    canvas.width = w;
    canvas.height = H;
    const c = canvas.getContext("2d")!;
    c.clearRect(0, 0, w, H);
    c.font = `600 ${FS}px system-ui, -apple-system, sans-serif`;
    c.textBaseline = "middle";
    // translucent pill
    c.fillStyle = "rgba(8,5,20,0.5)";
    c.fillRect(0, 0, w, H);
    c.fillStyle = "#cfe0ff";
    c.fillText(text, pad, H / 2 + 1);
    tex.needsUpdate = true;
    
    widthUnits = (w / H) * HU;
    if (needScroll) {
      scroll = true;
      tex.repeat.x = MAXW / widthUnits;
      sprite.scale.set(MAXW, HU, 1);
    } else {
      scroll = false;
      tex.repeat.x = 1;
      tex.offset.x = 0;
      sprite.scale.set(widthUnits, HU, 1);
    }
  };

  const tick = (dt: number) => {
    if (scroll) {
      off = (off + dt * 0.06) % 1;
      tex.offset.x = off;
    }
  };

  return { sprite, draw, tick };
}

/** Approximate a body's visual radius (mirrors nodeObject sizing) for standoff. */
const bodyRadius = (n: any): number => {
  const m = n.mass ?? 0.3;
  switch (n.celestial) {
    case "supergiant":
      return 9 + m * 7;
    case "star":
      return 6 + m * 6;
    case "giant":
      return 6.5 + m * 5;
    case "gas_giant":
      return 5.5 + m * 4.5;
    case "planet":
      return 4 + m * 4;
    case "moon":
      return 3 + m * 2.5;
    default:
      return 2.2 + m * 2;
  }
};

/**
 * Soumaya — the autonomous maintenance agent. A small low-poly craft that
 * continuously hops between connected memories, performing maintenance tasks
 * (synthesis, calibration, patrol) fetched from the backend.
 */
export function makeSoumaya(): SoumayaHandle {
  const group = new THREE.Group();

  const hull = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 4, 10),
    new THREE.MeshStandardMaterial({
      color: "#e6edff",
      emissive: new THREE.Color("#7af9ff"),
      emissiveIntensity: 0.7,
      metalness: 0.7,
      roughness: 0.25,
    }),
  );
  hull.rotation.x = Math.PI / 2; // nose points +Z (direction of travel)
  group.add(hull);

  // Swap in the real glTF ship once it loads; the procedural hull is the fallback.
  gltfLoader().load(
    "/soumaya-ship.glb",
    (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const dim = new THREE.Vector3();
      box.getSize(dim);
      const maxDim = Math.max(dim.x, dim.y, dim.z) || 1;
      const k = 9 / maxDim;
      model.scale.setScalar(k);
      const center = new THREE.Vector3();
      box.getCenter(center);
      model.position.copy(center.multiplyScalar(-k)); // recenter on origin
      hull.visible = false;
      group.add(model);
    },
    undefined,
    (err) => console.warn("[soumaya] ship model failed to load; using procedural hull", err),
  );

  // Engine glow trailing behind the nose.
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = glowCanvas.height = 64;
  const gctx = glowCanvas.getContext("2d")!;
  const grad = gctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(180,220,255,0.95)");
  grad.addColorStop(1, "rgba(122,249,255,0)");
  gctx.fillStyle = grad;
  gctx.fillRect(0, 0, 64, 64);
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(glowCanvas),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  glow.scale.set(9, 9, 1);
  glow.position.set(0, 0, -2.5);
  group.add(glow);
  group.scale.setScalar(1.5);
  group.visible = false;

  // The doomed memory she drags to the Sun (world-space; added to scene by Graph3D).
  const cargo = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 16),
    new THREE.MeshStandardMaterial({
      color: "#cfe0ff",
      emissive: new THREE.Color("#8aa0ff"),
      emissiveIntensity: 0.5,
      roughness: 0.7,
    }),
  );
  cargo.visible = false;

  // Floating "what she's doing" label (billboard added to scene by Graph3D).
  const taskLabel = makeTaskLabel();
  let taskEnabled = false;
  let lastTaskText = "";
  let bank = 0; // current banked roll (smoothed toward target each frame)

  let mode:
    | "travel"
    | "orbit"
    | "idle"
    | "dockTravel"
    | "docking"
    | "linkToSource"
    | "linkToTarget"
    | "placePickup"
    | "placeCarry"
    | "removeTravel"
    | "removeCarry"
    | "beaconTravel" = "idle";
  let curve: THREE.QuadraticBezierCurve3 | null = null;
  let t = 0;
  let speed = 0.25;
  let target: any = null;
  let currentJob: MaintenanceJob | null = null;
  let isFetching = false;

  // Beacons she needs to dispatch (fly to target memory and deploy)
  const beaconQueue: number[] = [];
  let activeBeacon: number | null = null;

  // Discarded memories to drag to the Sun and fling in (deletion spectacle).
  const removalQueue: RemovalTask[] = [];
  let activeRemoval: RemovalTask | null = null;

  // Connections she's been asked to forge herself (fly to A, grab the thread, fly
  // to B, connect). Drained before patrol so new memories get linked on-screen.
  const linkQueue: LinkTask[] = [];
  let activeLink: LinkTask | null = null;
  let linkTgtNode: any = null;
  let onLinkConnectCb: ((key: string) => void) | null = null;

  // Placement: brand-new memories she ferries from the dock into their orbit slot.
  // The orbit system "holds" each (won't move it) until she drops it + releases.
  const placeQueue: number[] = [];
  let activePlace: number | null = null;
  let orbitApi: { slotOf: (id: number) => THREE.Vector3 | null; release: (id: number) => void } | null = null;

  // Station docking: after a few jobs, fly to the station to "recharge".
  const DOCK_EVERY = 4;
  let jobsSinceDock = 0;
  let dockTime = 0;
  const stationLoc = new THREE.Vector3();
  let haveStation = false;

  // Orbit-phase state.
  let orbitAngle = 0;
  let orbitRadius = 20;
  let orbitTime = 0;
  let jobTimer = 0;
  let ou = new THREE.Vector3(1, 0, 0);
  let ov = new THREE.Vector3(0, 0, 1);

  /** Fetch a real job from the backend or fall back to a random patrol if offline. */
  const acquireJob = async (nodes: any[]) => {
    if (isFetching || nodes.length === 0) return;
    isFetching = true;
    try {
      currentJob = await getNextMaintenanceJob();
    } catch (err) {
      // Fallback: local random patrol
      const candidates = nodes.filter((n) => n.x != null);
      if (candidates.length > 0) {
        const r = candidates[Math.floor(Math.random() * candidates.length)];
        currentJob = { type: "patrol", targets: [r.id], description: "Routine patrol (offline fallback)" };
      }
    } finally {
      isFetching = false;
      if (currentJob) planRoute(nodes);
    }
  };

  // Fly to a STANDOFF point near a body (never its center) on a curved path.
  const planRoute = (nodes: any[]): boolean => {
    if (!currentJob) return false;
    
    // For now, always target the first node in the job targets
    target = nodes.find((n) => n.id === currentJob?.targets[0]);
    if (!target || target.x == null) {
      currentJob = null;
      mode = "idle";
      return false;
    }

    const to = vecOf(target);
    const standoff = bodyRadius(target) + 12;
    const off = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5)
      .normalize()
      .multiplyScalar(standoff);
    const endpoint = to.clone().add(off);
    const from = group.visible
      ? group.position.clone()
      : endpoint.clone().add(new THREE.Vector3(80, 50, 80));
    const mid = from
      .clone()
      .add(endpoint)
      .multiplyScalar(0.5)
      .add(new THREE.Vector3((Math.random() - 0.5) * 40, 20 + Math.random() * 30, (Math.random() - 0.5) * 40));
    curve = new THREE.QuadraticBezierCurve3(from, mid, endpoint);
    t = 0;
    speed = Math.min(0.4, 50 / (from.distanceTo(endpoint) || 1));
    mode = "travel";
    group.visible = true;
    return true;
  };

  // Fly to a standoff point near the space station for a recharge dock.
  const planDock = (): void => {
    const standoff = 360; // clear the colossal station's radius
    const off = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5)
      .normalize()
      .multiplyScalar(standoff);
    const endpoint = stationLoc.clone().add(off);
    const from = group.visible
      ? group.position.clone()
      : endpoint.clone().add(new THREE.Vector3(120, 70, 120));
    const mid = from
      .clone()
      .add(endpoint)
      .multiplyScalar(0.5)
      .add(new THREE.Vector3((Math.random() - 0.5) * 60, 50 + Math.random() * 50, (Math.random() - 0.5) * 60));
    curve = new THREE.QuadraticBezierCurve3(from, mid, endpoint);
    t = 0;
    speed = Math.min(0.32, 70 / (from.distanceTo(endpoint) || 1));
    mode = "dockTravel";
    group.visible = true;
  };

  // Curve from the current position to a standoff point near a given body.
  const curveTo = (node: any): boolean => {
    if (!node || node.x == null) return false;
    const to = vecOf(node);
    const standoff = bodyRadius(node) + 12;
    const off = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5)
      .normalize()
      .multiplyScalar(standoff);
    const endpoint = to.clone().add(off);
    const from = group.visible
      ? group.position.clone()
      : endpoint.clone().add(new THREE.Vector3(80, 50, 80));
    const mid = from
      .clone()
      .add(endpoint)
      .multiplyScalar(0.5)
      .add(new THREE.Vector3((Math.random() - 0.5) * 40, 20 + Math.random() * 30, (Math.random() - 0.5) * 40));
    curve = new THREE.QuadraticBezierCurve3(from, mid, endpoint);
    t = 0;
    speed = Math.min(0.5, 60 / (from.distanceTo(endpoint) || 1));
    group.visible = true;
    return true;
  };

  // Begin the next queued connection: fly to its source memory first.
  const startLink = (nodes: any[]): void => {
    while (linkQueue.length > 0) {
      const task = linkQueue.shift()!;
      const src = nodes.find((n) => n.id === task.source);
      const tgt = nodes.find((n) => n.id === task.target);
      if (src?.x != null && tgt?.x != null && curveTo(src)) {
        activeLink = task;
        target = src;
        linkTgtNode = tgt;
        mode = "linkToSource";
        return;
      }
      // endpoints not ready/positioned — drop and try the next.
    }
  };

  // Begin ferrying the next brand-new memory: fly to where it waits (the dock),
  // then carry it into its orbit slot. Falls back to releasing it (normal orbit
  // placement) if anything's missing, so a new memory can never get stranded.
  const startPlacement = (nodes: any[]): void => {
    while (placeQueue.length > 0) {
      const id = placeQueue.shift()!;
      const node = nodes.find((n) => n.id === id);
      const slot = orbitApi?.slotOf(id) ?? null;
      if (!node || node.x == null || !slot) {
        orbitApi?.release(id); // let the orbit system place it normally
        continue;
      }
      if (curveTo(node)) {
        activePlace = id;
        target = node;
        mode = "placePickup";
        return;
      }
      orbitApi?.release(id);
    }
  };

  // Begin a deletion: fly to where the discarded memory was, so she can grab it
  // and drag it into the Sun. (The body is already gone from the graph data; the
  // task carries its last position + look.)
  const startRemoval = (): void => {
    const task = removalQueue.shift();
    if (!task) return;
    const to = new THREE.Vector3(task.x, task.y, task.z);
    const from = group.visible ? group.position.clone() : to.clone().add(new THREE.Vector3(80, 50, 80));
    const mid = from
      .clone()
      .add(to)
      .multiplyScalar(0.5)
      .add(new THREE.Vector3((Math.random() - 0.5) * 40, 20 + Math.random() * 30, (Math.random() - 0.5) * 40));
    curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    t = 0;
    speed = Math.min(0.5, 60 / (from.distanceTo(to) || 1));
    activeRemoval = task;
    mode = "removeTravel";
    group.visible = true;
  };

  // Start beacon dispatch: fly directly to the target memory to deploy the beacon.
  const startBeaconDispatch = (nodes: any[]): void => {
    while (beaconQueue.length > 0) {
      const id = beaconQueue.shift()!;
      const node = nodes.find((n) => n.id === id);
      if (node?.x != null && curveTo(node)) {
        activeBeacon = id;
        target = node;
        mode = "beaconTravel";
        return;
      }
    }
  };

  // Keep the floating task label in sync with whatever she's doing right now.
  // Called at a single exit point (finally) so it tracks the ship in EVERY mode —
  // including docking/idle, which return early from the main update body.
  const syncLabel = (dt: number) => {
    let taskText = "";
    if (mode === "removeTravel" || mode === "removeCarry") {
      taskText = "Casting a memory into the Sun";
    } else if (mode === "placePickup" || mode === "placeCarry") {
      taskText = "Ferrying a new memory into place";
    } else if (mode === "beaconTravel") {
      taskText = "Deploying an Aura beacon";
    } else if (mode === "docking" || mode === "dockTravel") {
      taskText = "Recharging at the station";
    } else if (mode === "linkToSource" || mode === "linkToTarget") {
      taskText = "Forging a new connection";
    } else if (currentJob) {
      taskText =
        currentJob.description ||
        (currentJob.type === "patrol" ? "Patrolling the galaxy" : `Running ${currentJob.type}`);
    }
    if (taskText !== lastTaskText) {
      lastTaskText = taskText;
      if (taskText) taskLabel.draw(taskText);
    }
    taskLabel.sprite.position.set(group.position.x, group.position.y + 18, group.position.z);
    taskLabel.tick(dt);
    taskLabel.sprite.visible = taskEnabled && group.visible && taskText !== "";
  };

  // Done tasks cache
  const completedTasks: { id: string; type: string; label: string; status: "done"; time: number }[] = [];
  const pushCompleted = (type: string, label: string, id: string) => {
    completedTasks.push({ id, type, label, status: "done", time: Date.now() });
    if (completedTasks.length > 8) completedTasks.shift();
  };

  const update: SoumayaHandle["update"] = (dt, nodes, _links, onArrive, stationPos, onLinkConnect, orbit) => {
    if (onLinkConnect) onLinkConnectCb = onLinkConnect;
    if (orbit) orbitApi = orbit;
    try {
      if (stationPos) {
        stationLoc.copy(stationPos);
        haveStation = true;
      }

      // Priority Interruption Check:
      // If there are new placements or removals waiting, and she is currently doing a routine
      // maintenance job (travel/orbit) or recharging when she has fuel, interrupt her immediately
      // to handle the new memories.
      const hasPriority = placeQueue.length > 0 || removalQueue.length > 0;
      if (hasPriority) {
        if (currentJob && (mode === "travel" || mode === "orbit")) {
          currentJob = null;
          curve = null;
          mode = "idle";
        } else if ((mode === "docking" || mode === "dockTravel") && jobsSinceDock < DOCK_EVERY) {
          curve = null;
          mode = "idle";
        }
      }

      if (mode === "idle") {
        // Deletions are user-initiated → handle first; then place new memories, then
        // dispatch beacons, forge connections, and finally routine maintenance.
        if (removalQueue.length > 0) {
          startRemoval();
          return;
        }
        if (placeQueue.length > 0 && orbitApi) {
          startPlacement(nodes);
          return;
        }
        if (beaconQueue.length > 0) {
          startBeaconDispatch(nodes);
          return;
        }
        if (linkQueue.length > 0) {
          startLink(nodes);
          return;
        }
        acquireJob(nodes);
        return;
      }

      // DOCKING: park by the station, pulse recharge beams, then resume patrol.
      if (mode === "docking") {
        dockTime -= dt;
        // Hover just off the station, gently bobbing and facing it.
        orbitAngle += dt * 0.4;
        const pos = stationLoc
          .clone()
          .add(new THREE.Vector3(Math.cos(orbitAngle) * 320, Math.sin(orbitAngle * 0.6) * 70, Math.sin(orbitAngle) * 320));
        group.position.copy(pos);
        group.lookAt(stationLoc);
        jobTimer -= dt;
        if (jobTimer <= 0) {
          onArrive(stationLoc.x, stationLoc.y, stationLoc.z, "synthesis"); // recharge beam
          jobTimer = 0.5;
        }
        const s = 3 + Math.sin(performance.now() * 0.004) * 2;
        glow.scale.set(s, s, 1);
        if (dockTime <= 0) {
          jobsSinceDock = 0;
          mode = "idle";
        }
        return;
      }

      let currentVel = 0;

      // ORBIT: circle the body at a standoff radius and do the "job" (periodic
      // maintenance sparks), then head to the next memory.
      if (mode === "orbit") {
        if (!target || target.x == null) {
          mode = "idle";
          return;
        }
        orbitTime -= dt;
        const speedMultiplier = 5 / (orbitRadius + 8);
        orbitAngle += dt * speedMultiplier;
        const tp = vecOf(target);
        const pos = tp
          .clone()
          .addScaledVector(ou, Math.cos(orbitAngle) * orbitRadius)
          .addScaledVector(ov, Math.sin(orbitAngle) * orbitRadius);
        const tangent = ou
          .clone()
          .multiplyScalar(-Math.sin(orbitAngle))
          .addScaledVector(ov, Math.cos(orbitAngle));
        
        currentVel = speedMultiplier * orbitRadius; // tangential velocity
        
        group.position.copy(pos);
        group.lookAt(pos.clone().add(tangent));
        jobTimer -= dt;
        if (jobTimer <= 0) {
          onArrive(tp.x, tp.y, tp.z, currentJob?.type || "patrol"); // tending the memory
          jobTimer = 1.3;
        }

        if (orbitTime <= 0) {
          if (currentJob) {
            completeMaintenanceJob(currentJob.type, currentJob.targets).catch(() => {});
            pushCompleted("maintenance", currentJob.description || "Completed patrol", `patrol-${currentJob.targets[0]}`);
            currentJob = null;
          }
          jobsSinceDock++;
          if (jobsSinceDock >= DOCK_EVERY && haveStation) {
            planDock(); // time to refuel at the station
          } else {
            mode = "idle";
          }
        }
      } else if (mode === "placeCarry") {
        // Carrying a new memory: nudge it (and ride alongside it) toward its live
        // orbit slot, then drop it in and hand control back to the orbit system.
        const slot = activePlace != null ? orbitApi?.slotOf(activePlace) ?? null : null;
        if (!target || activePlace == null || !slot) {
          if (activePlace != null) orbitApi?.release(activePlace);
          activePlace = null;
          mode = "idle";
        } else {
          const np = vecOf(target);
          const toSlot = slot.clone().sub(np);
          const dist = toSlot.length();
          const step = Math.min(dist, (40 + dist) * dt * 0.9); // ease in: faster when far
          if (dist < 5) {
            // Dropped home: snap to slot, release to normal orbiting, bloom.
            target.x = slot.x; target.y = slot.y; target.z = slot.z;
            target.fx = slot.x; target.fy = slot.y; target.fz = slot.z;
            orbitApi?.release(activePlace);
            onArrive(slot.x, slot.y, slot.z, "synthesis", activePlace);
            pushCompleted("placement", `Ferried new memory: ${target?.label ?? `#${activePlace}`}`, `place-${activePlace}`);
            activePlace = null;
            target = null;
            mode = "idle";
          } else {
            const nv = np.addScaledVector(toSlot.normalize(), step);
            target.x = nv.x; target.y = nv.y; target.z = nv.z;
            target.fx = nv.x; target.fy = nv.y; target.fz = nv.z; // tow the body (held → orbit won't fight)
            const shipPos = nv.clone().add(new THREE.Vector3(0, bodyRadius(target) + 6, 0));
            group.position.copy(shipPos);
            group.lookAt(slot);
            currentVel = step / Math.max(dt, 0.001);
          }
        }
      } else if (mode === "removeCarry") {
        // Dragging a discarded memory into the Sun (origin). The cargo flies inward;
        // the ship trails it but is clamped to a safe standoff so she never enters
        // the Sun herself. On contact with the surface: a fiery consumption flare.
        const cargoPos = cargo.position.clone();
        const dist = cargoPos.length(); // distance from the Sun's center (origin)
        if (!activeRemoval || dist <= SUN_RADIUS_MAX || cargoPos.lengthSq() < 1e-3) {
          onArrive(cargoPos.x, cargoPos.y, cargoPos.z, "consume"); // flare + burst (Graph3D)
          cargo.visible = false;
          if (activeRemoval) {
            pushCompleted("removal", "Discarded memory into the Sun", activeRemoval.id || "removal-active");
          }
          activeRemoval = null;
          mode = "idle";
          currentVel = 0;
        } else {
          const dirIn = cargoPos.clone().multiplyScalar(-1).normalize(); // toward the Sun
          const step = Math.min(dist - SUN_RADIUS_MAX, (70 + dist * 0.4) * dt); // ease, faster when far
          const nc = cargoPos.addScaledVector(dirIn, step);
          cargo.position.copy(nc);
          // Ship trails just behind the cargo, never closer than a safe standoff.
          const standoff = Math.max(nc.length() + 50, SUN_RADIUS_MAX + 120);
          group.position.copy(nc.clone().normalize().multiplyScalar(standoff));
          group.lookAt(nc);
          currentVel = step / Math.max(dt, 0.001);
        }
      } else {
        // TRAVEL (to a memory) / DOCKTRAVEL (to the station): cruise the Bézier.
        if (!curve) {
          mode = "idle";
          return;
        }

        const prevT = t;
        t += speed * dt;

        if (t >= 1 && mode === "dockTravel") {
          // Reached the station — begin the recharge dock.
          mode = "docking";
          dockTime = 6;
          jobTimer = 0.2;
          orbitAngle = Math.random() * Math.PI * 2;
          curve = null;
          currentVel = 0;
        } else if (t >= 1 && mode === "linkToSource") {
          // Reached the new memory — grab the thread, then carry it to the other end.
          const p = vecOf(target);
          onArrive(p.x, p.y, p.z, "synthesis", target?.id);
          curve = null;
          currentVel = 0;
          if (linkTgtNode && curveTo(linkTgtNode)) {
            target = linkTgtNode;
            mode = "linkToTarget";
          } else {
            activeLink = null;
            mode = "idle";
          }
        } else if (t >= 1 && mode === "linkToTarget") {
          // Reached the far end — fasten the connection and let it fire.
          const p = vecOf(target);
          onArrive(p.x, p.y, p.z, "synthesis", target?.id);
          if (activeLink && onLinkConnectCb) onLinkConnectCb(activeLink.key);
          if (activeLink) {
            pushCompleted("link", "Forged connection", activeLink.id || `link-${activeLink.key}`);
          }
          activeLink = null;
          linkTgtNode = null;
          curve = null;
          currentVel = 0;
          mode = "idle";
        } else if (t >= 1 && mode === "placePickup") {
          // Reached the waiting new memory at the dock — pick it up and carry it home.
          curve = null;
          currentVel = 0;
          if (target && activePlace != null) {
            mode = "placeCarry";
          } else {
            if (activePlace != null) orbitApi?.release(activePlace);
            activePlace = null;
            mode = "idle";
          }
        } else if (t >= 1 && mode === "beaconTravel") {
          // Reached the target memory — deploy the beacon and return to idle.
          const p = vecOf(target);
          onArrive(p.x, p.y, p.z, "beacon_dispatch", target?.id);
          if (activeBeacon) {
            pushCompleted("beacon", `Deployed Aura beacon at ${target?.label ?? `#${activeBeacon}`}`, `beacon-${activeBeacon}`);
          }
          activeBeacon = null;
          curve = null;
          currentVel = 0;
          mode = "idle";
        } else if (t >= 1 && mode === "removeTravel") {
          // Reached the discarded memory — grab it (show the cargo) and haul it sunward.
          curve = null;
          currentVel = 0;
          if (activeRemoval) {
            (cargo.material as THREE.MeshStandardMaterial).color.set(activeRemoval.color ?? "#cfe0ff");
            cargo.scale.setScalar(activeRemoval.size ?? 4);
            cargo.position.set(activeRemoval.x, activeRemoval.y, activeRemoval.z);
            cargo.visible = true;
            mode = "removeCarry";
          } else {
            mode = "idle";
          }
        } else if (t >= 1) {
          // Arrived near the body — enter orbit around it (don't ram the center).
          mode = "orbit";
          orbitRadius = bodyRadius(target) + 12;
          orbitTime = 4 + Math.random() * 4;
          jobTimer = 0.2;
          orbitAngle = Math.random() * Math.PI * 2;
          const normal = new THREE.Vector3(Math.random() - 0.5, Math.random() + 0.3, Math.random() - 0.5).normalize();
          const ref = Math.abs(normal.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
          ou = new THREE.Vector3().crossVectors(normal, ref).normalize();
          ov = new THREE.Vector3().crossVectors(normal, ou).normalize();
          curve = null;
          currentVel = 0;
        } else {
          // Ease accel/decel along the hop: sample the curve at a smoothstepped
          // parameter so she pulls away slowly and settles in slowly.
          const e = smooth(t);
          const ePrev = smooth(prevT);
          const p = curve.getPointAt(e);
          const pPrev = curve.getPointAt(ePrev);
          currentVel = p.distanceTo(pPrev) / dt;

          group.position.copy(p);
          const tangent = curve.getTangentAt(Math.min(0.999, e));
          group.lookAt(p.clone().add(tangent));

          // Bank into turns: how much the heading is rotating (cross of the
          // previous vs current tangent, signed about the ship's local up) drives
          // a roll. Smooth toward it so she leans, holds, and levels out.
          const tanPrev = curve.getTangentAt(Math.min(0.999, Math.max(0, ePrev)));
          const turn = new THREE.Vector3().crossVectors(tanPrev, tangent);
          const up = new THREE.Vector3(0, 1, 0).applyQuaternion(group.quaternion);
          const signed = turn.dot(up);
          const targetBank = Math.max(-0.6, Math.min(0.6, -signed * 14));
          bank += (targetBank - bank) * Math.min(1, dt * 3);
          group.rotateZ(bank);
        }
      }

      // Dynamic Propulsion Beam: scale based on velocity
      if (group.visible) {
        // Normalize velocity for scaling (Travel speed is roughly 20-50 units/sec, Orbit is ~5-10)
        const vRatio = Math.min(1, currentVel / 40);
        const s = 2 + 10 * vRatio; // scale from 2 (idle/orbit) to 12 (max burn)
        glow.scale.set(s, s, 1);
        glow.position.z = -2.5 - (s * 0.1); // push back slightly so it doesn't clip hull
        (glow.material as THREE.SpriteMaterial).opacity = 0.3 + 0.7 * vRatio;
      }
    } catch {
      /* skip this frame */
    } finally {
      // Always track the label to the ship, in every mode (docking/idle return early).
      try {
        syncLabel(dt);
      } catch {
        /* label is non-critical — never let it break the frame */
      }
    }
  };

  const enqueueLinks = (tasks: LinkTask[]) => {
    for (const task of tasks) {
      if (!linkQueue.some((q) => q.key === task.key) && activeLink?.key !== task.key) {
        linkQueue.push(task);
      }
    }
  };

  const enqueuePlacements = (ids: number[]) => {
    for (const id of ids) {
      if (id !== activePlace && !placeQueue.includes(id)) placeQueue.push(id);
    }
  };

  const enqueueBeacons = (ids: number[]) => {
    for (const id of ids) {
      if (id !== activeBeacon && !beaconQueue.includes(id)) beaconQueue.push(id);
    }
  };

  const enqueueRemovals = (tasks: RemovalTask[]) => {
    for (const task of tasks) {
      if (!task.id) {
        task.id = `removal-${task.x}-${task.y}-${Date.now()}-${Math.random()}`;
      }
      removalQueue.push(task);
    }
  };

  const setTaskVisible = (v: boolean) => {
    taskEnabled = v;
    if (!v) taskLabel.sprite.visible = false;
  };

  const getTasks = (nodes: any[]) => {
    // Filter out completed tasks older than 12 seconds
    const now = Date.now();
    const activeCompleted = completedTasks.filter((t) => now - t.time < 12000);
    if (activeCompleted.length !== completedTasks.length) {
      completedTasks.length = 0;
      completedTasks.push(...activeCompleted);
    }

    const tasks: any[] = [];

    // 1. Add "doing" tasks
    const currentRemoval = activeRemoval;
    if (currentRemoval) {
      tasks.push({
        id: currentRemoval.id || "removal-active",
        type: "removal",
        label: "Casting a memory into the Sun",
        status: "doing",
      });
    }
    const currentPlace = activePlace;
    if (currentPlace != null) {
      const node = nodes.find((n) => n.id === currentPlace);
      tasks.push({
        id: `place-${currentPlace}`,
        type: "placement",
        label: `Ferrying new memory: ${node?.label ?? `#${currentPlace}`}`,
        status: "doing",
      });
    }
    const currentLink = activeLink;
    if (currentLink) {
      const s = nodes.find((n) => n.id === currentLink.source);
      const t = nodes.find((n) => n.id === currentLink.target);
      tasks.push({
        id: currentLink.id || `link-${currentLink.key}`,
        type: "link",
        label: `Forging connection: ${s?.label ?? `#${currentLink.source}`} ↔ ${t?.label ?? `#${currentLink.target}`}`,
        status: "doing",
      });
    }
    if (activeBeacon != null) {
      const node = nodes.find((n) => n.id === activeBeacon);
      tasks.push({
        id: `beacon-${activeBeacon}`,
        type: "beacon",
        label: `Deploying Aura beacon: ${node?.label ?? `#${activeBeacon}`}`,
        status: "doing",
      });
    }
    if (currentJob && (mode === "travel" || mode === "orbit" || mode === "docking" || mode === "dockTravel")) {
      const label = mode === "docking" || mode === "dockTravel"
        ? "Recharging at the space station"
        : currentJob.description || "Patrolling the galaxy";
      tasks.push({
        id: `patrol-${currentJob.targets[0] || "active"}`,
        type: "maintenance",
        label,
        status: "doing",
      });
    }

    // 2. Add "planned" tasks
    for (const r of removalQueue) {
      tasks.push({
        id: r.id || `removal-planned-${Math.random()}`,
        type: "removal",
        label: "Casting a memory into the Sun",
        status: "planned",
      });
    }
    for (const id of placeQueue) {
      const node = nodes.find((n) => n.id === id);
      tasks.push({
        id: `place-${id}`,
        type: "placement",
        label: `Ferrying new memory: ${node?.label ?? `#${id}`}`,
        status: "planned",
      });
    }
    for (const l of linkQueue) {
      const s = nodes.find((n) => n.id === l.source);
      const t = nodes.find((n) => n.id === l.target);
      tasks.push({
        id: l.id || `link-${l.key}`,
        type: "link",
        label: `Forging connection: ${s?.label ?? `#${l.source}`} ↔ ${t?.label ?? `#${l.target}`}`,
        status: "planned",
      });
    }
    for (const id of beaconQueue) {
      const node = nodes.find((n) => n.id === id);
      tasks.push({
        id: `beacon-${id}`,
        type: "beacon",
        label: `Deploying Aura beacon: ${node?.label ?? `#${id}`}`,
        status: "planned",
      });
    }

    // 3. Add "done" tasks
    for (const t of completedTasks) {
      tasks.push({
        id: t.id,
        type: t.type,
        label: t.label,
        status: "done",
      });
    }

    return tasks;
  };

  const reorderTasks = (newOrder: { id: string; type: string }[]) => {
    const newPlaceQueue: number[] = [];
    const newRemovalQueue: RemovalTask[] = [];
    const newLinkQueue: LinkTask[] = [];
    const newBeaconQueue: number[] = [];

    for (const item of newOrder) {
      if (item.type === "placement") {
        const id = parseInt(item.id.replace("place-", ""));
        if (placeQueue.includes(id)) newPlaceQueue.push(id);
      } else if (item.type === "removal") {
        const found = removalQueue.find((r) => r.id === item.id);
        if (found) newRemovalQueue.push(found);
      } else if (item.type === "link") {
        const found = linkQueue.find((l) => l.id === item.id);
        if (found) newLinkQueue.push(found);
      } else if (item.type === "beacon") {
        const id = parseInt(item.id.replace("beacon-", ""));
        if (beaconQueue.includes(id)) newBeaconQueue.push(id);
      }
    }

    // Append any tasks that were not in the newOrder list (just in case)
    for (const id of placeQueue) {
      if (!newPlaceQueue.includes(id)) newPlaceQueue.push(id);
    }
    for (const r of removalQueue) {
      if (!newRemovalQueue.some((x) => x.id === r.id)) newRemovalQueue.push(r);
    }
    for (const l of linkQueue) {
      if (!newLinkQueue.some((x) => x.id === l.id)) newLinkQueue.push(l);
    }
    for (const id of beaconQueue) {
      if (!newBeaconQueue.includes(id)) newBeaconQueue.push(id);
    }

    // Overwrite the queues!
    placeQueue.length = 0;
    placeQueue.push(...newPlaceQueue);
    
    removalQueue.length = 0;
    removalQueue.push(...newRemovalQueue);
    
    linkQueue.length = 0;
    linkQueue.push(...newLinkQueue);
    
    beaconQueue.length = 0;
    beaconQueue.push(...newBeaconQueue);
  };

  return {
    object: group,
    update,
    enqueueLinks,
    enqueuePlacements,
    enqueueBeacons,
    enqueueRemovals,
    cargo,
    taskLabel: taskLabel.sprite,
    setTaskVisible,
    getTasks,
    reorderTasks,
  };
}
