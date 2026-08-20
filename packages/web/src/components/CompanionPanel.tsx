import { AboutMe, Soul, GroundedInsight, Instructions, Knowledge } from "./CompanionSections.js";

/**
 * The 🧠 Companion tab: configure WHO Soumaya is to you.
 *  - About Me: auto-derived, who you are (she's aware, never becomes you).
 *  - Soul: her deeper character, editable per-brain (refines, never overrides safety).
 *  - Custom Instructions: stackable roles she adopts (collapsible; editable).
 *  - Knowledge: reference docs she retrieves from (txt/md/pdf/docx).
 * (There's no chat here on purpose — talk to her via the 💬 chat button, which
 *  already uses these active roles + knowledge. Kept single to avoid redundancy.)
 */
export function CompanionPanel({ spaceName = "Soumaya" }: { spaceName?: string }) {
  return (
    <div className="dock-body">
      <AboutMe />
      <Soul />
      <GroundedInsight />
      <Instructions />
      <Knowledge />
      <p className="companion-hint companion-tryhint">
        💬 Try your active roles + knowledge by talking to {spaceName} — tap the 💬 chat button.
      </p>
    </div>
  );
}
