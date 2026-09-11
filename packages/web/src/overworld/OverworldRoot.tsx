import { useCallback, useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { ingestText } from "../api/client.js";
import { getSpaceId } from "../api/http.js";
import { musicEnabled, setMusicEnabled, startMusicLoop, stopMusicLoop } from "../lib/music.js";
import { InputBus } from "./engine/input.js";
import { ExteriorScene, TILE_SIZE, type ExteriorSceneConfig } from "./scenes/ExteriorScene.js";
import { placeById, REGION_HEIGHT, REGION_WIDTH, type PlaceId } from "./scenes/regionLayout.js";
import { TouchControls } from "./ui/TouchControls.js";
import { CreatureSummaryOverlay } from "./ui/CreatureSummaryOverlay.js";
import { CaptureMenu } from "./ui/CaptureMenu.js";
import { BankOverlay } from "./ui/BankOverlay.js";
import { LibraryOverlay } from "./ui/LibraryOverlay.js";
import { SanctuaryOverlay } from "./ui/SanctuaryOverlay.js";
import { BulletinBoardOverlay } from "./ui/BulletinBoardOverlay.js";
import { ObservatoryOverlay } from "./ui/ObservatoryOverlay.js";
import { PostOfficeOverlay } from "./ui/PostOfficeOverlay.js";
import { GymOverlay } from "./ui/GymOverlay.js";
import { TownHallOverlay } from "./ui/TownHallOverlay.js";
import { HangarOverlay } from "./ui/HangarOverlay.js";
import { SoumayaChatOverlay } from "./ui/SoumayaChatOverlay.js";
import { greetCreature, loadWorldSnapshot, type WorldSnapshot } from "./data/loadWorldSnapshot.js";
import type { CreatureEntity } from "./types.js";

type Overlay =
  | { kind: "none" }
  | { kind: "capture" }
  | { kind: "details"; creature: CreatureEntity }
  | { kind: PlaceId };

const DOOR_PLACE_IDS = new Set<PlaceId>(["bank", "library", "sanctuary", "postOffice", "observatory", "gym", "townHall", "hangar"]);

/**
 * The Overworld's town: every dock-tab equivalent lives here as a real place (Stage 2,
 * roadmap.md). Additive per decisions.md D1/D6 — only ever rendered behind the
 * `?overworld=1` opt-in in main.tsx.
 */
export function OverworldRoot() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputBusRef = useRef(new InputBus());
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<ExteriorScene | null>(null);
  const snapshotRef = useRef<WorldSnapshot | null>(null);

  const [snapshot, setSnapshotState] = useState<WorldSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay>({ kind: "none" });
  const [greetBusy, setGreetBusy] = useState(false);
  const [musicOn, setMusicOn] = useState(musicEnabled());

  const setSnapshot = useCallback((next: WorldSnapshot | null) => {
    snapshotRef.current = next;
    setSnapshotState(next);
  }, []);

  const refresh = useCallback(async (): Promise<WorldSnapshot | null> => {
    try {
      const next = await loadWorldSnapshot();
      setSnapshot(next);
      setLoadError(null);
      sceneRef.current?.setCreatures(next.creatures);
      return next;
    } catch (err) {
      // Preserve whatever's already on screen rather than wiping it (App.tsx's own
      // "preserve last known graph on error" convention — ux-design.md error state).
      setLoadError(err instanceof Error ? err.message : "Couldn't reach your brain.");
      return null;
    }
  }, [setSnapshot]);

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent,
      width: REGION_WIDTH * TILE_SIZE,
      height: REGION_HEIGHT * TILE_SIZE,
      backgroundColor: "#0c0e1a",
      pixelArt: true,
      scene: [],
      // Without this, Phaser renders the canvas at a fixed 832x576 CSS px regardless of the
      // real screen size — on any phone narrower than that, you only ever see the map's
      // left/top slice (this is what made the game look "cut off" and movement look like it
      // did nothing: the player was very often walking around outside the visible crop).
      // FIT scales the canvas down to fit `parent`'s box, preserving pixel-art aspect ratio;
      // the container below is sized to that exact aspect ratio so it never letterboxes.
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: REGION_WIDTH * TILE_SIZE,
        height: REGION_HEIGHT * TILE_SIZE,
      },
    };
    const game = new Phaser.Game(config);
    gameRef.current = game;
    let cancelled = false;

    // `game.scene.add()` returns null until the SceneManager has actually booted (its own
    // JSDoc: "The added Scene, if it was added immediately, otherwise null") — Phaser's boot
    // is asynchronous (DOM-ready -> renderer/canvas -> texture manager), so calling `.add()`
    // synchronously right after `new Phaser.Game()` hit that null case in production
    // ("Cannot read properties of null (reading 'events')"). `Phaser.Core.Events.READY` is
    // the documented signal that boot has finished and scenes can now be added/started.
    game.events.once(Phaser.Core.Events.READY, () => {
      if (cancelled) return; // unmounted before boot finished

      const sceneConfig: ExteriorSceneConfig = {
        inputBus: inputBusRef.current,
        creatures: [],
        spaceId: getSpaceId() ?? "default",
      };
      const scene = game.scene.add("exterior-scene", ExteriorScene, true, sceneConfig) as ExteriorScene | null;
      if (!scene) {
        // Belt-and-braces: should be unreachable per the READY contract above, but a blank
        // crashed screen is worse than a visible, retryable error state.
        setLoadError("The world didn't load. Try reloading the page.");
        return;
      }
      sceneRef.current = scene;

      scene.events.on("enter-place", (placeId: PlaceId) => setOverlay({ kind: placeId }));
      scene.events.on("enter-grass", () => setOverlay({ kind: "capture" }));
      scene.events.on("greet-creature", (nodeId: number) => {
        const creature = snapshotRef.current?.creatures.find((c) => c.nodeId === nodeId);
        if (creature) setOverlay({ kind: "details", creature });
      });

      void refresh();
    });

    return () => {
      cancelled = true;
      game.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
    // Intentionally mount-once: refresh/setSnapshot are stable via useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Browsers block audio until a genuine user gesture. Mirrors Phaser's own sound-manager
    // unlock pattern: wait for the first real pointerdown/keydown ANYWHERE on the page
    // (touch D-pad or a keyboard press both qualify) rather than assuming the earlier
    // login-screen click still counts by the time this mounts.
    const start = () => {
      void startMusicLoop("/overworld/theme.wav");
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
    window.addEventListener("pointerdown", start, { once: true });
    window.addEventListener("keydown", start, { once: true });
    return () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
      stopMusicLoop();
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setPaused(overlay.kind !== "none");
  }, [overlay.kind]);

  const toggleMusic = useCallback(() => {
    const next = !musicOn;
    setMusicEnabled(next);
    setMusicOn(next);
  }, [musicOn]);

  const closeOverlay = useCallback(() => {
    // FR3 — leaving a door-building returns to the exact tile you entered from; standalone
    // objects (Soumaya, the Bulletin Board) never moved the player, so nothing to restore.
    if (overlay.kind !== "none" && overlay.kind !== "capture" && overlay.kind !== "details" && DOOR_PLACE_IDS.has(overlay.kind)) {
      sceneRef.current?.returnToDoor(overlay.kind);
    }
    // Leaving the Hangar may have changed the saved trail color — pick it up immediately
    // rather than waiting for a full scene reload.
    if (overlay.kind === "hangar") {
      sceneRef.current?.refreshTrailColor();
    }
    setOverlay({ kind: "none" });
  }, [overlay.kind]);

  const openPlace = useCallback((placeId: PlaceId) => {
    setOverlay({ kind: placeId });
  }, []);

  const flyToNode = useCallback((nodeId: number) => {
    sceneRef.current?.flyToNode(nodeId);
  }, []);

  const handleGreetConfirm = useCallback(async () => {
    if (overlay.kind !== "details") return;
    setGreetBusy(true);
    try {
      await greetCreature(overlay.creature.nodeId);
      await refresh(); // FR11 — reconcile from the real server response, never a client-side guess
    } finally {
      setGreetBusy(false);
      setOverlay({ kind: "none" });
    }
  }, [overlay, refresh]);

  const handleCaptureSubmit = useCallback(
    async (text: string): Promise<CreatureEntity | null> => {
      const result = await ingestText(text, { kind: "memory" });
      const newNodeId = result.nodes[0]?.id;
      const next = await refresh();
      if (newNodeId == null) return null;
      return next?.creatures.find((c) => c.nodeId === newNodeId) ?? null;
    },
    [refresh],
  );

  const spaceId = getSpaceId() ?? "default";
  const memoriesCount = snapshot?.graph.nodes.filter((n) => n.kind !== "action").length ?? 0;

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: REGION_WIDTH * TILE_SIZE, margin: "0 auto" }}>
      <div
        ref={containerRef}
        data-testid="overworld-canvas-root"
        style={{ width: "100%", aspectRatio: `${REGION_WIDTH} / ${REGION_HEIGHT}` }}
      />
      <button
        type="button"
        aria-label={musicOn ? "Mute music" : "Unmute music"}
        onClick={toggleMusic}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 1,
          background: "#00000099",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          padding: "4px 8px",
          fontSize: 14,
        }}
      >
        {musicOn ? "🔊" : "🔇"}
      </button>
      {loadError && (
        <div
          role="alert"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            background: "#4b1420",
            color: "#ffd7de",
            padding: 8,
            fontSize: 12,
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span>{loadError}</span>
          <button type="button" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      )}
      {overlay.kind === "none" && <TouchControls onEvent={(event) => inputBusRef.current.emit(event)} />}

      {overlay.kind === "bank" && snapshot && (
        <BankOverlay rows={snapshot.bank.rows} safeToSpendCents={snapshot.bank.safeToSpendCents} onClose={closeOverlay} />
      )}
      {overlay.kind === "library" && snapshot && <LibraryOverlay graph={snapshot.graph} onClose={closeOverlay} />}
      {overlay.kind === "sanctuary" && <SanctuaryOverlay onClose={closeOverlay} />}
      {overlay.kind === "bulletinBoard" && snapshot && (
        <BulletinBoardOverlay graph={snapshot.graph} onClose={closeOverlay} refresh={refresh} />
      )}
      {overlay.kind === "observatory" && <ObservatoryOverlay onClose={closeOverlay} />}
      {overlay.kind === "postOffice" && <PostOfficeOverlay spaceId={spaceId} onClose={closeOverlay} onOpenPlace={openPlace} />}
      {overlay.kind === "gym" && snapshot && (
        <GymOverlay graph={snapshot.graph} fuel={snapshot.fuel} streak={snapshot.streak} onClose={closeOverlay} />
      )}
      {overlay.kind === "townHall" && <TownHallOverlay onClose={closeOverlay} />}
      {overlay.kind === "hangar" && <HangarOverlay spaceId={spaceId} memoriesCount={memoriesCount} onClose={closeOverlay} />}
      {overlay.kind === "soumaya" && (
        <SoumayaChatOverlay onClose={closeOverlay} creatures={snapshot?.creatures ?? []} onFlyToNode={flyToNode} />
      )}

      {overlay.kind === "capture" && <CaptureMenu onSubmit={handleCaptureSubmit} onClose={closeOverlay} />}
      {overlay.kind === "details" && (
        <CreatureSummaryOverlay creature={overlay.creature} onGreet={handleGreetConfirm} onClose={closeOverlay} busy={greetBusy} />
      )}
    </div>
  );
}
