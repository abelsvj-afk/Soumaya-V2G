/**
 * Build queue + worker dispatch (docs/overworld/build-queue-dispatch.md, task #123) — lets the
 * player designate a zoning tile/rectangle or a decor item for a real Hangar attendant to build
 * later, instead of applying it under their own hands right now. Pure, localStorage-backed, same
 * convention as zoning.ts/townBuilder.ts.
 *
 * Deliberately does NOT track which worker is executing what — that's ephemeral, scene-local
 * state (ExteriorScene.ts's own claimedOrderIds Set), the same convention NPC outings/Town
 * Meetings already use for "who's currently walking where" (never persisted; a reload just
 * leaves an in-flight order available for the next free worker to pick up — a paid item order's
 * real treasury spend already happened once, at the Hangar's own `armItem` time (this module
 * never spends the treasury itself — see `queueArmedItem`'s own doc comment), so a reload can
 * never lose or double-spend money, only at worst re-attempt an order that was already in
 * flight).
 */

import type { ZoneType } from "./zoning.js";
import { applyZoneRect, applyZoneTile, isTileZonable, zonableTilesInRect } from "./zoning.js";
import { PLACEABLE_ITEMS, isTileFreeForPlacement, placeItemDirectly } from "./townBuilder.js";
import { refundToTreasury } from "./townLedger.js";

export type WorkOrderKind = "zone-tile" | "zone-rect" | "item";

export interface WorkOrder {
  id: string;
  kind: WorkOrderKind;
  /** zone-tile / item: one tile, (x0,y0) === (x1,y1). zone-rect: the rectangle's own two
   *  corners, already normalized (x0<=x1, y0<=y1). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Set for zone-tile / zone-rect only. */
  zoneType?: ZoneType;
  /** Set for item only. */
  itemId?: string;
  /** Captured at enqueue time (never re-derived from the catalog later) so a cancel/stale-drop
   *  refund is always exactly what was actually spent. 0 for zoning orders, which are free. */
  priceCents: number;
}

function queueKey(spaceId: string): string {
  return `brain.buildQueue.orders.${spaceId}`;
}

function dispatchModeKey(spaceId: string): string {
  return `brain.buildQueue.dispatchMode.${spaceId}`;
}

export function queuedOrders(spaceId: string): WorkOrder[] {
  try {
    const raw = JSON.parse(localStorage.getItem(queueKey(spaceId)) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveQueue(spaceId: string, orders: WorkOrder[]): void {
  try {
    localStorage.setItem(queueKey(spaceId), JSON.stringify(orders));
  } catch {
    /* the treasury spend (if any) already happened — worst case this order isn't remembered */
  }
}

function nextOrderId(spaceId: string): string {
  return `${spaceId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Whether "queue it for a crew" is the player's current default for the walk-there-and-interact
 *  targeting every arm-then-place flow already uses (zoning.ts / townBuilder.ts) — a toggle, not
 *  a separate arm-state machine, so it needs zero changes to how a tile/item is designated
 *  (build-queue-dispatch.md's own resolved decision). Defaults to false (today's exact behavior:
 *  an interact press applies the effect immediately under the player's own hands). */
export function dispatchModeEnabled(spaceId: string): boolean {
  try {
    return localStorage.getItem(dispatchModeKey(spaceId)) === "1";
  } catch {
    return false;
  }
}

export function setDispatchModeEnabled(spaceId: string, enabled: boolean): void {
  try {
    localStorage.setItem(dispatchModeKey(spaceId), enabled ? "1" : "0");
  } catch {
    /* nothing to do — worst case the toggle reverts to manual placement */
  }
}

export function enqueueZoneTile(spaceId: string, x: number, y: number, type: ZoneType): WorkOrder | null {
  if (!isTileZonable(spaceId, x, y)) return null;
  const order: WorkOrder = { id: nextOrderId(spaceId), kind: "zone-tile", x0: x, y0: y, x1: x, y1: y, zoneType: type, priceCents: 0 };
  saveQueue(spaceId, [...queuedOrders(spaceId), order]);
  return order;
}

/** Queues a whole rectangle as one order (mirrors zoning.ts's own `zoneRectangle` area-mode
 *  shape) — the actual per-tile zoning happens all at once when a worker completes it, not
 *  tile-by-tile as they walk. Corners are normalized so either can be passed in either order.
 *  Returns null if the rectangle contains no zonable tile at all right now. */
export function enqueueZoneRect(spaceId: string, x0: number, y0: number, x1: number, y1: number, type: ZoneType): WorkOrder | null {
  if (zonableTilesInRect(spaceId, x0, y0, x1, y1).length === 0) return null;
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const order: WorkOrder = { id: nextOrderId(spaceId), kind: "zone-rect", x0: minX, y0: minY, x1: maxX, y1: maxY, zoneType: type, priceCents: 0 };
  saveQueue(spaceId, [...queuedOrders(spaceId), order]);
  return order;
}

/** Queues one decor item that's ALREADY armed (bought — `armItem` already spent its real price
 *  and set the armed state) — the dispatch-mode toggle's own item path reuses the exact same
 *  "arm in the Hangar, then walk up and interact" targeting every manual placement already uses;
 *  only what interact DOES at that tile changes. Deliberately does not touch the treasury itself
 *  (mirrors `placeArmedItem`'s own doc comment: the spend already happened at `armItem` time) —
 *  the order's own captured `priceCents` (still read from the catalog, for a later cancel/
 *  stale-drop refund) is bookkeeping only, never a second charge. Returns null, changing
 *  nothing, if the itemId is unknown or the tile isn't free right now. The caller is
 *  responsible for clearing the armed state afterward (same as `placeArmedItem` leaves to its
 *  own caller in the immediate-placement path). */
export function queueArmedItem(spaceId: string, x: number, y: number, itemId: string): WorkOrder | null {
  const item = PLACEABLE_ITEMS.find((i) => i.id === itemId);
  if (!item) return null;
  if (!isTileFreeForPlacement(spaceId, x, y)) return null;
  const order: WorkOrder = { id: nextOrderId(spaceId), kind: "item", x0: x, y0: y, x1: x, y1: y, itemId, priceCents: item.priceCents };
  saveQueue(spaceId, [...queuedOrders(spaceId), order]);
  return order;
}

/** Cancels a still-pending order, refunding its real price if it was a paid item order (zoning
 *  orders are always free, matching zoning.ts's own decision #3). Returns false, changing
 *  nothing, if no such order is still pending (it may already have been completed). */
export function cancelOrder(spaceId: string, orderId: string): boolean {
  const orders = queuedOrders(spaceId);
  const order = orders.find((o) => o.id === orderId);
  if (!order) return false;
  if (order.priceCents > 0) refundToTreasury(spaceId, order.priceCents);
  saveQueue(spaceId, orders.filter((o) => o.id !== orderId));
  return true;
}

/** Applies a claimed order's real effect once a dispatched worker has arrived and worked it —
 *  re-validates the target at completion time (real time has passed since it was queued; the
 *  target may have gone stale), silently dropping it — refunding a paid item order — rather than
 *  erroring, the same no-dark-patterns tolerance every other placement miss already uses.
 *  Removes the order from the queue either way. Returns true if the real effect landed. */
export function completeOrder(spaceId: string, orderId: string): boolean {
  const orders = queuedOrders(spaceId);
  const order = orders.find((o) => o.id === orderId);
  if (!order) return false;
  let applied = false;
  if (order.kind === "zone-tile" && order.zoneType) {
    applied = applyZoneTile(spaceId, order.x0, order.y0, order.zoneType);
  } else if (order.kind === "zone-rect" && order.zoneType) {
    applied = applyZoneRect(spaceId, order.x0, order.y0, order.x1, order.y1, order.zoneType).length > 0;
  } else if (order.kind === "item" && order.itemId) {
    const placed = placeItemDirectly(spaceId, order.itemId, order.x0, order.y0);
    applied = placed !== null;
    if (!applied && order.priceCents > 0) refundToTreasury(spaceId, order.priceCents);
  }
  saveQueue(spaceId, orders.filter((o) => o.id !== order.id));
  return applied;
}
