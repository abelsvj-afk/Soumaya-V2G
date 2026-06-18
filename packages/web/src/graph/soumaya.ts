/* eslint-disable @typescript-eslint/no-explicit-any */
import * as THREE from "three";
import { gltfLoader } from "./gltf.js";
import { getNextMaintenanceJob, completeMaintenanceJob, type MaintenanceJob } from "../api/client.js";

export interface SoumayaHandle {
  object: THREE.Object3D;
  /** Advance the agent; reads live node/link positions, sparks on arrival. */
  update: (
    dt: number,
    nodes: any[],
    links: any[],
    onArrive: (x: number, y: number, z: number, type: string) => void,
    stationPos?: THREE.Vector3 | null,
  ) => void;
}

const vecOf = (n: any): THREE.Vector3 => new THREE.Vector3(n.x ?? 0, n.y ?? 0, n.z ?? 0);

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

  let mode: "travel" | "orbit" | "idle" | "dockTravel" | "docking" = "idle";
  let curve: THREE.QuadraticBezierCurve3 | null = null;
  let t = 0;
  let speed = 0.25;
  let target: any = null;
  let currentJob: MaintenanceJob | null = null;
  let isFetching = false;

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

  const update: SoumayaHandle["update"] = (dt, nodes, _links, onArrive, stationPos) => {
    try {
      if (stationPos) {
        stationLoc.copy(stationPos);
        haveStation = true;
      }

      if (mode === "idle") {
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
          const p = curve.getPointAt(t);
          const pPrev = curve.getPointAt(prevT);
          currentVel = p.distanceTo(pPrev) / dt;
          
          group.position.copy(p);
          const tangent = curve.getTangentAt(Math.min(0.999, t));
          group.lookAt(p.clone().add(tangent));
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
    }
  };

  return { object: group, update };
}
