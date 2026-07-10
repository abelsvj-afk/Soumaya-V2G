import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb, type DbHandle } from "../db/client.js";
import { soulTextFor, getSpaceSoul, setSpaceSoul, soulText } from "../identity.js";

let handle: DbHandle;
beforeEach(() => {
  handle = createDb(":memory:");
});
afterEach(() => handle.sqlite.close());

describe("per-space editable soul (#5b)", () => {
  it("uses the per-space override when set, falls back to the global soul otherwise", () => {
    // No override yet → falls back to the shared soul.md (whatever it is, incl. "").
    expect(getSpaceSoul(handle.sqlite, "legacy")).toBe("");
    expect(soulTextFor(handle.sqlite, "legacy")).toBe(soulText());

    // Set a brain-specific soul → it wins.
    setSpaceSoul(handle.sqlite, "legacy", "  You are wry and terse.  ");
    expect(getSpaceSoul(handle.sqlite, "legacy")).toBe("You are wry and terse."); // trimmed
    expect(soulTextFor(handle.sqlite, "legacy")).toBe("You are wry and terse.");

    // It's per-space — another brain is unaffected.
    expect(soulTextFor(handle.sqlite, "other")).toBe(soulText());

    // Clearing it (empty) returns to the global fallback.
    setSpaceSoul(handle.sqlite, "legacy", "   ");
    expect(getSpaceSoul(handle.sqlite, "legacy")).toBe("");
    expect(soulTextFor(handle.sqlite, "legacy")).toBe(soulText());
  });
});
