import { describe, it, expect } from "vitest";
import { composeLogSystem, LOG_SYSTEM } from "./prompts.js";

/**
 * Phase V (docs/specs/soumaya-weekly-review-communication-integration.md) — soul is
 * injected under its OWN correctly-labeled slot, never blended into `persona`'s
 * "about the user" framing (which would risk the LLM mistaking Soumaya's own
 * character for a fact about the user).
 */
describe("composeLogSystem", () => {
  it("returns the bare LOG_SYSTEM with no options", () => {
    expect(composeLogSystem()).toBe(LOG_SYSTEM);
    expect(composeLogSystem({})).toBe(LOG_SYSTEM);
  });

  it("injects soul under its own 'YOUR DEEPER CHARACTER' heading, not under 'ABOUT THE USER'", () => {
    const s = composeLogSystem({ soul: "Warm, curious, never saccharine." });
    expect(s).toContain("YOUR DEEPER CHARACTER");
    expect(s).toContain("Warm, curious, never saccharine.");
    expect(s.indexOf("YOUR DEEPER CHARACTER")).toBeGreaterThan(s.indexOf(LOG_SYSTEM) - 1);
  });

  it("injects persona under 'ABOUT THE USER', unchanged from the pre-Phase-V wording", () => {
    const s = composeLogSystem({ persona: "Prefers concise updates." });
    expect(s).toContain("ABOUT THE USER (be aware of who you serve, never become them):");
    expect(s).toContain("Prefers concise updates.");
    expect(s).not.toContain("YOUR DEEPER CHARACTER");
  });

  it("includes both, soul before persona, when both are given", () => {
    const s = composeLogSystem({ soul: "Soul text", persona: "Persona text" });
    expect(s.indexOf("YOUR DEEPER CHARACTER")).toBeLessThan(s.indexOf("ABOUT THE USER"));
    expect(s).toContain("Soul text");
    expect(s).toContain("Persona text");
  });

  it("never appends an empty section for an empty/undefined field", () => {
    expect(composeLogSystem({ soul: "", persona: "" })).toBe(LOG_SYSTEM);
  });
});
