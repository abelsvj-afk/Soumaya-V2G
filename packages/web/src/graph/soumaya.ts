/* eslint-disable @typescript-eslint/no-explicit-any */
import * as THREE from "three";
import { gltfLoader } from "./gltf.js";
import { getNextMaintenanceJob, completeMaintenanceJob, type MaintenanceJob } from "../api/client.js";

/** A connection Soumaya should personally fly out and forge (source → target). */
export interface LinkTask {
  source: number;
  target: number;
  key: string;
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
  ) => void;
  /** Queue new connections for her to draw herself (takes priority over patrol). */
  enqueueLinks: (tasks: LinkTask[]) => void;
  /** Floating "current task" billboard — added to the scene by Graph3D so the
   *  ship's banking never tilts it. Toggle its visibility via setTaskVisible. */
  taskLabel: THREE.Object3D;
  /** Turn the floating task label on/off (user preference). */
  setTaskVisible: (v: boolean) => void;
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
    const w = Math.max(64, Math.ceil(ctx.measureText(text).width) + pad * 2);
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
    if (widthUnits > MAXW) {
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

  // Floating "what she's doing" label (billboard added to scene by Graph3D).
  const taskLabel = makeTaskLabel();
  let taskEnabled = false;
  let lastTaskText = "";
  let bank = 0; // current banked roll (smoothed toward target each frame)

  let mode: "travel" | "orbit" | "idle" | "dockTravel" | "docking" | "linkToSource" | "linkToTarget" = "idle";
  let curve: THREE.QuadraticBezierCurve3 | null = null;
  let t = 0;
  let speed = 0.25;
  let target: any = null;
  let currentJob: MaintenanceJob | null = null;
  let isFetching = false;

  // Connections she's been asked to forge herself (fly to A, grab the thread, fly
  // to B, connect). Drained before patrol so new memories get linked on-screen.
  const linkQueue: LinkTask[] = [];
  let activeLink: LinkTask | null = null;
  let linkTgtNode: any = null;
  let onLinkConnectCb: ((key: string) => void) | null = null;

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

  // Keep the floating task label in sync with whatever she's doing right now.
  // Called at a single exit point (finally) so it tracks the ship in EVERY mode —
  // including docking/idle, which return early from the main update body.
  const syncLabel = (dt: number) => {
    let taskText = "";
    if (mode === "docking" || mode === "dockTravel") {
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

  const update: SoumayaHandle["update"] = (dt, nodes, _links, onArrive, stationPos, onLinkConnect) => {
    if (onLinkConnect) onLinkConnectCb = onLinkConnect;
    try {
      if (stationPos) {
        stationLoc.copy(stationPos);
        haveStation = true;
      }

      if (mode === "idle") {
        // Forge any new connections she's been asked to draw before patrolling.
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
            currentJob = null;
          }
          jobsSinceDock++;
          if (jobsSinceDock >= DOCK_EVERY && haveStation) {
            planDock(); // time to refuel at the station
          } else {
            mode = "idle";
          }
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
          activeLink = null;
          linkTgtNode = null;
          curve = null;
          currentVel = 0;
          mode = "idle";
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

  const setTaskVisible = (v: boolean) => {
    taskEnabled = v;
    if (!v) taskLabel.sprite.visible = false;
  };

  return { object: group, update, enqueueLinks, taskLabel: taskLabel.sprite, setTaskVisible };
}
