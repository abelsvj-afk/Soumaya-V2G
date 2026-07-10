import { AboutMe, Instructions, Knowledge } from "./CompanionSections.js";

/**
 * The 🧠 Companion tab: configure WHO Soumaya is to you.
 *  - About Me: auto-derived, who you are (she's aware, never becomes you).
 *  - Custom Instructions: stackable roles she adopts (collapsible; editable).
 *  - Knowledge: reference docs she retrieves from (txt/md/pdf/docx).
 * (There's no chat here on purpose — talk to her via the 💬 chat button, which
 *  already uses these active roles + knowledge. Kept single to avoid redundancy.)
 */
export function CompanionPanel({ demo, spaceName = "Soumaya" }: { demo?: boolean; spaceName?: string }) {
  if (demo) {
    return <p className="empty">The Companion is available in your own brain — sign in to configure it.</p>;
  }
  return (
    <div className="dock-body">
      <AboutMe />
      <Instructions />
      <Knowledge />
      <p className="companion-hint companion-tryhint">
        💬 Try your active roles + knowledge by talking to {spaceName} — tap the 💬 chat button.
      </p>
    </div>
  );
}
