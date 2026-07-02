import { useState } from "react";
import { SATELLITE_LORE, SATELLITE_NAME } from "../graph/satellites.js";

interface Props {
  onClose: () => void;
  installPrompt?: any;
  onInstall?: () => void;
}

interface HelpItem {
  icon?: string;
  title: string;
  body: string;
  tags?: string[];
}

const CATEGORIES: {
  id: string;
  title: string;
  icon: string;
  desc: string;
  items: HelpItem[];
}[] = [
  {
    id: "start",
    title: "Getting Started",
    icon: "🌱",
    desc: "Your private brain, dumping raw thoughts, bringing in documents, and how a thought becomes a star.",
    items: [
      { icon: "🔐", title: "Your private brain", body: "Each brain is a private space protected by a name + passcode (no email needed). Sign in and your galaxy is yours alone — memories, links and progress are scoped to your space and never mix with anyone else's. The passcode is the only key, so keep it safe.", tags: ["login", "private", "space", "passcode", "account", "brain"] },
      { icon: "➕", title: "Dump a thought", body: "Tap the ＋ button to open 'Dump a thought' and write anything — a business idea, a reflection, a worry, a random spark. You don't organize it; the system reads it, extracts what matters, embeds it, and places it in your galaxy automatically. Brain-dump freely; structure emerges on its own.", tags: ["log", "memory", "capture", "ingest", "dump", "note", "add"] },
      { icon: "🏷️", title: "Add context & tags", body: "The optional second field is for the why — backstory, related people, how it makes you feel. Add tags to nudge how it links and clusters. More context means richer auto-connections and a more accurate importance rating, but a one-line thought works perfectly too.", tags: ["context", "tags", "importance", "detail", "emotion"] },
      { icon: "📄", title: "Bring in documents", body: "You can feed in existing material as well as fresh thoughts — paste long text, or import a document (PDF / Word / text). It's distilled into memories and woven into the same galaxy, so your notes and your knowledge live together.", tags: ["document", "pdf", "docx", "import", "file", "upload", "knowledge"] },
      { icon: "📎", title: "Attach files to a memory", body: "Open any memory's Details (ⓘ) and use '📎 Attachments · + Add file' to keep a document right on that memory — a PDF, an image, a contract, a source note. It's stored with the memory and downloadable anytime with one tap, so the original lives alongside the thought instead of getting lost in a downloads folder. (Small files; big archives are best imported as text.)", tags: ["attachment", "attach", "file", "document", "download", "pdf", "image", "memory"] },
      { icon: "✨", title: "From thought to star", body: "Every memory you log becomes a celestial body. The AI rates its importance, links it to related thoughts by meaning, and gives it mass — so it appears as anything from a tiny asteroid to a blazing supergiant. Watch new memories get ferried into place by your companion as you add them.", tags: ["star", "mass", "celestial", "ingest", "pipeline"] }
    ]
  },
  {
    id: "navigation",
    title: "Controls & Flight",
    icon: "🛸",
    desc: "How to steer your camera, orbit clusters, isolate systems, lock targets, and fly through space.",
    items: [
      { icon: "🖐️", title: "Move and Orbit", body: "Click and drag (or drag with touch) anywhere on the background space to orbit the camera around the active focal point, allowing you to view your thought constellations from any angle.", tags: ["camera", "drag", "orbit", "steer", "navigation"] },
      { icon: "＋/－", title: "Flight Zoom", body: "Click the ＋ or − zoom buttons on the HUD to FLY your camera forward and backward in 3D space, rather than just scaling. This allows you to fly directly into high-density sectors.", tags: ["zoom", "fly", "hud", "buttons"] },
      { icon: "⊙", title: "Recenter focal lock", body: "Click the recenter icon to release any active focus targets, re-frame the entire galaxy at the center of your screen, and restore default camera distances.", tags: ["recenter", "focus", "focal", "reset"] },
      { icon: "🎯", title: "Focus & isolate a memory", body: "Click any memory to focus it and read its details. From the details panel you can 'isolate' its system — hiding the rest of the galaxy so you see just that memory and everything orbiting it, the cleanest way to study one cluster.", tags: ["focus", "isolate", "system", "cluster", "select"] },
      { icon: "🛸", title: "Focus Companion's ship", body: "Click the focus ship button (or select the companion ship in space) to lock the camera directly onto her flight path. The camera will follow her automatically, allowing you to inspect her tending tasks.", tags: ["ship", "camera", "follow", "focal"] },
      { icon: "🎥", title: "Cockpit vs Orbit camera", body: "In the companion tab you can switch her follow camera between Orbit Follow (a cinematic chase view) and Cockpit Lock (ride along from the ship itself). Cockpit makes her maintenance runs feel like flying the galaxy first-person.", tags: ["cockpit", "camera", "view", "first-person", "orbit"] },
      { icon: "🌐", title: "Focus the Waystation", body: "Snap your camera focal lock onto Waystation Soumaya-Prime, the central megastructure orbiting the galaxy.", tags: ["station", "structure", "orbit", "focal"] },
      { icon: "🪐", title: "Visit your Megastructures", body: "Background figurines you've unlocked (and the black-hole Singularity) sit far out in deep space. Enable their HUD focus button in the Hangar, then tap it to fly all the way out and see your monuments up close — including ones you're still working toward.", tags: ["figurine", "megastructure", "focus", "blackhole", "singularity", "monument"] },
      { icon: "🛰️", title: "Jump to Aura beacons", body: "Click the beacon hotkeys or click a beacon physically in space. Beacons take orbit over memories going cold, giving you quick jumping points to stars that need tending.", tags: ["beacon", "jump", "cooling", "tending"] },
      { icon: "☄️", title: "Flashback Comet", body: "Tap the comet icon in the HUD to trigger a random serendipitous jump, launching the camera on a fast flight to a high-importance memory from the past.", tags: ["comet", "flashback", "random", "serendipity"] },
      { icon: "🔈", title: "Ambient soundscapes", body: "Toggle the space drone soundtrack on and off directly from the audio control chip on the interface.", tags: ["audio", "music", "drone", "sound"] },
      { icon: "🔉", title: "Interface sounds & haptics", body: "The app has a subtle sound kit — a soft tap on buttons, a warm chime when a memory saves, a distinct sting for achievements, a notification cue, and a home motif on your welcome-back. Soumaya's ship has a real engine — a jet startup that settles into a sustained thruster loop — that you only hear when you're focused on her (tap the focus-ship button or zoom in close); it fades away when you look elsewhere. Sounds sit on top of the music (which briefly ducks so cues punch through); toggle it all under Settings ⚙️ → Interface sounds. Respects your device's reduced-motion setting.", tags: ["sound", "sfx", "audio", "haptics", "feedback", "clicks", "thruster", "propulsion", "ship", "settings"] }
    ]
  },
  {
    id: "rules",
    title: "Galaxy & Gravity",
    icon: "🪐",
    desc: "The rules of deep space: semantic orbits, entropy, cooling, and lore evolution.",
    items: [
      { icon: "🌌", title: "Constellations & Orbits", body: "Every memory behaves as a physical body with real gravity. Its mass—which determines its size and physical scale—is dynamically calculated from its connection count, emotional importance, and user-assigned significance. Heavy memories pull lighter thoughts into orbit around them, organizing your brain by association rather than folder structures.", tags: ["gravity", "size", "mass", "orbit", "connections"] },
      { icon: "🔌", title: "Auto-Semantic Connections", body: "When you log a new thought, it is automatically vectorized and linked to the nearest thoughts in meaning—completely bypassing the chore of manual tagging. Over time, these links naturally coalesce into cosmic clusters and constellations.", tags: ["links", "vector", "ai", "semantic", "automatic"] },
      { icon: "🧬", title: "Living synapses (the links)", body: "The lines between memories are living synapses — they're always visible and never disappear. Each one rests on a colour set by the emotion of the two memories it joins: green for a neutral spark, warm gold for joyful ones, and indigo for heavy ones. When Soumaya tends a connection she makes it flare bright like a neuron firing, then it eases back to its resting colour over a few days. She's energizing the link, never drawing or erasing it.", tags: ["links", "synapse", "connections", "colour", "emotion", "green", "gold", "pulse", "neuron"] },
      { icon: "❄️", title: "Entropy (Cooling & Neglect)", body: "Untended memories slowly cool down, fading in color and drifting towards a cold blue. Highly connected memories cool down much slower. To warm a memory back up, simply view it (focal lock) to inject user energy.", tags: ["entropy", "cooling", "blue", "tending", "energy"] },
      { icon: "☄️", title: "Star Classification & Tints", body: "Memories are classified from Asteroid to Moon, Planet, Gas Giant, Giant, Star, and Supergiant based on importance. Newly created stars burn hot white; older unconnected stars redshift over time into a weathered copper glow, leaving a visual fossil record.", tags: ["classification", "star", "white", "redshift", "fossil"] },
      { icon: "❇️", title: "Emerald Energy Ripples", body: "Performing manual updates (like manually adjusting importance sliders or forging paths) triggers a green glowing wave of user energy radiating through the surrounding connections.", tags: ["ripples", "green", "energy", "importance"] },
      { icon: "📖", title: "Chronicle & Lore Evolution", body: "Every memory keeps an append-only Chronicle—an evolving story tracking its life cycle. Tap '✦ Evolve' in details to let the AI write a new chapter connecting it to recent events, or watch the companion add chapters on her own.", tags: ["chronicle", "lore", "chapters", "evolve", "story"] }
    ]
  },
  {
    id: "structure",
    title: "Structure & Taxonomy",
    icon: "🗂️",
    desc: "How your brain organizes itself — memory types, constellation hubs (MOCs), sectors, tags, and provenance. There are no folders; structure emerges.",
    items: [
      { icon: "🏷️", title: "Memory types (the taxonomy)", body: "Every memory is auto-classified into a kind so the galaxy is navigable by type, not folders: Person (someone you know), Company (an org/team), Project (an effort with an outcome), Decision (a choice + its rationale), Meeting (a conversation at a point in time), Daily (a journal note / to-do / fleeting thought), Knowledge (a reference fact or learning), Concept (an abstract idea or theme), and Other. Each kind has its own color in the galaxy and the List legend.", tags: ["taxonomy", "types", "kinds", "person", "project", "decision", "knowledge", "concept", "classify", "folders"] },
      { icon: "🌌", title: "Constellations (Maps of Content / MOCs)", body: "When a cluster of related memories grows dense, you can promote it into a Constellation — a named, persistent hub memory (a 'Map of Content') that summarizes and anchors the whole group. From the Insights tab, tap '✦ Save as constellation', give it a name, and it renders as a bright golden hub you can navigate from. It's how big bodies of work get a single front door without imposing rigid folders.", tags: ["moc", "constellation", "hub", "map of content", "cluster", "promote", "summary"] },
      { icon: "🌌", title: "Sectors (browse by type)", body: "The Sectors tab (🌌) groups the galaxy by memory type — all your People, Projects, Decisions, Daily notes, and so on — so you can explore one category of your mind at a time and isolate it in the 3D view. It's a lens over the same emergent galaxy, not a separate filing system.", tags: ["sectors", "browse", "type", "group", "category", "lens"] },
      { icon: "🪟", title: "Tags & life-areas", body: "Tags are optional labels you add when dumping a thought (Work, Health, Money, People, Learning, plus moods). They nudge clustering and power the life-area lens in Insights, which groups your memories into broad areas of life (Work & Projects, Relationships, Health, Money, Identity & Growth) so you can see where your attention actually goes. Tagging is never required — meaning-based auto-linking does the heavy lifting.", tags: ["tags", "life-area", "lens", "labels", "work", "health", "money"] },
      { icon: "✦", title: "Provenance (who charted it)", body: "Memories remember their origin. Ones you logged are yours; ones your companion created (a synthesized hub, a researched expansion) are marked '✦ Charted by Soumaya' in their details, so you always know what came from you versus from her.", tags: ["provenance", "origin", "charted", "agent", "soumaya", "authorship"] },
      { icon: "🪐", title: "Drifting (orphan memories)", body: "Memories with no connections are 'drifting' — you can filter for them in the List tab (🪐). They're candidates to link, fold into a constellation, or revisit. It keeps stray thoughts from getting lost in the dark.", tags: ["drifting", "orphan", "isolated", "lint", "unlinked", "list"] }
    ]
  },
  {
    id: "talk",
    title: "Talk & Companion",
    icon: "💬",
    desc: "Chat with your brain for cited answers, save conversations as memories, and shape your companion's voice.",
    items: [
      { icon: "💬", title: "Chat with your brain", body: "Tap the 💬 button to talk to Soumaya. Ask questions in plain language ('what was I thinking about that project?', 'connect these two ideas') and she answers from YOUR memories, not the open web — a real back-and-forth conversation grounded in your own galaxy.", tags: ["chat", "ask", "conversation", "graphrag", "question"] },
      { icon: "🔎", title: "Grounded, cited answers", body: "Her answers are drawn from the memories most related to your question and come with the sources she used, so you can click straight to the stars behind any reply. If your brain doesn't hold the answer, she'll say so rather than invent one.", tags: ["cited", "sources", "grounded", "answers", "retrieval"] },
      { icon: "💾", title: "Save a reply as a memory", body: "Any line of a conversation can be saved into the galaxy as a real memory, so a good insight that surfaces mid-chat becomes a permanent star — linked into your brain like anything else you log.", tags: ["save", "memory", "chat", "capture"] },
      { icon: "🪄", title: "Distilled notes", body: "At the end of a conversation she proposes a few memory-worthy notes distilled from what you discussed. Keep the ones that matter with a tap and they're woven into your galaxy — turning a chat into lasting knowledge.", tags: ["distill", "notes", "summary", "proposals", "keep"] },
      { icon: "🎭", title: "Companion: Custom Instructions", body: "Open the Companion tab (🧠) to define custom instructions and personas — roles she can take on (coach, analyst, devil's advocate…). Enable, edit, or switch them so her tone and focus match what you need right now.", tags: ["companion", "instructions", "persona", "roles", "custom"] },
      { icon: "📚", title: "Companion: Knowledge", body: "Give your companion reference material under Knowledge — documents and notes she should always consider when answering. It blends with your memories so replies reflect both your brain and the context you've handed her.", tags: ["knowledge", "documents", "reference", "companion"] },
      { icon: "🪪", title: "Companion: About Me", body: "Fill in 'About Me' so your companion knows who you are — your goals, voice, and what you care about. She uses it to personalize how she talks to you and what she surfaces.", tags: ["about", "persona", "profile", "identity", "voice"] },
      { icon: "🛰️", title: "Soumaya's daily digest", body: "Your companion writes a daily digest — a short captain's-log summary of how your galaxy evolved, what she tended, and what's worth your attention. Find it in her tab to stay in touch without scrolling the whole brain.", tags: ["digest", "daily", "summary", "captain's log", "soumaya"] },
      { icon: "🌙", title: "While you were away", body: "Soumaya keeps tending your galaxy in the background even when the app is closed — connecting related memories, expanding important ones, keeping things tidy. When you come back after a while, she greets you with a 'While you were away' card: what she did, any contradictions she found, reminders that came due, and a memory worth resurfacing today. It turns the app from a storage box into a companion that's been working for you.", tags: ["away", "background", "welcome back", "return", "autonomous", "companion", "resurface"] }
    ]
  },
  {
    id: "explore",
    title: "Organize & Explore",
    icon: "🗂️",
    desc: "Browse, search, group by sector, track action items, and surface the latent connections hiding in your brain.",
    items: [
      { icon: "ⓘ", title: "Memory details", body: "The Details tab (ⓘ) shows everything about the selected memory — its text, type, importance, connections, Chronicle, and actions to evolve, isolate, edit or delete it. It's the cockpit for working on a single thought.", tags: ["details", "inspector", "edit", "memory", "info"] },
      { icon: "📋", title: "Memory list", body: "The List tab (📋) is a flat, scrollable index of every memory in your brain — handy for jumping straight to something by reading titles instead of hunting in 3D.", tags: ["list", "index", "browse", "all"] },
      { icon: "🌌", title: "Sectors", body: "The Sectors tab (🌌) groups your galaxy by type — people, projects, decisions, daily logs, ideas and more — so you can explore one category of your mind at a time and isolate it in the view.", tags: ["sectors", "types", "categories", "group", "filter"] },
      { icon: "📖", title: "The Codex (your living atlas)", body: "The Codex tab (📖) is a collectible atlas of your galaxy. Entries start locked and are DISCOVERED as your galaxy grows — the named sectors of your mind (Kinship Reaches, Forge Fields, the Deep Field…), your constellations, the celestial bodies a memory can become (up to the black-hole Singularity at 365 memories), your fleet, and rare phenomena Soumaya uncovers. Each entry LEVELS UP the more you engage, there's an overall completion %, and every new discovery earns you a little fuel. The Codex covers everything you DISCOVER; Awards cover feats you DO — the two never double-reward, and completing the whole Codex earns the one crossover badge, Galactic Atlas.", tags: ["codex", "atlas", "collect", "unlock", "discover", "sectors", "lore", "completion", "gamification"] },
      { icon: "📚", title: "Library (folders you can read & export)", body: "The Library tab (📚) is the 'open the drawer and read it' view: every memory filed into folders by kind — People, Companies, Projects, Decisions, Meetings, Daily notes, Knowledge, Concepts, and Constellations (MOCs). Open a folder to read the notes inside, click any one to fly to it in the galaxy, and download a single note, a whole folder, or your entire brain as Markdown (⬇). It's the plain-text, browsable, exportable counterpart to the 3D galaxy — ideal when you just want a rundown of what's in each group.", tags: ["library", "folders", "export", "download", "markdown", "read", "browse", "backup", "moc"] },
      { icon: "✅", title: "Agenda & action items", body: "Thoughts that imply a to-do surface in the Agenda tab (✅) as action items you can tick off. Completing them tends your brain and earns fuel — your reflections turn into a working task list.", tags: ["agenda", "tasks", "action items", "todo", "reminders"] },
      { icon: "✨", title: "Insights: latent connections", body: "The Insights tab (✨) is the synthesis digest — it surfaces non-obvious links between distant memories you'd never have spotted, the 'aha' connections that make a second brain worth having. Tap one to fly to it.", tags: ["insights", "synthesis", "latent", "connections", "digest", "serendipity"] },
      { icon: "⚡", title: "Insights: find contradictions", body: "In the Insights tab, tap '⚡ Find contradictions' to scan your same-topic memories for conflicts — a belief you changed, a goal you reversed, a shifting view of yourself. Each one shows both memories and a gentle reconciliation hypothesis so you can make peace with the tension or notice you've grown.", tags: ["contradiction", "conflict", "reconcile", "belief", "goal", "identity", "insights"] },
      { icon: "🌡️", title: "Insights: emotional weather", body: "The Insights tab also charts your 'emotional weather' — a mood-over-time sparkline drawn from the feeling in each memory, plus detected patterns (stress cycles, upswings, burnout risk, volatile stretches) with the trigger behind them and a gentle suggestion. It's a self-reflection mirror, computed privately on your own brain.", tags: ["emotional", "mood", "trajectory", "stress", "burnout", "pattern", "wellbeing", "insights"] },
      { icon: "💤", title: "Insights: dormant & worth reviving", body: "The Insights tab surfaces 'dormant' memories — skills, goals and projects that once mattered to you but have gone quiet (you haven't visited them in weeks). Each shows how long it's been silent and a hypothesis for why it faded, so you can decide to revive it or let it go. Tap one to fly straight to it (and visiting it warms it back up).", tags: ["dormant", "latent", "revive", "skill", "goal", "project", "abandoned", "reactivate", "insights"] },
      { icon: "🔗", title: "Insights: how your thinking evolved", body: "The Insights tab traces evolution chains — two memories on the same theme recorded far apart in time, shown older → newer with how strongly they relate, the gap between them, and how your mood around the topic shifted. It's a way to see your beliefs, goals and identity drift across months, not just a snapshot. Tap either end to fly to it.", tags: ["evolution", "temporal", "chain", "drift", "over time", "goal evolution", "identity", "insights"] },
      { icon: "🪟", title: "Insights: life-area lens", body: "The Insights tab includes a 'life-area lens' — an optional overlay that groups your memories into broad areas of life (Identity & Growth, Relationships, Work & Projects, Health, Money) and shows the balance between them, so you can see where your attention actually goes. It's a lens over the same emergent galaxy, never a folder system — your memories still cluster by meaning.", tags: ["life-area", "lens", "balance", "attention", "work", "health", "money", "relationships", "insights"] },
      { icon: "🔍", title: "Insights: Soumaya's self-check", body: "At the top of the Insights tab, Soumaya runs a read-only self-check — what she may be missing or that's worth your attention: drifting memories with no links, important blind spots she hasn't deep-dived, memories cooling from neglect, and contradictions awaiting reconciliation. She reports it rather than silently acting, so you stay in control.", tags: ["self-check", "coverage", "review", "drifting", "blind spots", "gaps", "insights"] },
      { icon: "🗃️", title: "When she researches (and when she doesn't)", body: "Not every thought needs deep research. After you dump a memory, you'll see either '🔬 may deep-dive in Research Mode' (a weighty memory worth expanding) or '🗃️ stored, no research needed' (a lighter note that's simply filed). It's how the system avoids wasting effort — only the consequential stuff gets her attention.", tags: ["research", "no research", "stored", "deep-dive", "weight", "noise"] },
      { icon: "🔭", title: "The Observatory (home)", body: "The Observatory is your home view — a calm overview that greets you after the cinematic fly-in with the state of your brain. Reopen it any time from the 🔭 button to get your bearings.", tags: ["observatory", "home", "overview", "dashboard"] },
      { icon: "🔔", title: "Inbox & reminders", body: "The Inbox tab (🔔) collects what needs you — reminders coming due, action items that cleared, memories going cold, and companion notices. A red badge shows how many are unseen.", tags: ["inbox", "notifications", "reminders", "alerts", "badge"] },
      { icon: "🔍", title: "Search your galaxy", body: "Use search to find any memory by meaning, not just keywords — type what you remember and the closest thoughts surface, ready to focus.", tags: ["search", "find", "semantic", "lookup"] }
    ]
  },
  {
    id: "fleet",
    title: "Economy & Fleet",
    icon: "⚡",
    desc: "Manage Research Mode, fuel cells, and check the roles of your autonomous fleet.",
    items: [
      { icon: "⛽", title: "Celestial Fuel", body: "A free energy currency earned by actively tending your brain — logging memories (+3), each link forged (+0.5), clearing agenda items (+1.5), your daily streak (+2) and Codex discoveries (+4). It trickles back slowly on its own (2/hour), but real income comes from real tending. Soumaya spends it on deep-dive research and sector charting (2 per job) — spends now pop in red on the fuel gauge, and asking her to tend a memory shows its price up front. Her core maintenance always runs free.", tags: ["fuel", "economy", "tending", "energy", "spend", "earn", "regen"] },
      { icon: "🔬", title: "Research Mode", body: "Toggle Research Mode in the Soumaya tab (🛰️) or Settings. It's private to YOUR brain — flipping it never affects anyone else on the deployment. When active, she consumes fuel to scan the frontier of your graph, searching for isolated ideas and forging new links.", tags: ["research", "mode", "toggle", "gaps", "connections"] },
      { icon: "🎯", title: "How she prioritizes research", body: "Soumaya doesn't research at random. She scores under-connected memories by how consequential they are — strong emotion, being caught in a contradiction, identity statements, long-term goals, recurring themes — and deep-dives the most meaningful blind spot first, skipping low-signal one-offs entirely so fuel is never wasted on noise. Each research entry in her activity log says what it was 'prioritized for'.", tags: ["research", "priority", "score", "decision", "emotion", "identity", "goals"] },
      { icon: "🔔", title: "She announces her decisions", body: "Whenever Soumaya chooses to do something consequential — deep-dive research on a memory, fuse two duplicates, chart a sector, or write the daily log — she announces it with a notification (a toast that also lands in your Inbox 🔔). Routine patrols and pruning stay quiet. So you're always aware of the meaningful moves she's making, not just discovering them afterward in her activity log.", tags: ["notification", "decision", "awareness", "toast", "inbox", "research", "announce"] },
      { icon: "🛰️", title: "Fleet: Companion Starpilot", body: "Your main autonomous vessel. She flies between hubs, bridges semantic gaps, prunes duplicate notes, and writes the daily Captain's Log summarizing the evolution of your galaxy.", tags: ["ship", "starpilot", "maintenance", "log"] },
      { icon: "📡", title: "Fleet: Aura Beacons", body: "Warming relays dispatched to orbit cooling stars. Beacons project energy beams colored by the star's underlying emotion (warm gold for joy, cool blue for heavy thoughts).", tags: ["beacon", "relays", "beams", "emotion"] },
      { icon: "🛰️", title: `Fleet: ${SATELLITE_NAME}s`, body: SATELLITE_LORE, tags: ["satellite", "sentinels", "beacons"] },
      { icon: "🏹", title: "Fleet: The Scout & Defender", body: "The Scout ship surveys the frontier, looking for the loneliest, isolated memories. The Defender guards your heaviest hub, intercepting system anomalies and maintaining spatial stability.", tags: ["scout", "defender", "frontier", "hubs"] }
    ]
  },
  {
    id: "hangar",
    title: "Hangar, Awards & Settings",
    icon: "🏆",
    desc: "Unlock custom hulls and trails, mount deep-space megastructures, earn badges, and tune your preferences.",
    items: [
      { icon: "🛠️", title: "The Hangar Customizer", body: "Open the Hangar tab (🛠️) to customize your companion's ship. Swap the hull skin (Default Scout, Organic Specimen, Fusion Core Destroyer, Holographic Sentinel) — each earned through play — and pick an exhaust trail.", tags: ["hangar", "skins", "hull", "ship", "customization"] },
      { icon: "✨", title: "Engine trails", body: "Choose your companion's cosmic exhaust trail. Blue Nebula is default; Hyperdrive Neon, Solar Gold and Void Purple unlock through achievements (Consistent Pilot, Sector Pioneer, Grand Restorer).", tags: ["trail", "exhaust", "neon", "gold", "purple", "color"] },
      { icon: "🏆", title: "Achievements (Awards tab)", body: "Awards are FEATS — things you actively did: weave 25+ connections, keep every memory warm (Keeper of the Flame), hold a tending streak (Consistent Pilot), restore cold memories (Grand Restorer), deploy beacons, build a 5-memory path. Simple discoveries (first memory, first link, star class…) live in the Codex instead, and your memory COUNT is celebrated once, by Pilot Rank — no more triple toasts for one milestone. The Awards tab (🏆) shows every badge with a progress hint.", tags: ["achievements", "badges", "awards", "unlocks", "progress", "feats", "rank"] },
      { icon: "🪐", title: "Deep-space megastructures", body: "Unlock colossal background figurines and mount them in two slots far out in space: the Solar Monument (100 memories), Dyson Megastructure (250), plus achievement-gated ones — Quantum Singularity Core, Synapse Hyper-Array and Aegis Shield Spire. Enable each one's HUD focus button to fly out and admire it.", tags: ["figurine", "megastructure", "dyson", "monument", "slots"] },
      { icon: "🕳️", title: "The Singularity (black hole)", body: "The rarest figurine of all: a real black hole with a glowing accretion disk, unlocked by reaching 365 memories — a full year of your mind (also a Codex discovery). Equip it as a deep-space monument and fly out to witness it. You can preview it any time via the focus button even before it's earned.", tags: ["blackhole", "singularity", "365", "prestige", "rare", "accretion"] },
      { icon: "⚙️", title: "Settings & preferences", body: "The Settings panel (⚙️) holds your preferences — companion flight speed, the floating ship-task label toggle, camera follow mode, audio, and your account. Tune the experience to taste; choices persist across visits.", tags: ["settings", "preferences", "speed", "account", "options"] },
      { icon: "🎲", title: "Sandbox Simulation Deck", body: "In demo brains, the Hangar includes a Sandbox — sliders to simulate memory/connection counts and a 'Bypass Locks' switch — so you can preview every unlock, toast and progression state instantly without growing a real brain.", tags: ["sandbox", "simulator", "demo", "testing", "bypass"] }
    ]
  }
];

export function HelpPanel({ onClose, installPrompt, onInstall }: Props) {
  const [activeTab, setActiveTab] = useState<string>("navigation");
  const [search, setSearch] = useState<string>("");

  // Collect search results if search is not empty
  const isSearchActive = search.trim().length > 0;
  const searchResults: { item: HelpItem; category: string }[] = [];

  if (isSearchActive) {
    const query = search.toLowerCase();
    CATEGORIES.forEach((cat) => {
      cat.items.forEach((item) => {
        const titleMatch = item.title.toLowerCase().includes(query);
        const bodyMatch = item.body.toLowerCase().includes(query);
        const tagMatch = item.tags?.some((t) => t.toLowerCase().includes(query));
        if (titleMatch || bodyMatch || tagMatch) {
          searchResults.push({ item, category: cat.title });
        }
      });
    });
  }

  const selectedCategory = CATEGORIES.find((cat) => cat.id === activeTab);

  return (
    <div className="help-overlay" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`
        .help-overlay {
          padding: 24px;
        }
        .help-search-box {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          display: flex;
          align-items: center;
          padding: 6px 12px;
          margin-bottom: 20px;
          position: relative;
        }
        .help-search-input {
          border: none;
          background: transparent;
          color: white;
          flex: 1;
          outline: none;
          font-size: 14px;
          padding: 6px 0;
        }
        .help-search-input::placeholder {
          color: var(--muted);
          opacity: 0.6;
        }
        .help-search-clear {
          background: transparent;
          border: none;
          color: var(--muted);
          font-size: 18px;
          cursor: pointer;
          padding: 0 4px;
        }
        .help-layout {
          display: flex;
          flex: 1;
          overflow: hidden;
          gap: 20px;
        }
        .help-sidebar {
          width: 240px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
          border-right: 1px solid rgba(255, 255, 255, 0.08);
          padding-right: 15px;
          overflow-y: auto;
        }
        .help-tab-btn {
          background: transparent;
          border: 1px solid transparent;
          border-radius: 6px;
          color: var(--muted);
          text-align: left;
          padding: 10px 14px;
          font-size: 13.5px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .help-tab-btn:hover {
          background: rgba(255, 255, 255, 0.04);
          color: var(--text);
        }
        .help-tab-btn.active {
          background: rgba(100, 200, 255, 0.08);
          border-color: rgba(100, 200, 255, 0.25);
          color: var(--accent);
          font-weight: 500;
        }
        .help-content-scroll {
          flex: 1;
          overflow-y: auto;
          padding-right: 8px;
        }
        .help-category-header {
          margin: 0 0 15px 0;
        }
        .help-category-header h3 {
          margin: 0 0 4px 0 !important;
          font-size: 16px !important;
          color: var(--text) !important;
          text-transform: none !important;
          letter-spacing: normal !important;
        }
        .help-category-desc {
          margin: 0;
          font-size: 12.5px;
          color: var(--muted);
          line-height: 1.4;
        }
        .help-cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 12px;
          padding-bottom: 20px;
        }
        .help-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 14px;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .help-card:hover {
          transform: translateY(-2px);
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(255, 255, 255, 0.08);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25);
        }
        .help-card-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
        }
        .help-card-icon {
          font-size: 16px;
          background: rgba(255, 255, 255, 0.04);
          width: 28px;
          height: 28px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .help-card-title {
          font-size: 13.5px;
          font-weight: 600;
          color: var(--text);
          margin: 0;
        }
        .help-card-body {
          font-size: 12px;
          color: #d7d4ee;
          line-height: 1.45;
          margin: 0;
          flex-grow: 1;
        }
        .help-card-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-top: 10px;
        }
        .help-card-tag {
          font-size: 9px;
          background: rgba(100, 200, 255, 0.06);
          border: 1px solid rgba(100, 200, 255, 0.12);
          color: var(--accent);
          padding: 1.5px 5px;
          border-radius: 3px;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }
        .help-card-category-badge {
          align-self: flex-start;
          font-size: 9px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: var(--muted);
          padding: 1.5px 5px;
          border-radius: 3px;
          margin-top: 10px;
        }
        @media (max-width: 768px) {
          .help-layout {
            flex-direction: column;
          }
          .help-sidebar {
            width: 100%;
            flex-direction: row;
            border-right: none;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            padding-right: 0;
            padding-bottom: 8px;
            overflow-x: auto;
            white-space: nowrap;
          }
          .help-tab-btn {
            padding: 8px 12px;
            font-size: 12.5px;
          }
          .help-content-scroll {
            padding-top: 10px;
          }
        }
      `}</style>

      <div className="help-head">
        <h2>Galaxy Pilot Manual</h2>
        <button className="panel-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <p className="help-intro" style={{ marginBottom: "15px" }}>
        Welcome to your personal second brain. Your thoughts form a dynamic physical galaxy where semantic connections organize themselves, and stars glow hot or cool down over time.
      </p>

      {installPrompt && onInstall && (
        <div className="help-install-container" style={{ margin: "0 0 15px 0" }}>
          <button className="help-install-btn" onClick={onInstall}>
            📲 Install Second Brain App
          </button>
        </div>
      )}

      {/* Interactive Search */}
      <div className="help-search-box">
        <span style={{ fontSize: "14px", marginRight: "8px", opacity: 0.6 }}>🔍</span>
        <input
          type="text"
          className="help-search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search pilot guide for terms (e.g. fuel, orbit, beacon, trail, hangar)..."
        />
        {isSearchActive && (
          <button className="help-search-clear" onClick={() => setSearch("")}>
            ×
          </button>
        )}
      </div>

      {/* Interactive Main Area */}
      <div className="help-layout">
        {!isSearchActive && (
          <div className="help-sidebar">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                className={`help-tab-btn ${activeTab === cat.id ? "active" : ""}`}
                onClick={() => setActiveTab(cat.id)}
              >
                <span>{cat.icon}</span>
                {cat.title}
              </button>
            ))}
          </div>
        )}

        <div className="help-content-scroll">
          {isSearchActive ? (
            <div>
              <div className="help-category-header">
                <h3>Search Results ({searchResults.length})</h3>
                <p className="help-category-desc">
                  Showing matching topics for "{search}"
                </p>
              </div>

              {searchResults.length > 0 ? (
                <div className="help-cards-grid">
                  {searchResults.map(({ item, category }) => (
                    <div key={item.title} className="help-card">
                      <div>
                        <div className="help-card-header">
                          <span className="help-card-icon">{item.icon || "💡"}</span>
                          <h4 className="help-card-title">{item.title}</h4>
                        </div>
                        <p className="help-card-body">{item.body}</p>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        {item.tags && item.tags.length > 0 && (
                          <div className="help-card-tags">
                            {item.tags.slice(0, 2).map((t) => (
                              <span key={t} className="help-card-tag">{t}</span>
                            ))}
                          </div>
                        )}
                        <span className="help-card-category-badge">{category}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty" style={{ padding: "40px 0" }}>
                  No guides match "{search}". Try searching for keywords like "fuel", "trail", "Dyson", or "lock".
                </p>
              )}
            </div>
          ) : (
            selectedCategory && (
              <div>
                <div className="help-category-header">
                  <h3>{selectedCategory.title}</h3>
                  <p className="help-category-desc">{selectedCategory.desc}</p>
                </div>

                <div className="help-cards-grid">
                  {selectedCategory.items.map((item) => (
                    <div key={item.title} className="help-card">
                      <div>
                        <div className="help-card-header">
                          <span className="help-card-icon">{item.icon || "💡"}</span>
                          <h4 className="help-card-title">{item.title}</h4>
                        </div>
                        <p className="help-card-body">{item.body}</p>
                      </div>
                      {item.tags && item.tags.length > 0 && (
                        <div className="help-card-tags">
                          {item.tags.slice(0, 3).map((t) => (
                            <span key={t} className="help-card-tag">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
