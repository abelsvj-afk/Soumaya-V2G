# Spec — Chat-approved memories become celestial bodies Soumaya places

> Per [AI_ENGINEERING_WORKFLOW.md](../AI_ENGINEERING_WORKFLOW.md) (design + verify before code).
> Status: **VERIFIED already-wired; one wording polish.**

## 🎯 Objective

When the user approves a memory from a conversation (the per-message ＋ save, or an
end-of-chat distill proposal), it should be turned into the **appropriate celestial
body** and **physically placed** by Soumaya — the same ferry-from-the-dock bloom that
panel ingests get — not just popped into the graph.

## Blast-radius check (the "verify" step)

Traced the data flow rather than assuming:

1. `ChatDock.saveMemory` / `approveProposal` → `ingestText(text)` → `onCreated(ids)`.
2. App wires `onCreated={(ids) => void refresh(ids)}` → `refresh` calls `setData(getGraph())`.
3. `Graph3D`'s data-sync effect (runs on **every** `data` change — not gated to ingests)
   diffs node ids: any id not in `knownNodesRef` is parked at the station dock, `hold()`
   in the orbit system, and pushed to `soumayaHandleRef.enqueuePlacements(...)`.
4. Soumaya's `placePickup`/`placeCarry` modes fly out, tow it into its live orbit slot,
   `release()` it, and bloom it.
5. The **celestial class** is derived on read by the graph service (`deriveMass` → `classify`)
   and the **color** by the taxonomy (`colorForType`); the ingestion pipeline already typed
   the node (Person/Project/… via the extractor or offline heuristic).

**Conclusion:** chat-approved memories already become the right body and are ferried/placed
by Soumaya, because they share the exact pipeline + `refresh`→`data` path as panel ingests.
Per the repo rule "never re-fix code measurement shows is already correct," no ferry/
placement code is added.

## The one change (polish)

The chat confirmations said "Saved to your galaxy ✦" / "Added to your galaxy ✦", which
doesn't convey that *Soumaya is placing it*. Reworded so the behavior reads:
"Soumaya is charting it into your galaxy ✦". `refresh(ids)` already flies the camera to the
new body so the ferry is visible.

## Verification

- Gate green (typecheck · tests · build).
- Manual (on-device, after deploy): in chat, ＋-save a line or approve an end-of-chat
  note → Soumaya flies from the dock, tows the new body into a slot, and blooms it; its
  color matches its kind. (Spatial/visual — confirm on device, per "verify before build".)
