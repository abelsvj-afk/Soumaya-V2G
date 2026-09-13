import { useCallback, useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { getDigest, ingestText } from "../api/client.js";
import { getSpaceId } from "../api/http.js";
import { checkTownMeeting, markAnnounced, meetingAnnouncementText } from "./data/townMeeting.js";
import { checkCivicConcern, concernAnnouncementText, markConcernAnnounced } from "./data/civicConcern.js";
import { buildingNeglect, isNeglected } from "./data/buildingNeglect.js";
import { detectBankWork } from "./adapter/financeAdapter.js";
import { recordBuildingWork } from "./data/npcJobs.js";
import { musicEnabled, nextTrack, playCurrentTrack, setMusicEnabled, stopMusicLoop } from "../lib/music.js";
import { InputBus } from "./engine/input.js";
import { ExteriorScene, type ExteriorSceneConfig } from "./scenes/ExteriorScene.js";
import { allPlaces, placeById, type PlaceId } from "./scenes/regionLayout.js";
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
import { MarketOverlay } from "./ui/MarketOverlay.js";
import { ParkOverlay } from "./ui/ParkOverlay.js";
import { MayorsHallOverlay } from "./ui/MayorsHallOverlay.js";
import { BusinessOverlay } from "./ui/BusinessOverlay.js";
import { SettingsOverlay } from "./ui/SettingsOverlay.js";
import { TownHud } from "./ui/TownHud.js";
import { greetCreature, loadWorldSnapshot, type WorldSnapshot } from "./data/loadWorldSnapshot.js";
import type { CreatureEntity } from "./types.js";

type Overlay =
  | { kind: "none" }
  | { kind: "capture" }
  | { kind: "details"; creature: CreatureEntity }
  | { kind: "business"; businessId: string }
  | { kind: "settings" }
  | { kind: PlaceId };

const DOOR_PLACE_IDS = new Set<PlaceId>([
  "bank",
  "library",
  "sanctuary",
  "postOffice",
  "observatory",
  "gym",
  "market",
  "townHall",
  "park",
  "hangar",
  "mayorsHall",
]);

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

  /** NPC Society v1 (docs/overworld/npc-society.md) — governance's one real mechanical
   *  effect: the first time a NEW synthesis digest insight is up, post a plain-language
   *  summary to the Bulletin Board as a real quest, then flash the town-meeting cue on the
   *  two Town Hall NPCs. Best-effort and never blocks/gates the refresh it rides along with —
   *  a missed check just gets re-evaluated next refresh. */
  const checkTownMeetingEffect = useCallback(async (): Promise<void> => {
    const spaceId = getSpaceId() ?? "default";
    try {
      const digest = await getDigest();
      const check = checkTownMeeting(spaceId, digest);
      if (check.shouldMeet && check.insight) {
        await ingestText(meetingAnnouncementText(check.insight), { kind: "action" });
        // Town Growth Loop (docs/overworld/town-growth-loop.md, task #69) — this is the exact
        // same real "a quest posted" mutation BulletinBoardOverlay.tsx's own direct posts
        // already credit; it earned nothing just because it happened via a different call site.
        recordBuildingWork(spaceId, "bulletinBoard");
        markAnnounced(spaceId, check.insight.id);
        sceneRef.current?.announceTownMeeting();
      }
    } catch {
      /* best-effort — see comment above */
    }
  }, []);

  /** Civic concern (docs/overworld/civic-concern.md, task #64) — a SECOND, independent reason
   *  to hold the exact same real Town Meeting: a real majority of buildings neglected at once,
   *  never a single struggling building. The D3-compliant reframe of "crime/policing" — no new
   *  mechanism, the same Bulletin Board post + NPC gathering the digest-triggered meeting
   *  already uses. Reads real, already-computed neglect (buildingNeglect.ts), never a new fetch. */
  const checkCivicConcernEffect = useCallback(async (): Promise<void> => {
    const spaceId = getSpaceId() ?? "default";
    try {
      const doorPlaces = allPlaces().filter((p) => p.kind === "door" && p.id !== "mayorsHall");
      const neglected = doorPlaces.filter((p) => isNeglected(buildingNeglect(spaceId, p.id)));
      const check = checkCivicConcern(
        spaceId,
        neglected.length,
        doorPlaces.length,
        neglected.map((p) => p.label),
      );
      if (check.shouldMeet) {
        await ingestText(concernAnnouncementText(check.neglectedLabels, doorPlaces.length), { kind: "action" });
        // Town Growth Loop (task #69) — same real Bulletin Board post credit as the
        // digest-triggered meeting above.
        recordBuildingWork(spaceId, "bulletinBoard");
        markConcernAnnounced(spaceId);
        sceneRef.current?.announceTownMeeting();
      }
    } catch {
      /* best-effort — see comment above */
    }
  }, []);

  const refresh = useCallback(async (): Promise<WorldSnapshot | null> => {
    try {
      const previousBankRows = snapshotRef.current?.bank.rows ?? [];
      const next = await loadWorldSnapshot();
      // Town Economy round (npc-economy.md) — the Bank has no button of its own to hook (a
      // read-only ledger), so its real work is detected by diffing the previous snapshot
      // against this one (see detectBankWork's own doc comment for why).
      if (detectBankWork(previousBankRows, next.bank.rows)) {
        const spaceIdForWork = getSpaceId();
        if (spaceIdForWork) recordBuildingWork(spaceIdForWork, "bank");
      }
      setSnapshot(next);
      setLoadError(null);
      sceneRef.current?.setCreatures(next.creatures);
      sceneRef.current?.refreshPlacedItems();
      sceneRef.current?.refreshZoneMarkers();
      sceneRef.current?.refreshPlacedHomes();
      sceneRef.current?.refreshPlacedBusinesses();
      void checkTownMeetingEffect();
      void checkCivicConcernEffect();
      return next;
    } catch (err) {
      // Preserve whatever's already on screen rather than wiping it (App.tsx's own
      // "preserve last known graph on error" convention — ux-design.md error state).
      setLoadError(err instanceof Error ? err.message : "Couldn't reach your brain.");
      return null;
    }
  }, [setSnapshot, checkTownMeetingEffect, checkCivicConcernEffect]);

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent,
      backgroundColor: "#0c0e1a",
      pixelArt: true,
      scene: [],
      // RESIZE, not FIT: FIT scales a FIXED 832x576 logical canvas to fit the screen, which
      // forces the whole 26x18 map's landscape shape onto every device (real user feedback:
      // "it's built to turn your phone sideways... it needs to adapt to whatever device").
      // RESIZE instead makes the canvas genuinely match whatever box `parent` actually is —
      // portrait phone, landscape tablet, desktop window — and ExteriorScene.ts resizes its
      // camera to match on every change, so the camera becomes a real scrolling viewport onto
      // the (still 26x18-tile) world rather than a shrunk-to-fit picture of the entire map.
      scale: {
        mode: Phaser.Scale.RESIZE,
        parent,
        width: parent.clientWidth || window.innerWidth,
        height: parent.clientHeight || window.innerHeight,
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
      // town-builder.md — a real placement is the Hangar's own real work event, same as any
      // cosmetic change there; the actual persistence + rendering already happened in the scene.
      scene.events.on("item-placed", () => {
        const spaceIdForWork = getSpaceId();
        if (spaceIdForWork) recordBuildingWork(spaceIdForWork, "hangar");
      });
      // zoning.md — a real zoning decision is also the Hangar's own real work event, even
      // though zoning itself is free (only building on a zoned tile will later cost anything).
      scene.events.on("tile-zoned", () => {
        const spaceIdForWork = getSpaceId();
        if (spaceIdForWork) recordBuildingWork(spaceIdForWork, "hangar");
      });
      // housing.md — building a real home is also the Hangar's own real work event, same as
      // any other town-builder placement.
      scene.events.on("home-placed", () => {
        const spaceIdForWork = getSpaceId();
        if (spaceIdForWork) recordBuildingWork(spaceIdForWork, "hangar");
      });
      // business.md — building a real business is also the Hangar's own real work event.
      scene.events.on("business-placed", () => {
        const spaceIdForWork = getSpaceId();
        if (spaceIdForWork) recordBuildingWork(spaceIdForWork, "hangar");
      });
      // business.md — stepping onto a real placed business's own door tile opens its overlay,
      // same as any real door-building's "enter-place".
      scene.events.on("enter-business", (businessId: string) => setOverlay({ kind: "business", businessId }));

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
      void playCurrentTrack();
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

  const switchTrack = useCallback(() => {
    void nextTrack();
  }, []);

  const closeOverlay = useCallback(() => {
    // FR3 — leaving a door-building returns to the exact tile you entered from; standalone
    // objects (Soumaya, the Bulletin Board) never moved the player, so nothing to restore.
    if (overlay.kind === "business") {
      sceneRef.current?.returnToBusinessDoor(overlay.businessId);
    } else if (
      overlay.kind !== "none" &&
      overlay.kind !== "capture" &&
      overlay.kind !== "details" &&
      overlay.kind !== "settings" &&
      DOOR_PLACE_IDS.has(overlay.kind)
    ) {
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
      // Town Growth Loop (docs/overworld/town-growth-loop.md, task #69) — the single most
      // central real action in the app previously credited no building at all. Credits the
      // Library: a fresh memory becomes exactly one more real node in the same `graph.nodes`
      // collection LibraryOverlay.tsx's own "shelves" already read, never an invented mapping.
      const spaceIdForWork = getSpaceId();
      if (spaceIdForWork) recordBuildingWork(spaceIdForWork, "library");
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
    // Mobile-first: fills whatever box it's given (portrait phone, landscape tablet, desktop
    // window) — no fixed aspect ratio to letterbox around. AuthGate.tsx's wrapper is already
    // `min-height: 100vh` with nothing else in flow, so 100% here means the real viewport.
    <div style={{ position: "relative", width: "100%", height: "100dvh" }}>
      <div ref={containerRef} data-testid="overworld-canvas-root" style={{ width: "100%", height: "100%" }} />
      {snapshot && (
        <TownHud
          spaceId={spaceId}
          fuel={snapshot.fuel}
          streak={snapshot.streak}
          onZoningStopped={() => sceneRef.current?.clearZoneAnchorMarker()}
        />
      )}
      {/* Real bug fix (2026-09-13): AuthGate.tsx's own "Log out" button is `position: fixed,
          top: 8, right: 8, z-index: 10` — the exact same corner this row used to claim at
          z-index 1, so the higher-z-index logout button rendered on top of and hid 2 of these
          3 buttons. Pushed down below the logout button's real height instead of fighting it
          for the same pixels. */}
      <div style={{ position: "absolute", top: 44, right: 8, zIndex: 1, display: "flex", gap: 4 }}>
        <button
          type="button"
          aria-label="Settings & Help"
          onClick={() => setOverlay({ kind: "settings" })}
          style={{
            background: "#00000099",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 14,
          }}
        >
          ⚙️
        </button>
        <button
          type="button"
          aria-label="Next track"
          onClick={switchTrack}
          style={{
            background: "#00000099",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 14,
          }}
        >
          ⏭️
        </button>
        <button
          type="button"
          aria-label={musicOn ? "Mute music" : "Unmute music"}
          onClick={toggleMusic}
          style={{
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
      </div>
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
      {overlay.kind === "none" && (
        <TouchControls
          onEvent={(event) => inputBusRef.current.emit(event)}
          onHoldChange={(direction) => inputBusRef.current.setHeldDirection(direction)}
        />
      )}

      {overlay.kind === "bank" && snapshot && (
        <BankOverlay rows={snapshot.bank.rows} safeToSpendCents={snapshot.bank.safeToSpendCents} onClose={closeOverlay} />
      )}
      {overlay.kind === "library" && snapshot && (
        <LibraryOverlay graph={snapshot.graph} spaceId={spaceId} onClose={closeOverlay} />
      )}
      {overlay.kind === "sanctuary" && <SanctuaryOverlay spaceId={spaceId} onClose={closeOverlay} />}
      {overlay.kind === "bulletinBoard" && snapshot && (
        <BulletinBoardOverlay graph={snapshot.graph} spaceId={spaceId} onClose={closeOverlay} refresh={refresh} />
      )}
      {overlay.kind === "observatory" && snapshot && (
        <ObservatoryOverlay
          spaceId={spaceId}
          graph={snapshot.graph}
          safeToSpendCents={snapshot.bank.safeToSpendCents}
          dueReviews={snapshot.dueReviews}
          onClose={closeOverlay}
        />
      )}
      {overlay.kind === "postOffice" && <PostOfficeOverlay spaceId={spaceId} onClose={closeOverlay} onOpenPlace={openPlace} />}
      {overlay.kind === "gym" && snapshot && (
        <GymOverlay graph={snapshot.graph} fuel={snapshot.fuel} streak={snapshot.streak} onClose={closeOverlay} />
      )}
      {overlay.kind === "market" && <MarketOverlay spaceId={spaceId} onClose={closeOverlay} />}
      {overlay.kind === "townHall" && <TownHallOverlay spaceId={spaceId} onClose={closeOverlay} />}
      {overlay.kind === "park" && <ParkOverlay onClose={closeOverlay} />}
      {overlay.kind === "mayorsHall" && <MayorsHallOverlay spaceId={spaceId} onClose={closeOverlay} />}
      {overlay.kind === "hangar" && <HangarOverlay spaceId={spaceId} memoriesCount={memoriesCount} onClose={closeOverlay} />}
      {overlay.kind === "business" && <BusinessOverlay spaceId={spaceId} businessId={overlay.businessId} onClose={closeOverlay} />}
      {overlay.kind === "settings" && <SettingsOverlay onClose={closeOverlay} />}
      {overlay.kind === "soumaya" && (
        <SoumayaChatOverlay
          onClose={closeOverlay}
          creatures={snapshot?.creatures ?? []}
          onFlyToNode={flyToNode}
          dueReviews={snapshot?.dueReviews ?? []}
        />
      )}

      {overlay.kind === "capture" && <CaptureMenu onSubmit={handleCaptureSubmit} onClose={closeOverlay} />}
      {overlay.kind === "details" && (
        <CreatureSummaryOverlay
          creature={overlay.creature}
          onGreet={handleGreetConfirm}
          onClose={closeOverlay}
          busy={greetBusy}
          onGraded={() => void refresh()}
        />
      )}
    </div>
  );
}
