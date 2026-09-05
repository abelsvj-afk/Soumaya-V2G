/**
 * Phase M first-launch framing (docs/specs/soumaya-product-audit.md, "no explanation of what
 * Soumaya/the companion/the Galaxy are"). Shown ONCE per space (gated by the caller via
 * localStorage, same pattern as the existing one-time Legend reveal in App.tsx) — a single,
 * short, dismissible card, not a multi-step tour. Copy is deliberately literal about what each
 * part actually does — no claim of omniscience, no implication the Galaxy holds everything.
 */
export function WelcomeIntro({ companionName, onClose }: { companionName: string; onClose: () => void }) {
  return (
    <div className="welcome-overlay" role="dialog" aria-label="Welcome to Soumaya" onClick={onClose}>
      <div className="welcome-card" onClick={(e) => e.stopPropagation()}>
        <h2>👋 Welcome</h2>
        <ul className="welcome-list">
          <li>
            <b>Soumaya</b> is your personal Life + Financial Operating System — your memories,
            goals, money, people, and journeys, all connected in one place instead of scattered
            across separate apps.
          </li>
          <li>
            <b>{companionName}</b> is who you talk to. Ask her about anything you've told her —
            she reasons over what's actually in your galaxy, and says so plainly when something
            isn't in there yet.
          </li>
          <li>
            <b>The Galaxy</b> is the living map of it: each memory becomes a star, sized by how
            much it matters and linked to the goals, people, and money it relates to.
          </li>
        </ul>
        <button className="welcome-start" onClick={onClose}>Let's go →</button>
      </div>
    </div>
  );
}
