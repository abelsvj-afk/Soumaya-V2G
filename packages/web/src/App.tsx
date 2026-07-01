import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { GraphData, GraphNode, Fuel, Streak, AwayDigest } from "@brain/shared";
import { CELESTIAL_CLASSES, CELESTIAL_LABEL } from "@brain/shared";

/** Pop-up offset for an item in the focus cluster (stacks upward when open). */
function focusItemStyle(index: number, open: boolean): CSSProperties {
  return open
    ? { transform: `translateY(${-(index + 1) * 54}px)`, opacity: 1, pointerEvents: "auto" }
    : { transform: "translateY(0) scale(0.4)", opacity: 0, pointerEvents: "none" };
}

function getFigurineIcon(type: string): string {
  switch (type) {
    case "station": return "🌐";
    case "satellite": return "🛰️";
    case "star_center": return "🌟";
    case "dyson_sphere": return "🪐";
    case "quantum_core": return "🌌";
    case "hyper_array": return "📡";
    case "shield_spire": return "🛡️";
    case "blackhole": return "🕳️";
    default: return "🗿";
  }
}

function getFigurineLabel(type: string): string {
  switch (type) {
    case "station": return "Waystation Figurine";
    case "satellite": return "Aura Beacon Figurine";
    case "star_center": return "Solar Monument";
    case "dyson_sphere": return "Dyson Megastructure";
    case "quantum_core": return "Quantum Singularity Core";
    case "hyper_array": return "Synapse Hyper-Array";
    case "shield_spire": return "Aegis Shield Spire";
    case "blackhole": return "The Singularity";
    default: return type;
  }
}
import { Graph3D, type Graph3DHandle } from "./graph/Graph3D.js";
import { makeDemoGalaxy } from "./graph/demoGalaxy.js";
import { makeAmbientAudio, type AmbientAudio } from "./graph/audio.js";
import { IngestPanel } from "./components/IngestPanel.js";
import { Observatory } from "./components/Observatory.js";
import { ChatDock } from "./components/ChatDock.js";
import { SettingsPanel } from "./components/SettingsPanel.js";
import { SearchBox } from "./components/SearchBox.js";
import { RightDock, type DockTab } from "./components/RightDock.js";
import { HelpPanel } from "./components/HelpPanel.js";
import { WelcomeBackCard } from "./components/WelcomeBackCard.js";
import { LoginScreen } from "./components/LoginScreen.js";
import { Toasts, pushToast, cleanupNotifications, setToastsPaused } from "./components/Toasts.js";
import { ACHIEVEMENTS, unlockedIds, loadUnlocked, achvKey, MEMORY_MILESTONES } from "./components/achievements.js";
import { pilotRank } from "./components/rank.js";
import { ObjectLoreCard } from "./components/ObjectLoreCard.js";
import { NotificationsBar } from "./components/NotificationsBar.js";
import {
  currentSpace,
  getGraph,
  getHealth,
  getFuel,
  getStreak,
  getDigest,
  getAwayDigest,
  markAwaySeen,
  flushIngestQueue,
  logoutSpace,
  onAiActivity,
  tendNode,
  type Health,
} from "./api/client.js";

type Panel = "search" | "ingest" | "dock" | null;

export default function App() {
  const [space, setSpace] = useState<{ id: string; name: string } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  // Fuel on the main HUD (was buried in the Soumaya tab) — polled while signed in.
  const [fuel, setFuel] = useState<Fuel | null>(null);
  const [fuelPops, setFuelPops] = useState<{ id: number; text: string }[]>([]);
  const prevFuelRef = useRef<number | null>(null);
  // Daily-tending streak (flame on the HUD + Awards tab) — polled while signed in.
  const [streak, setStreak] = useState<Streak | null>(null);
  // Floating chat with Soumaya (opened by the 💬 FAB).
  const [showChat, setShowChat] = useState(false);
  const [chatPulse, setChatPulse] = useState(false); // she's hailing — pulse the FAB
  const hailedRef = useRef(false);
  const [showSettings, setShowSettings] = useState(false);
  const [awayDigest, setAwayDigest] = useState<AwayDigest | null>(null);
  // The Observatory home overlay — fades in once, after the cinematic fly-in settles.
  const [showObs, setShowObs] = useState(false);
  const obsShownRef = useRef(false);
  // True once we're past the Observatory gate (it was shown+closed, or won't show).
  // Until then, toasts are buffered so a celebration never hides behind the cards.
  const [obsSettled, setObsSettled] = useState(false);
  const [tab, setTab] = useState<DockTab>("details");

  // Hangar system equipped states
  const [equippedShip, setEquippedShip] = useState<string>("default");
  const [equippedTrail, setEquippedTrail] = useState<string>("blue");
  const [equippedFig1, setEquippedFig1] = useState<string>("none");
  const [equippedFig2, setEquippedFig2] = useState<string>("none");
  const [showFocusFig1, setShowFocusFig1] = useState<boolean>(true);
  const [showFocusFig2, setShowFocusFig2] = useState<boolean>(true);

  // Simulated stats for testing achievements progression in demo mode
  const [simulatedMemoriesCount, setSimulatedMemoriesCount] = useState<number>(0);
  const [simulatedLinksCount, setSimulatedLinksCount] = useState<number>(0);
  const [demoBypass, setDemoBypass] = useState<boolean>(true);

  // Load equipped customizations and demo stats when the space changes
  useEffect(() => {
    if (!space) return;
    localStorage.setItem("current_space_id", space.id);
    const shipKey = `brain.hangar.ship.${space.id}`;
    const trailKey = `brain.hangar.trail.${space.id}`;
    const fig1Key = `brain.hangar.fig1.${space.id}`;
    const fig2Key = `brain.hangar.fig2.${space.id}`;
    const focusFig1Key = `brain.hangar.focusFig1.${space.id}`;
    const focusFig2Key = `brain.hangar.focusFig2.${space.id}`;
    const simMemKey = `brain.demo.sim_memories.${space.id}`;
    const simLinkKey = `brain.demo.sim_links.${space.id}`;
    const bypassKey = `brain.demo.bypass.${space.id}`;

    setEquippedShip(localStorage.getItem(shipKey) || "default");
    setEquippedTrail(localStorage.getItem(trailKey) || "blue");
    setEquippedFig1(localStorage.getItem(fig1Key) || "none");
    setEquippedFig2(localStorage.getItem(fig2Key) || "none");
    setShowFocusFig1(localStorage.getItem(focusFig1Key) !== "false");
    setShowFocusFig2(localStorage.getItem(focusFig2Key) !== "false");
    setSimulatedMemoriesCount(parseInt(localStorage.getItem(simMemKey) || "0", 10));
    setSimulatedLinksCount(parseInt(localStorage.getItem(simLinkKey) || "0", 10));
    setDemoBypass(localStorage.getItem(bypassKey) !== "0");

    // Clean up expired notifications on space load
    cleanupNotifications(space.id);
  }, [space]);

  const [demo, setDemo] = useState(false);
  // Poll fuel for the main-HUD gauge while signed in (skips the demo galaxy).
  useEffect(() => {
    if (!space || demo) return;
    let alive = true;
    const load = () => {
      getFuel().then((f) => alive && setFuel(f));
      getStreak().then((s) => alive && setStreak(s));
    };
    load();
    const iv = window.setInterval(load, 30000);
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, [space, demo]);

  // Fuel tracking for visual pops
  useEffect(() => {
    if (fuel === null) {
      prevFuelRef.current = null;
      return;
    }
    if (prevFuelRef.current !== null) {
      const diff = fuel.fuel - prevFuelRef.current;
      if (diff > 0.05) {
        const text = `+${Math.round(diff * 10) / 10}`;
        const id = Date.now() + Math.random();
        setFuelPops((prev) => [...prev, { id, text }]);
        window.setTimeout(() => {
          setFuelPops((prev) => prev.filter((p) => p.id !== id));
        }, 1600);
      }
    }
    prevFuelRef.current = fuel.fuel;
  }, [fuel?.fuel]);

  const [panel, setPanel] = useState<Panel>(null);
  const [loaded, setLoaded] = useState(false);
  const [history, setHistory] = useState<number[]>([]);
  const [aiBusy, setAiBusy] = useState(0);
  const [music, setMusic] = useState(false);
  const [followShip, setFollowShip] = useState(false);
  const [followStation, setFollowStation] = useState(false);
  const [followSatellite, setFollowSatellite] = useState(false);
  const [satelliteCount, setSatelliteCount] = useState(0);
  const [visitorCount, setVisitorCount] = useState(0);
  const [followVisitor, setFollowVisitor] = useState(false);
  const [followFig1, setFollowFig1] = useState(false);
  const [followFig2, setFollowFig2] = useState(false);
  // Lore card dismissed independently of the camera follow (× closes the card but
  // keeps focus). Reset to false whenever a new focus target is chosen.
  const [loreDismissed, setLoreDismissed] = useState(false);
  // Show Soumaya's current task on a floating label above her ship (persisted).
  const [showShipTask, setShowShipTask] = useState(() => localStorage.getItem("ship.task") !== "0");
  useEffect(() => {
    localStorage.setItem("ship.task", showShipTask ? "1" : "0");
  }, [showShipTask]);
  const [shipViewMode, setShipViewMode] = useState<"orbit" | "cockpit">("orbit");
  const [tasks, setTasks] = useState<any[]>([]);
  const handleReorderTasks = useCallback((newOrder: any[]) => {
    graphRef.current?.reorderTasks(newOrder);
    setTasks(newOrder);
  }, []);
  // Transient glow on the focus button when a NEW beacon launches (not constant).
  const [beaconPulse, setBeaconPulse] = useState(false);
  const prevSatRef = useRef(0);
  const [focusMenuOpen, setFocusMenuOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [clustered, setClustered] = useState(false);
  const audioRef = useRef<AmbientAudio | null>(null);
  const graphRef = useRef<Graph3DHandle>(null);

  const [installPrompt, setInstallPrompt] = useState<any>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const triggerInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      setInstallPrompt(null);
    }
  };

  useEffect(() => onAiActivity(setAiBusy), []);

  // Create the ambient audio on mount so the loop preloads/buffers before the
  // first 🔈 toggle (otherwise it lags on slow/mobile connections).
  useEffect(() => {
    if (!audioRef.current) audioRef.current = makeAmbientAudio();
  }, []);

  // "While you were away" — on return, fetch what changed since the last visit. Show
  // the welcome-back card only after a real absence (≥1h) with something to say;
  // otherwise silently advance the window so a quick refresh never nags.
  useEffect(() => {
    if (!space || demo) return;
    let alive = true;
    getAwayDigest()
      .then((d) => {
        if (!alive) return;
        if (d && !d.isEmpty && d.awayMs >= 3_600_000) setAwayDigest(d);
        else void markAwaySeen();
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [space, demo]);

  // Awareness: surface Soumaya's consequential decisions (research, merge, chart a
  // sector, write the log) as a toast + inbox entry, so you always know what she chose
  // to do — not just see it after the fact in her activity log.
  useEffect(() => {
    const onDecision = (e: Event) => {
      const d = (e as CustomEvent).detail as { type?: string; text?: string } | undefined;
      if (!d?.text) return;
      const icon =
        d.type === "research" ? "🔬" : d.type === "merging" ? "🧬" : d.type === "daily_log" ? "📖" : "🌌";
      pushToast(`Soumaya · ${d.text}`, icon, 6500);
    };
    window.addEventListener("brain-agent-decision", onDecision);
    return () => window.removeEventListener("brain-agent-decision", onDecision);
  }, []);

  const toggleMusic = useCallback(() => {
    if (!audioRef.current) audioRef.current = makeAmbientAudio();
    setMusic(audioRef.current.toggle());
  }, []);

  // A fake "fuller galaxy" preview — generated once, never persisted/weighted.
  const demoData = useMemo(() => makeDemoGalaxy(), []);
  const view = demo ? demoData : data;

  // Soumaya's flight speed grows as you use the brain: more memories + a live
  // streak make her a faster, more seasoned pilot (1.0 → ~1.9×). Distance-aware
  // cruising + her per-task speeds are handled in graph/soumaya.ts.
  const pilotSpeed = useMemo(() => {
    const mem = (view.nodes as GraphNode[]).filter((n) => n.kind !== "action" && n.kind !== "moc").length;
    const lvl = 1 + Math.min(0.7, mem / 200) + Math.min(0.2, (streak?.current ?? 0) / 20);
    return Math.round(lvl * 100) / 100;
  }, [view.nodes, streak]);

  const refresh = useCallback(async (newIds?: number[], fuelEarned?: number, linkCount?: number) => {
    if (demo) {
      setLoaded(true);
      return;
    }
    try {
      const g = await getGraph();
      setData(g);
      getFuel().then((f) => f && setFuel(f)).catch(() => {});
      if (newIds && newIds.length > 0) {
        // Give the graph a moment to render the new nodes before rippling them.
        setTimeout(() => {
          for (const id of newIds) graphRef.current?.spawnBurst(id, "user");
          // A warm amber sparkle on the new memory celebrates the fuel it earned.
          if (fuelEarned && fuelEarned > 0)
            for (const id of newIds) graphRef.current?.spawnBurst(id, "fuel");
        }, 150);
        // Gamification: celebrate the fuel earned with a toast (Wave 1).
        if (fuelEarned && fuelEarned > 0)
          pushToast(`+${Math.round(fuelEarned * 10) / 10} fuel earned`, "⛽");
        // Soumaya reacts to new connections in her own voice (Wave 3).
        if (linkCount && linkCount > 0) {
          const msg =
            linkCount >= 3
              ? `Soumaya: oh, this one lights up — it ties into ${linkCount} of your memories.`
              : linkCount === 2
                ? "Soumaya: I felt two threads connect to this."
                : "Soumaya: there — a new thread linked up.";
          pushToast(msg, "🛰️", 7000);
        }
        // Then fly the camera to the new memory so you can SEE where it populated.
        setTimeout(() => {
          graphRef.current?.focusNode(newIds[0]!);
          setSelected(g.nodes.find((n) => n.id === newIds[0]) ?? null);
        }, 550);
      }
    } finally {
      setLoaded(true);
    }
    getHealth()
      .then(setHealth)
      .catch(() => {});
  }, [demo]);

  // If every beacon fades (its memory got tended) while we're watching one, the
  // beacon button vanishes — so release the follow + close its lore card too.
  useEffect(() => {
    if (followSatellite && satelliteCount === 0) {
      graphRef.current?.recenter();
      setFollowSatellite(false);
    }
  }, [satelliteCount, followSatellite]);

  // Pulse the focus button briefly only when a NEW beacon launches, then stop.
  useEffect(() => {
    if (satelliteCount > prevSatRef.current) {
      setBeaconPulse(true);
      const t = window.setTimeout(() => setBeaconPulse(false), 3600);
      prevSatRef.current = satelliteCount;
      return () => window.clearTimeout(t);
    }
    prevSatRef.current = satelliteCount;
  }, [satelliteCount]);

  // Release the visitor follow when the craft we're watching leaves.
  useEffect(() => {
    if (followVisitor && visitorCount === 0) {
      graphRef.current?.recenter();
      setFollowVisitor(false);
    }
  }, [visitorCount, followVisitor]);

  // Resolve the stored brain (if any) on first load.
  useEffect(() => {
    currentSpace()
      .then((sp) => {
        setSpace(sp);
        const params = new URLSearchParams(window.location.search);
        // Only allow demo mode if logged in as "soumaya" (case-insensitive)
        if (sp && sp.name.toLowerCase() === "soumaya" && params.get("demo") === "1") {
          setDemo(true);
        } else {
          setDemo(false);
        }
      })
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, []);

  // Load the galaxy once a brain is open.
  useEffect(() => {
    if (space) refresh();
  }, [space]);

  // Gamification (Wave 1): greet the pilot once per session when their galaxy
  // first loads — by name, with what changed while they were away.
  const greetedRef = useRef(false);
  useEffect(() => {
    if (greetedRef.current || demo || !space || !loaded) return;
    greetedRef.current = true;
    const memories = (data.nodes as GraphNode[]).filter((n) => n.kind !== "action");
    if (memories.length === 0) {
      pushToast(`Welcome, ${space.name}. Drop your first thought to begin.`, "🛰️", 10000);
      return;
    }
    const cooling = memories.filter((n) => (n.entropy ?? 0) >= 0.45).length;
    const tail = cooling > 0 ? ` · ${cooling} cooling` : "";
    const word = memories.length === 1 ? "memory" : "memories";
    pushToast(`Welcome back, ${space.name} — ${memories.length} ${word}${tail}`, "🛰️", 10000);
  }, [space, loaded, demo, data.nodes]);

  // Gamification (Wave 1): celebrate crossing a memory-count milestone (once each,
  // per brain, remembered on this device).
  useEffect(() => {
    if (demo || !space || !loaded) return;
    const count = (data.nodes as GraphNode[]).filter((n) => n.kind !== "action").length;
    const MILES = MEMORY_MILESTONES;
    const key = `brain.milestone.${space.id}`;
    let last = 0;
    try {
      last = parseInt(localStorage.getItem(key) || "0", 10) || 0;
    } catch {
      /* storage unavailable */
    }
    const crossed = MILES.filter((m) => m <= count && m > last);
    if (crossed.length === 0) return;
    const top = crossed[crossed.length - 1]!;
    try {
      localStorage.setItem(key, String(top));
    } catch {
      /* ignore */
    }
    pushToast(`${top} memories — your galaxy is growing.`, "🎉", 10000);
  }, [space, loaded, demo, data.nodes]);

  // Gamification (Wave 3): pilot rank level-up — celebrate climbing a rank once
  // each, per brain. Same progression that speeds Soumaya up (real memory count).
  useEffect(() => {
    if (demo || !space || !loaded) return;
    const real = (data.nodes as GraphNode[]).filter((n) => n.kind !== "action" && n.kind !== "moc").length;
    const rank = pilotRank(real);
    const key = `brain.rank.${space.id}`;
    let last = 0;
    try {
      last = parseInt(localStorage.getItem(key) || "0", 10) || 0;
    } catch {
      /* storage unavailable */
    }
    if (rank.level <= last) return;
    try {
      localStorage.setItem(key, String(rank.level));
    } catch {
      /* ignore */
    }
    // First eval on a device with an established brain shouldn't fire retroactively.
    if (last > 0) pushToast(`Rank up — you're now a ${rank.title} (Lv ${rank.level})`, "⭐", 9000);
  }, [space, loaded, demo, data.nodes]);

  // Gamification (Wave 1): celebrate when a memory GROWS a tier (asteroid→…→star)
  // as it earns mass over time — the payoff of the slow-growth model. The first
  // snapshot is silent (baseline); only later promotions toast (capped, planet+).
  const tierRef = useRef<Map<number, number>>(new Map());
  const tierInitedRef = useRef(false);
  useEffect(() => {
    if (demo || !loaded) return;
    const idx = (c?: string) => Math.max(0, CELESTIAL_CLASSES.indexOf((c ?? "asteroid") as never));
    const planetIdx = CELESTIAL_CLASSES.indexOf("planet");
    const prev = tierRef.current;
    const next = new Map<number, number>();
    const ups: GraphNode[] = [];
    for (const n of data.nodes as GraphNode[]) {
      if (n.kind === "action") continue;
      const t = idx(n.celestial);
      next.set(n.id, t);
      const p = prev.get(n.id);
      if (tierInitedRef.current && p != null && t > p && t >= planetIdx) ups.push(n);
    }
    tierRef.current = next;
    tierInitedRef.current = true;
    for (const n of ups.slice(0, 2)) {
      const label = n.label.length > 30 ? `${n.label.slice(0, 30)}…` : n.label;
      pushToast(`"${label}" grew into a ${CELESTIAL_LABEL[n.celestial ?? "planet"]}`, "✦", 10000);
    }
  }, [data.nodes, demo, loaded]);

  // Gamification (Wave 2): achievements — qualitative feats unlocked once each,
  // per brain, remembered on this device. Offline-safe (pure over loaded state).
  // The first pass after sign-in is silent (seeds already-earned ones) so we
  // don't spam a returning user with a backlog of toasts on every launch.
  const achvInitedRef = useRef(false);
  useEffect(() => {
    if (!space || !loaded) return;
    
    // Evaluate achievements either using real data or simulated data
    let memories: GraphNode[];
    let linksCount: number;
    let linkObjects: any[] = [];
    
    if (demo) {
      if (demoBypass) return; // skip checking if everything is already unlocked
      memories = Array.from({ length: simulatedMemoriesCount }).map((_, i) => ({ id: i, kind: "memory" } as GraphNode));
      linksCount = simulatedLinksCount;
    } else {
      memories = (data.nodes as GraphNode[]).filter((n) => n.kind !== "action");
      linksCount = data.links.length;
      linkObjects = data.links;
    }

    const now = unlockedIds({ memories, links: linksCount, fuel, linkObjects });
    const key = achvKey(space.id);
    const seen = loadUnlocked(space.id);
    const fresh = now.filter((id) => !seen.has(id));
    if (fresh.length === 0) return;
    try {
      localStorage.setItem(key, JSON.stringify([...seen, ...fresh]));
    } catch {
      /* ignore */
    }
    // Seed silently the first time we ever evaluate this brain on this device.
    if (!achvInitedRef.current && seen.size === 0) {
      achvInitedRef.current = true;
      return;
    }
    achvInitedRef.current = true;
    for (const id of fresh.slice(0, 3)) {
      const a = ACHIEVEMENTS.find((x) => x.id === id);
      if (a) pushToast(`Achievement: ${a.name} — ${a.desc}`, a.icon ?? "🏆", 12000, "high");
    }
  }, [data.nodes, data.links, fuel, space, demo, loaded, simulatedMemoriesCount, simulatedLinksCount, demoBypass]);

  // Reveal the Observatory home once per app open, AFTER the cinematic fly-in
  // (~3.2s) has settled — never touches the intro itself. Skips the demo galaxy
  // and won't pop over a panel the user already opened during the swoop.
  useEffect(() => {
    if (obsShownRef.current || demo || !space || !loaded) return;
    const t = window.setTimeout(() => {
      obsShownRef.current = true;
      if (panel === null) setShowObs(true);
      else setObsSettled(true); // a panel's already open → Observatory won't show; release toasts
    }, 3400);
    return () => window.clearTimeout(t);
  }, [space, loaded, demo, panel]);

  // Buffer celebratory toasts until the Observatory gate resolves (so they don't
  // pop behind the cards). Demo / signed-out never gates. Flushes on settle.
  useEffect(() => {
    setToastsPaused(!demo && !!space && (showObs || !obsSettled));
  }, [demo, space, showObs, obsSettled]);

  // Autonomous hail: once per app open, if Soumaya has surfaced something worth
  // seeing (a latent insight), she flies into view with a message and the 💬 FAB
  // pulses — tap to talk. Fires after the Observatory settles so it never stacks.
  useEffect(() => {
    if (hailedRef.current || demo || !space || !loaded) return;
    const t = window.setTimeout(async () => {
      hailedRef.current = true;
      try {
        const insights = await getDigest();
        if (insights && insights.length > 0 && !showChat) {
          graphRef.current?.hailSoumaya("I found a connection worth seeing — tap to talk ✦");
          setChatPulse(true);
        }
      } catch {
        /* best-effort */
      }
    }, 7000);
    return () => window.clearTimeout(t);
  }, [space, loaded, demo]);

  // Close the Observatory and release any buffered toasts. The 🔭 FAB reopens it.
  const dismissObs = useCallback(() => {
    setShowObs(false);
    setObsSettled(true);
  }, []);

  // Offline ingest queue: flush anything captured offline once signed in / back
  // online, then refresh the galaxy + celebrate what synced.
  useEffect(() => {
    if (!space || demo) return;
    void flushIngestQueue();
    const onSynced = (e: Event) => {
      const detail = (e as CustomEvent).detail as { newIds?: number[]; synced?: number };
      void refresh(detail?.newIds);
      if (detail?.synced) pushToast(`Synced ${detail.synced} memor${detail.synced === 1 ? "y" : "ies"} you saved offline.`, "📡", 6000);
    };
    window.addEventListener("brain-ingest-synced", onSynced);
    return () => window.removeEventListener("brain-ingest-synced", onSynced);
  }, [space, demo, refresh]);

  // Navigate to a memory, recording where we came from so Back works.
  const goTo = useCallback(
    (id: number, record = true, ripple = false) => {
      const n = view.nodes.find((x) => x.id === id);
      if (!n) return;
      setHistory((h) => (record && selected && selected.id !== id ? [...h, selected.id] : h));
      setSelected(n);
      setTab("details");
      setPanel("dock");
      graphRef.current?.focusNode(id);
      if (ripple) graphRef.current?.spawnBurst(id, "user");
      if (!demo && space) {
        void tendNode(id); // revisiting a memory warms it back up (entropy)
        const tendKey = `stat.memories_tended.${space.id}`;
        localStorage.setItem(tendKey, String(parseInt(localStorage.getItem(tendKey) || "0", 10) + 1));
        // Force evaluation of achievements
        setTimeout(() => handleChanged(-1), 100);
      }
    },
    [view, selected, demo, space],
  );

  const focus = useCallback((id: number) => goTo(id, true, true), [goTo]);

  const triggerFlashback = useCallback(() => {
    // Find an old, high-mass memory (Serendipity hook)
    const candidates = view.nodes.filter(n => {
      if (!n.createdAt || !n.mass) return false;
      const rawDate = n.createdAt;
      const isoDate = rawDate.includes("Z") ? rawDate : rawDate.replace(" ", "T") + "Z";
      const ageDays = (Date.now() - Date.parse(isoDate)) / (1000 * 60 * 60 * 24);
      return ageDays > 7 && n.mass > 0.3; 
    });
    
    if (candidates.length > 0) {
      // Pick a random candidate
      const target = candidates[Math.floor(Math.random() * candidates.length)]!;
      goTo(target.id, true);
      // Spawn a special calibration/synthesis burst to draw attention
      graphRef.current?.spawnBurst(target.id, "calibration");
    } else {
      // Fallback if the brain is too young
      const all = view.nodes.filter(n => n.mass && n.mass > 0.2);
      if (all.length > 0) {
        const target = all[Math.floor(Math.random() * all.length)]!;
        goTo(target.id, true);
        graphRef.current?.spawnBurst(target.id, "calibration");
      }
    }
  }, [view, goTo]);

  const back = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const id = h[h.length - 1]!;
      const n = view.nodes.find((x) => x.id === id);
      if (n) {
        setSelected(n);
        setTab("details");
        setPanel("dock");
        graphRef.current?.focusNode(id);
      }
      return h.slice(0, -1);
    });
  }, [view]);

  // After a weight edit: re-pull the graph (mass/celestial recompute), keep
  // the node selected, no camera move.
  const handleChanged = useCallback(async (id: number) => {
    if (id === -1) {
      if (space) {
        const shipKey = `brain.hangar.ship.${space.id}`;
        const trailKey = `brain.hangar.trail.${space.id}`;
        const fig1Key = `brain.hangar.fig1.${space.id}`;
        const fig2Key = `brain.hangar.fig2.${space.id}`;
        const focusFig1Key = `brain.hangar.focusFig1.${space.id}`;
        const focusFig2Key = `brain.hangar.focusFig2.${space.id}`;
        const simMemKey = `brain.demo.sim_memories.${space.id}`;
        const simLinkKey = `brain.demo.sim_links.${space.id}`;
        const bypassKey = `brain.demo.bypass.${space.id}`;

        setEquippedShip(localStorage.getItem(shipKey) || "default");
        setEquippedTrail(localStorage.getItem(trailKey) || "blue");
        setEquippedFig1(localStorage.getItem(fig1Key) || "none");
        setEquippedFig2(localStorage.getItem(fig2Key) || "none");
        setShowFocusFig1(localStorage.getItem(focusFig1Key) !== "false");
        setShowFocusFig2(localStorage.getItem(focusFig2Key) !== "false");
        setSimulatedMemoriesCount(parseInt(localStorage.getItem(simMemKey) || "0", 10));
        setSimulatedLinksCount(parseInt(localStorage.getItem(simLinkKey) || "0", 10));
        setDemoBypass(localStorage.getItem(bypassKey) !== "0");
      }
      return;
    }
    if (demo) return;
    const g = await getGraph();
    setData(g);
    getFuel().then((f) => f && setFuel(f)).catch(() => {});
    const n = g.nodes.find((x) => x.id === id);
    if (n) {
      setSelected(n);
      graphRef.current?.spawnBurst(id, "user");
    }
  }, [space, demo]);

  const handleDeleted = useCallback(() => {
    setSelected(null);
    setPanel(null);
    setHistory([]);
    void refresh();
  }, [refresh]);

  const toggle = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));

  const llmStatus = health
    ? health.llm.available
      ? health.llm.model
      : health.llm.degraded
        ? `${health.llm.model} · offline mode`
        : "heuristic mode"
    : "";

  // Gate: wait for the auth check, then require an open brain.
  if (!authChecked) {
    return (
      <div className="loading">
        <div className="loader-orb" />
        <p>Aligning the stars…</p>
      </div>
    );
  }
  if (!space) {
    return <LoginScreen onAuthed={setSpace} />;
  }

  return (
    <div className="app">
      <Toasts />
      <Graph3D
        ref={graphRef}
        data={view}
        onSelect={(node) => focus(node.id)}
        onSoumayaClick={() => {
          setTab("soumaya"); // tapping her ship = talk to Soumaya
          setPanel("dock");
          setFollowShip(true);
          setFollowStation(false);
          setFollowSatellite(false);
          setFollowVisitor(false);
          setFollowFig1(false);
          setFollowFig2(false);
          graphRef.current?.toggleFollowShip(true);
        }}
        onSatelliteCount={setSatelliteCount}
        onVisitorCount={setVisitorCount}
        selectedId={selected?.id ?? null}
        bottomInset={panel === "dock"}
        demo={demo}
        showShipTask={showShipTask}
        pilotSpeed={pilotSpeed}
        loaded={loaded}
        onTasksChange={setTasks}
        shipViewMode={shipViewMode}
        fuel={fuel}
        equippedShip={equippedShip}
        equippedTrail={equippedTrail}
        equippedFig1={equippedFig1}
        equippedFig2={equippedFig2}
        spaceId={space?.id ?? ""}
      />

      {!loaded && (
        <div className="loading">
          <div className="loader-orb" />
          <p>Mapping your galaxy…</p>
        </div>
      )}

      {aiBusy > 0 && (
        <div className="ai-busy">
          <span className="ai-dot" /> {space?.name ?? "Soumaya"} is thinking…
        </div>
      )}

      <header className="brand">
        <h1>
          {space?.name ?? "Soumaya"} <span className="sep">·</span> Second Brain
        </h1>
        <div className="brand-row">
          {space && space.name.toLowerCase() === "soumaya" && (
            <button
              className="chip-btn"
              onClick={() => {
                setSelected(null);
                setClustered(false);
                graphRef.current?.exitCluster();
                setDemo((d) => !d);
              }}
            >
              {demo ? "← Back to mine" : "✨ Demo galaxy"}
            </button>
          )}
          {health && (
            <span className="status">
              {(demo ? demoData : data).nodes.length} memories · {llmStatus}
            </span>
          )}
          {fuel && !demo && (
            <span
              className="status fuel-chip"
              title={`⛽ Fuel ${fuel.fuel}/${fuel.capacity} — Soumaya spends it on deep-dive research & sector charting (${fuel.jobCost}/job). EARN it by logging memories, forging links & clearing action items; it also slowly refills on its own. Her core upkeep + the living galaxy never need fuel.`}
              style={{
                background: `linear-gradient(90deg, rgba(255, 207, 107, 0.16) ${(fuel.fuel / fuel.capacity) * 100}%, rgba(255, 207, 107, 0.02) ${(fuel.fuel / fuel.capacity) * 100}%)`
              }}
            >
              ⛽ {Math.round(fuel.fuel)}/{fuel.capacity}
              {fuelPops.map((pop) => (
                <span key={pop.id} className="fuel-pop">
                  {pop.text}
                </span>
              ))}
            </span>
          )}
          {streak && streak.current > 0 && !demo && (
            <span
              className="status streak-chip"
              title={`🔥 ${streak.current}-day streak — consecutive days you've fed your brain a memory${
                streak.best > streak.current ? ` (best: ${streak.best})` : ""
              }. Keep it alive: log at least one memory a day.`}
            >
              🔥 {streak.current}
            </span>
          )}
          {installPrompt && (
            <button
              className="chip-btn install-btn"
              title="Install app to your home screen"
              onClick={triggerInstall}
            >
              📲 Install App
            </button>
          )}
          <button
            className="chip-btn"
            title={`Signed in as "${space.name}" — switch brain`}
            onClick={() => {
              logoutSpace();
              setSpace(null);
              setData({ nodes: [], links: [] });
              setSelected(null);
              setPanel(null);
            }}
          >
            {space.name} ⏏
          </button>
        </div>
      </header>

      {space && (
        <NotificationsBar
          fuel={fuel}
          nodes={view.nodes as GraphNode[]}
          health={health}
          onFocusNode={goTo}
          onOpenTab={(t) => {
            setTab(t);
            setPanel("dock");
          }}
          demo={demo}
        />
      )}

      {help && (
        <HelpPanel
          onClose={() => setHelp(false)}
          installPrompt={installPrompt}
          onInstall={triggerInstall}
        />
      )}

      {/* Evolving lore for the focused object (station / ship / beacon). Hidden while a
          panel is open or when dismissed — dismissing keeps the camera focus. */}
      {(followStation || followShip || followSatellite) && panel === null && !loreDismissed && (
        <ObjectLoreCard
          kind={followShip ? "ship" : followSatellite ? "satellite" : "station"}
          graph={view}
          onClose={() => setLoreDismissed(true)}
        />
      )}

      {clustered && (
        <button
          className="exit-cluster"
          onClick={() => {
            graphRef.current?.exitCluster();
            setClustered(false);
          }}
        >
          ✕ Exit system view
        </button>
      )}

      {/* Floating controls — hidden while a panel is open so they never cover it */}
      {panel === null && (
        <>
          <button className="fab fab-search" onClick={() => toggle("search")} aria-label="Search">
            🔍
          </button>
          <button className="fab fab-flashback" onClick={triggerFlashback} aria-label="Flashback (Serendipity)" title="Surprise me with an old memory">
            ☄️
          </button>
          <button className="fab fab-help" onClick={() => setHelp(true)} aria-label="Help / guide">
            ?
          </button>
          <button className="fab fab-dock" onClick={() => toggle("dock")} aria-label="Panels">
            ☰
          </button>
          <button
            className="fab fab-recenter"
            onClick={() => {
              graphRef.current?.recenter();
              setFollowShip(false);
              setFollowStation(false);
              setFollowSatellite(false);
              setFollowVisitor(false);
              setFollowFig1(false);
              setFollowFig2(false);
              setFocusMenuOpen(false);
              setClustered(false);
            }}
            aria-label="Recenter galaxy"
            title="Recenter the galaxy"
          >
            ⊙
          </button>
          {/* On-screen zoom (works when pinch/trackpad zoom fails). */}
          <button
            className="fab fab-zoom-in"
            onClick={() => graphRef.current?.zoomBy(0.8)}
            aria-label="Zoom in"
            title="Zoom in"
          >
            ＋
          </button>
          <button
            className="fab fab-zoom-out"
            onClick={() => graphRef.current?.zoomBy(1.25)}
            aria-label="Zoom out"
            title="Zoom out"
          >
            －
          </button>
          {/* Game-style focus cluster: one button that pops up the camera targets. */}
          {(() => {
            let focusIdx = 0;
            const shipIdx = focusIdx++;
            const stationIdx = focusIdx++;
            const satelliteIdx = satelliteCount > 0 ? focusIdx++ : -1;
            const visitorIdx = visitorCount > 0 ? focusIdx++ : -1;
            const fig1Idx = (showFocusFig1 && equippedFig1 !== "none") ? focusIdx++ : -1;
            const fig2Idx = (showFocusFig2 && equippedFig2 !== "none") ? focusIdx++ : -1;

            return (
              <div className={`focus-cluster ${focusMenuOpen ? "open" : ""}`}>
                <button
                  className={`fab focus-item ${followShip ? "on" : ""}`}
                  style={focusItemStyle(shipIdx, focusMenuOpen)}
                  onClick={() => {
                    setLoreDismissed(false);
                    setFollowShip(graphRef.current?.toggleFollowShip() ?? false);
                    setFollowStation(false);
                    setFollowSatellite(false);
                    setFollowVisitor(false);
                    setFollowFig1(false);
                    setFollowFig2(false);
                    setFocusMenuOpen(false);
                  }}
                  aria-label={`Focus ${space?.name ?? "Soumaya"}`}
                  title={`Focus ${space?.name ?? "Soumaya"}'s ship`}
                >
                  🛸
                </button>
                <button
                  className={`fab focus-item ${followStation ? "on" : ""}`}
                  style={focusItemStyle(stationIdx, focusMenuOpen)}
                  onClick={() => {
                    setLoreDismissed(false);
                    setFollowStation(graphRef.current?.toggleFollowStation() ?? false);
                    setFollowShip(false);
                    setFollowSatellite(false);
                    setFollowVisitor(false);
                    setFollowFig1(false);
                    setFollowFig2(false);
                    setFocusMenuOpen(false);
                  }}
                  aria-label="Focus space station"
                  title="Focus the space station"
                >
                  🌐
                </button>
                {satelliteIdx >= 0 && (
                  <button
                    className={`fab focus-item beacon-item ${followSatellite ? "on" : ""}`}
                    style={focusItemStyle(satelliteIdx, focusMenuOpen)}
                    onClick={() => {
                      setLoreDismissed(false);
                      const on = graphRef.current?.cycleFollowSatellite() ?? false;
                      setFollowSatellite(on);
                      setFollowShip(false);
                      setFollowStation(false);
                      setFollowVisitor(false);
                      setFollowFig1(false);
                      setFollowFig2(false);
                    }}
                    aria-label="Jump to an Aura beacon"
                    title={`Jump to a beacon (${satelliteCount} deployed over cooling memories)`}
                  >
                    🛰️
                  </button>
                )}
                {visitorIdx >= 0 && (
                  <button
                    className={`fab focus-item visitor-item ${followVisitor ? "on" : ""}`}
                    style={focusItemStyle(visitorIdx, focusMenuOpen)}
                    onClick={() => {
                      const on = graphRef.current?.cycleFollowVisitor() ?? false;
                      setFollowVisitor(on);
                      setFollowShip(false);
                      setFollowStation(false);
                      setFollowSatellite(false);
                      setFollowFig1(false);
                      setFollowFig2(false);
                    }}
                    aria-label="Jump to a visitor"
                    title={`Jump to a visitor (${visitorCount} drifting in)`}
                  >
                    👽
                  </button>
                )}
                {fig1Idx >= 0 && (
                  <button
                    className={`fab focus-item ${followFig1 ? "on" : ""}`}
                    style={focusItemStyle(fig1Idx, focusMenuOpen)}
                    onClick={() => {
                      setLoreDismissed(false);
                      const on = graphRef.current?.toggleFollowFig1() ?? false;
                      setFollowFig1(on);
                      setFollowShip(false);
                      setFollowStation(false);
                      setFollowSatellite(false);
                      setFollowVisitor(false);
                      setFollowFig2(false);
                      setFocusMenuOpen(false);
                    }}
                    aria-label={`Focus ${getFigurineLabel(equippedFig1)}`}
                    title={`Focus ${getFigurineLabel(equippedFig1)}`}
                  >
                    {getFigurineIcon(equippedFig1)}
                  </button>
                )}
                {fig2Idx >= 0 && (
                  <button
                    className={`fab focus-item ${followFig2 ? "on" : ""}`}
                    style={focusItemStyle(fig2Idx, focusMenuOpen)}
                    onClick={() => {
                      setLoreDismissed(false);
                      const on = graphRef.current?.toggleFollowFig2() ?? false;
                      setFollowFig2(on);
                      setFollowShip(false);
                      setFollowStation(false);
                      setFollowSatellite(false);
                      setFollowVisitor(false);
                      setFollowFig1(false);
                      setFocusMenuOpen(false);
                    }}
                    aria-label={`Focus ${getFigurineLabel(equippedFig2)}`}
                    title={`Focus ${getFigurineLabel(equippedFig2)}`}
                  >
                    {getFigurineIcon(equippedFig2)}
                  </button>
                )}
                <button
                  className={`fab focus-main ${focusMenuOpen ? "active" : ""} ${
                    (followShip || followStation || followSatellite || followVisitor || followFig1 || followFig2) && !focusMenuOpen ? "on" : ""
                  } ${beaconPulse ? "pulse" : ""}`}
                  onClick={() => setFocusMenuOpen((o) => !o)}
                  aria-label="Camera focus targets"
                  title="Focus targets (ship · station · beacons · figurines)"
                >
                  {focusMenuOpen ? "✕" : "🎯"}
                </button>
              </div>
            );
          })()}
          <button
            className={`fab fab-music ${music ? "on" : ""}`}
            onClick={toggleMusic}
            aria-label="Toggle ambient music"
            title="Ambient space music"
          >
            {music ? "🔊" : "🔈"}
          </button>
          <button className="fab fab-ingest" onClick={() => toggle("ingest")} aria-label="Add a memory">
            📝
          </button>
          <button
            className="fab fab-observatory"
            onClick={() => setShowObs(true)}
            aria-label="Open the Observatory home"
            title="Observatory — your home view"
          >
            🔭
          </button>
          <button
            className={`fab fab-chat ${showChat ? "on" : ""} ${chatPulse ? "pulse" : ""}`}
            onClick={() => {
              setShowChat((v) => !v);
              setChatPulse(false);
            }}
            aria-label="Talk to Soumaya"
            title={`Talk to ${space?.name ?? "Soumaya"}`}
          >
            💬
          </button>
          <button
            className="fab fab-settings"
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            title="Settings"
          >
            ⚙️
          </button>
        </>
      )}

      {showSettings && space && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          onProfileUpdated={(name) => setSpace((s) => (s ? { ...s, name } : s))}
          showShipTask={showShipTask}
          setShowShipTask={setShowShipTask}
        />
      )}

      {showChat && space && !demo && (
        <ChatDock
          spaceName={space.name}
          onClose={() => setShowChat(false)}
          onFocus={(id) => focus(id)}
          onRecall={(ids) => graphRef.current?.fireRecall(ids)}
          onCreated={(ids) => void refresh(ids)}
        />
      )}

      {awayDigest && !demo && space && (
        <WelcomeBackCard
          digest={awayDigest}
          onFocus={(id) => graphRef.current?.focusNode(id)}
          onClose={() => {
            setAwayDigest(null);
            void markAwaySeen();
          }}
        />
      )}

      {showObs && !demo && space && (
        <Observatory
          spaceName={space.name}
          memories={(data.nodes as GraphNode[]).filter((n) => n.kind !== "action")}
          streak={streak?.current ?? 0}
          fedToday={!!streak?.today}
          onCapture={() => {
            dismissObs();
            setPanel("ingest");
          }}
          onFocus={(id) => {
            dismissObs();
            focus(id);
          }}
          onOpenInsights={() => {
            dismissObs();
            setTab("insights");
            setPanel("dock");
          }}
          onEnter={dismissObs}
        />
      )}

      {panel === "search" && <SearchBox onFocus={focus} onClose={() => setPanel(null)} />}
      {panel === "ingest" && (
        <IngestPanel onIngested={refresh} onClose={() => setPanel(null)} />
      )}
      {panel === "dock" && (
        <RightDock
          spaceName={space?.name ?? "Soumaya"}
          tab={tab}
          setTab={setTab}
          selected={selected}
          graph={view}
          onFocus={focus}
          onChanged={handleChanged}
          onDeleted={demo ? undefined : handleDeleted}
          onIsolate={(id) => {
            graphRef.current?.isolateSystem(id);
            setClustered(true);
            setPanel(null);
          }}
          onClose={() => setPanel(null)}
          onBack={back}
          canBack={history.length > 0}
          demo={demo}
          getFleetStatus={() => graphRef.current?.getFleetStatus()}
          showShipTask={showShipTask}
          setShowShipTask={setShowShipTask}
          onRecall={(ids) => graphRef.current?.fireRecall(ids)}
          shipViewMode={shipViewMode}
          setShipViewMode={setShipViewMode}
          tasks={tasks}
          onReorderTasks={handleReorderTasks}
          fuel={fuel}
          streak={streak}
          spaceId={space?.id ?? ""}
          onPromoted={() => void refresh()}
        />
      )}
    </div>
  );
}
