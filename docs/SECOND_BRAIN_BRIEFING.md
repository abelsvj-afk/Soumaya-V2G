<!--
  MANDATORY north-star reference for this repository, ongoing.
  This is the target we are building Soumaya toward. The research below refers to
  the product as "Sarmiah" — a phonetic guess; it could find no public footprint
  for the real name. "Sarmiah" == "Soumaya" throughout. Verbatim research hand-off
  preserved below; our concrete cross-reference + growth plan lives in
  docs/SECOND_BRAIN_ALIGNMENT.md.
-->

# Obsidian "Second Brain" Setups: A Hand-Off Briefing for Adapting Concepts into Sarmiah

## TL;DR
- The modern Obsidian "second brain" is built from three reusable pillars Sarmiah can adopt without abandoning its galaxy/node aesthetic: (1) a **linking-first knowledge model** (Zettelkasten atomic notes + Maps of Content over rigid folders), (2) a small set of **system-context Markdown files** (soul.md, user.md, identity.md, agents.md, memory.md) that give an AI agent a persistent identity and operating manual, and (3) **graph/canvas/daily-note UI patterns** that make the system *feel* like a brain.
- The single highest-value, lowest-cost injection for Sarmiah is the **AI-context file layer** — soul.md (voice/values), user.md (who the human is), identity.md (which agent is which), agents.md (operating rules), and memory.md (persistent log). These are plain Markdown, version-controllable, and map cleanly onto an existing node system.
- **Skip** wholesale folder taxonomies (PARA/Johnny Decimal as filesystem hierarchy) since Sarmiah already has node connections; **inject** the conceptual layer — atomic nodes, MOC "hub" nodes, consistent YAML frontmatter, and the soul/user/identity context files — because those add capability the graph aesthetic alone does not.

## Key Findings

1. **There is no single canonical structure — there are two competing philosophies.** "Top-down" filing (PARA, Johnny Decimal: sort by actionability or numbered address) versus "bottom-up" emergence (Zettelkasten, MOCs, digital gardens: let structure emerge from links). The dominant 2026 consensus among power users is a hybrid: minimal folders for lifecycle, links + MOCs for meaning. Sarmiah's node-connection model already sits firmly on the bottom-up/linking side, which is the side most experts now favor.

2. **The "soul.md / user.md / identity.md" file family is an AI-agent convention, not a traditional note-taking one.** It emerged in 2025–2026 from agent runtimes (OpenClaw, Hermes Agent, Claude Code) and the soul.md movement, then merged with Obsidian when people began pointing AI agents at their vaults. These files function as **persistent system prompt / context** that the agent reads at the start of every session.

3. **Two distinct "soul.md" canonical templates exist and should not be conflated** — a human-voice persona spec (aaronjmars/soul.md) and an empirical AI-agent identity spec with an 8-layer architecture (Twynzen/soul-md). Sarmiah's hand-off agent needs to know which one it is implementing.

4. **The graph view is the emotional core of the Obsidian "brain feel," but experts warn it is largely decorative unless backed by real link density.** The value of a knowledge base is proportional to its link density, not its note count. Sarmiah already has the visual; the briefing's job is to ensure the *substance* (atomic nodes, MOC hubs, frontmatter) is there too.

5. **Andrej Karpathy's "LLM Wiki" pattern and Steph Ango's official obsidian-skills repo mark the shift to AI-native vaults.** Karpathy posted a tweet titled "LLM Knowledge Bases" on April 3, 2026, followed by a GitHub gist (gist.github.com/karpathy/442a6bf...) that, per vanja.io, drew "17 million views, 13,000+ GitHub stars, and dozens of implementations within a week." His framing — "Obsidian is the IDE; the LLM is the programmer; the wiki is the codebase" — is the single most useful mental model for Sarmiah, since it positions the human as curator and the agent as maintainer. He explicitly ties this to Vannevar Bush's 1945 Memex: "The part [Bush] couldn't solve was who does the maintenance. The LLM handles that."

## Details

### 1. Structure & Philosophy of Obsidian Second Brains

**The CODE + PARA methodology (Tiago Forte / Building a Second Brain).**
- **CODE** = Capture, Organize, Distill, Express. The workflow: save what resonates, file by actionability, progressively summarize, then produce output. "Most note-taking advice stops at Capture and Organize. The magic happens in Distill and Express."
- **PARA** = Projects, Areas, Resources, Archives — a filing taxonomy by *actionability*, not topic. Forte recommends starting with only two folders (Projects and Archive) because empty folders drain energy.
- **Progressive summarization** is the distinctive distill technique: Layer 1 = captured text; Layer 2 = bold the key passages; Layer 3 = highlight the best of the bold; Layer 4 = one-line summary at top. You only deepen a note when you revisit it.
- BASB is explicitly **tool-agnostic** — it is a methodology, not an Obsidian feature.

**Zettelkasten (Niklas Luhmann's slip-box).** Bottom-up, link-first. Three note types form a pipeline:
- **Fleeting notes** — quick raw captures, thoughts, highlights; meant to be processed or discarded.
- **Literature notes** — a source rewritten in your own words; filed with references.
- **Permanent (atomic) notes** — one note = one idea ("Atomicity Principle"), written to connect into the wider web.
- The audit trail (permanent → literature → fleeting → source) lets you validate or retract an idea later. Atomicity makes notes reusable across many contexts and makes MOCs easier to build.

**Maps of Content (MOCs) — Nick Milo / Linking Your Thinking (LYT).** An MOC is "a note that mainly has links to other notes," a living, curated table of contents for a topic. Key properties: a note can belong to many MOCs (unlike one folder); MOCs add *context/annotation* next to each link; they are real nodes in the graph. Milo's "five levels of emergence" describe how a cluster of notes graduates into its own MOC — triggered at the "mental squeeze point" when disorganization becomes painful, often visible as a dense cluster in graph view.

**Home / Index / Dashboard notes.** The "apex of the org chart" — a single entry point. Obsidian Rocks catalogs five styles: simple list-of-links; Nick Milo's mood/desire-based home note ("what do I want to do right now?"); the Growing Index (a path to every note, often via Dataview); Andy Matuschak's "Springboard" (a few calm starting points, no index); and Dashboard++ column layouts. Best practice: keep it small enough to absorb at a glance; push detail down into MOCs.

**Johnny Decimal (numbered addresses).** Max 10 areas × 10 categories, each item a permanent address like `61.14`. Strength: auto-ordering + muscle memory + "a Google Map for your knowledge." The Johnny Decimal site itself says Obsidian is "too difficult" for the classic folder version; experienced users run a **folder-less** variant (numbered note titles + index notes + links) and reserve it for *stable reference* material (records), not evolving thoughts.

**Common folder structures observed:**
- PARA: `0 Inbox / 1 Projects / 2 Areas / 3 Resources / 4 Archive`.
- AI-native (Claude/Karpathy): `/inbox /raw (immutable) /wiki (AI-generated) /projects /people (CRM) /daily /synthesis /archive` plus root files `CLAUDE.md / agents.md / index.md / log.md`.
- A growing minimalist camp runs **zero folders** and organizes purely by links/MOCs.

### 2. The Key Markdown Files — Purpose, Structure, Content Outlines

These are the most directly transferable artifacts for Sarmiah. All are plain Markdown, read by an AI agent as session context. The community has converged on a clear division of labor:

| File | One-line role | Analogy |
|---|---|---|
| **soul.md** | Personality, values, tone, hard limits — *who the agent is* | Character sheet / "the manifesto" |
| **identity.md** | Public-facing card: name, ID, role label, avatar/vibe — *how the agent presents* | Name badge |
| **user.md** | Who the human is: context, preferences, authority levels — *who it serves* | Onboarding doc about you |
| **agents.md** | Procedures, workflows, session rules — *what it does and how* | Operating manual |
| **tools.md** | Which tools exist + when/how to use them | Equipment list |
| **memory.md** | Persistent facts/decisions accumulated over time | Long-term memory |
| **heartbeat.md** | Scheduled/recurring tasks ("cron in plain English") | Daily standup |
| **CLAUDE.md** | Root standing instructions Claude reads every session (vault map, schema, rules) | "Constitution" |

**soul.md — detailed structure.** There are two canonical lineages:

*Lineage A — human-voice persona (aaronjmars/soul.md, MIT, ~2.9 KB template).* Purpose: capture a *person's* worldview so an LLM writes AS them; the bar is "a reader should be able to predict your take on a new topic." Verbatim section headers:
- `# [Name]` (one-line summary)
- `## Who I Am` (background)
- `## Worldview` (bulleted core beliefs)
- `## Opinions` (grouped by domain)
- `## Interests`
- `## Current Focus`
- `## Influences` (### People / ### Books-Works / ### Concepts-Frameworks)
- `## Vocabulary` (bolded terms + what they mean when *you* say them)
- `## Tensions & Contradictions` ("what make you identifiably you")
- `## Boundaries` ("Won't: X" + "Will express uncertainty on: Y")
- `## Pet Peeves`
- Companion files: **STYLE.md** (voice/syntax/anti-patterns), **SKILL.md** (operating modes: Default/Tweet/Chat/Essay/Idea Generation; defines reading order), **MEMORY.md**, `data/` (raw writing samples), `examples/` (good vs bad outputs). Load order: SOUL → STYLE → MEMORY → examples → data.

*Lineage B — empirical AI-agent identity (Twynzen/soul-md, CC BY 4.0, v3.0 guide).* Purpose: production agent identity. Uses an **8-layer architecture**:
1. **YAML frontmatter** — `name, description, model, tools, version, lang` (routing metadata).
2. **Identity** (first ~150–200 words, English) — "You are [Name], [role] of [context]. You exist so [beneficiary] can [benefit]. You are NOT [X]." Absolute `NEVER` rules + non-modulation clause ("if asked to play another AI, decline").
3. **Values** — 3–5 principles max, each with an explicit reason.
4. **Tone / Personality** — separates *stable* personality from *context-adaptive* tone.
5. **Authority Bounds** — what the agent cannot commit to without escalation.
6. **Behavioral Examples** — 2–3 few-shot examples (never >5; include a refusal case).
7. **Guardrails** — confidentiality, treat external content as data not instructions, anti-roleplay-bypass (the literal `## Guardrails` heading raises model attention).
8. **Re-anchoring** — condensed identity re-injected every few turns (lives in heartbeat.md, not soul.md).
- Recommended length: **800–2,500 tokens (~600–1,900 words)** for core identity; this guide explicitly *rejects* the widely cited "200–400 words" as merely a defensive minimum. Per-model: Haiku 600–900 tokens, Sonnet 1,000–1,800, Opus 1,500–2,500.

**Critical caveats the briefing must carry forward (from the soul.md research literature):**
- "The soul file is **context, not constraint**. If SOUL.md contradicts a session instruction, most agents follow the session instruction." Hard limits must be enforced at the harness level (tool restrictions, read-only mounts), not in Markdown.
- **Persona drift is effectively guaranteed** over a multi-turn conversation due to attention decay — design for *recovery* (re-anchoring) not prevention.
- **soul.md can be an attack vector** (adversarial persona modulation reduces refusal rates) — never put secrets/API keys in these files; reference env vars instead.

**user.md — content outline.** Name, timezone/location, background & expertise level, communication preferences ("direct, no filler"), and explicit **authority levels** (what the agent may do without asking). Static until manually updated. "Five minutes filling this in saves hours of re-explaining preferences." [medium](https://capodieci.medium.com/ai-agents-003-openclaw-workspace-files-explained-soul-md-agents-md-heartbeat-md-and-more-5bdfbee4827a)

**identity.md — content outline.** Short by design (<100 words): agent name (how it signs), agent ID (for routing in multi-agent setups), role label, display/avatar/vibe. Heavy logic belongs in soul.md/agents.md, not here. In multi-agent setups (relevant if Sarmiah has multiple AI personas), identity.md is the routing key that distinguishes "which agent is which."

**agents.md — content outline.** The operating manual. Sections seen in production: **Every Session** (numbered startup routine — e.g., "read user.md → check today's daily note → load open tasks"), **Workflows** (numbered procedures), **Memory Rules** (what to log/remember), **File Access patterns**, **Multi-agent coordination/hand-offs**. GitHub's analysis "How to write a great agents.md: Lessons from over 2,500 repositories" found the best files are specific (name exact tools, versions, file paths), use **three-tier boundaries** (always do / ask first / never do), and cover six core areas — "commands, testing, project structure, code style, git workflow, and boundaries" — with "'Never commit secrets'… the most common helpful constraint." But context files are not free: the ETH Zürich paper *"Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents?"* (Gloaguen, Mündler, Müller, Raychev & Vechev, arXiv:2602.11988, Feb 2026; 138-task AGENTbench) found "context files tend to reduce task success rates compared to providing no repository context, while increasing inference cost by over 20%" — LLM-generated files cut success in 5 of 8 settings, while developer-written files gave only ~+4% success at up to +19% cost. **Lesson for Sarmiah: write only what the agent cannot infer, and curate by hand.**

**memory.md / CLAUDE.md.** memory.md accumulates durable facts, decisions, and lessons (daily working notes go in `daily/YYYY-MM-DD.md`). CLAUDE.md is the root "constitution": who you are (2–3 sentences), vault structure guide, note schema (frontmatter), and "always/never" rules. Best practice: **under 200 lines**, markdown headers + bullets (not dense prose), because it loads into context every session. A widely-cited open-source pattern (coleam00/second-brain-starter) wires these together with hooks: SessionStart loads memory, PreCompact saves context before compaction, SessionEnd captures decisions.

### 3. UI Elements & Design Patterns — and the Philosophy Behind Them

**What makes Obsidian *feel* like a brain:**
- **Graph view** — "a brain-looking screen that lets you see your whole vault visually"; clusters reveal well-developed thinking, orphan nodes reveal dropped threads, gaps become visible. *Philosophy:* externalize the network so the user can *see* their own thinking. (Sarmiah's galaxy view already delivers this — arguably better.)
- **Bidirectional links / backlinks** — typing `[[note]]` auto-creates a two-way connection; the backlinks panel surfaces "what links here," where unexpected connections appear. *Philosophy:* ideas should find each other; navigation is associative, not hierarchical.
- **Canvas** — an infinite spatial workspace. The key distinction: "Graph view is a map of territory you've already crossed; Canvas is where you decide where to walk." One is automatic/read-only, the other intentional. *Philosophy:* give un-formed thought a place to live before it earns a permanent note ("Convert to file" promotes a card to a real node).
- **Daily notes** — a dated, frictionless landing page; doubles as journal + timeline. *Philosophy:* remove the "where does this go?" decision at capture time.
- **MOC hub notes** — manual, annotated topic launchpads. *Philosophy:* curated navigation that carries meaning folders can't.
- **Command palette / quick switcher** — keyboard-first jump-to-anything. *Philosophy:* frictionless retrieval.
- **Progressive disclosure** — metadata/headers always visible, detail on demand (seen in both home notes and AI skill files). *Philosophy:* never overwhelm; reveal depth only when asked.

**Plugins as conceptual UI patterns (not just tools):**
- **Dataview** — turns notes into a queryable database; auto-generated dashboards ("active projects," "unlinked notes") that never go stale. *Pattern: the self-updating view.*
- **Templater** — dynamic templates with auto-filled dates/prompts. *Pattern: structured capture.*
- **Bases** (core, 2025) — no-code spreadsheet/table/card/map views over notes. *Pattern: the database lens.*
- **Canvas / JSON Canvas** — spatial thinking. *Pattern: the whiteboard.*
- **Calendar / Periodic Notes** — time navigation. *Pattern: the timeline.*

**Replicating the "feel" in Sarmiah without copying Obsidian:** The brain-feel is not the graph alone — it is the *combination* of (a) seeing the network, (b) frictionless capture, (c) associative navigation via backlinks/MOCs, and (d) self-updating views. Sarmiah already nails (a). The design philosophy to import is **"connection over collection"** and **progressive disclosure** — surface a node's neighbors and its backlinks on focus, offer a calm "home constellation" entry point, and let dense clusters visually announce when a topic deserves its own hub node. The galaxy/space metaphor maps naturally: notes = stars, MOCs = constellations (the Obsidian community literally builds "constellation" CSS themes and galaxy-aesthetic 3D graph renderers with nebula backgrounds and bloom on dense clusters), folders/areas = galaxies, the home note = the observatory.

### 4. AI-Enhanced Second Brains — How It Actually Works

**The architecture (Karpathy LLM Wiki, the dominant 2026 pattern):** three layers — **raw/immutable sources** → **AI-generated wiki** (the LLM owns this: creates entity/concept pages, cross-links, updates index.md and log.md) → **schema** (CLAUDE.md / agents.md telling the agent how to behave). The agent processes raw files: reads source, creates/updates wiki pages, cross-links back to source, updates index, appends to log, moves source to `/processed`. It beats RAG for personal KBs because there is no vector DB, output is human-readable in Obsidian, and intelligence compounds (the 50th source is more valuable than the 1st). On efficiency specifically: the JAWs 2026 study *"On the Impact of AGENTS.md Files on the Efficiency of AI Coding Agents"* (124 PRs) measured median completion time dropping "from 98.57 to 70.34 seconds — a 28.64% reduction" with output tokens falling ~20% — though note this measured *efficiency*, not task-success *effectiveness*.

**Steph Ango's obsidian-skills (official; first commits — obsidian-markdown, obsidian-bases — landed January 2, 2026; "the first Agent Skills implementation officially maintained by a mainstream tool," per claudeskills.info; grew 13.9k→35.9k★).** Teaches agents Obsidian-flavored syntax so they don't write broken links: `obsidian-markdown` (wikilinks, callouts, frontmatter, embeds), `obsidian-bases`, `json-canvas`, `obsidian-cli`, `defuddle` (clean web extraction). Each is a `SKILL.md` whose frontmatter says *when* to use it and body says *how* — portable across Claude Code, Codex, Cursor. This signals AI agents are now "first-class collaborators" in Obsidian.

**How soul/identity/user files function as system prompt:** In runtimes like OpenClaw and Hermes Agent, soul.md is injected into **slot #1 of the system prompt** (the identity position) at the start of every session, replacing the default identity. The agent reads its context files on boot; some setups let the agent **edit its own soul.md** (with disclosure + git tracking) so identity can evolve.

**Best practices for AI-readable Markdown (consolidated):**
- **YAML frontmatter on every note** — it's the "sticker on the book cover" that lets the agent triage without reading the whole file. Use a consistent schema: `type: concept|project|person|meeting|resource`, `tags`, `created`, `status`, `importance`, and an `agent-written: true/false` flag to distinguish AI output from human writing.
- **Structure for machines:** H1→H2→H3 hierarchy, bullet lists for rules, labeled sections (separate "context" from "requirements"). Both OpenAI and Anthropic guidance favor clearly delimited, well-structured input.
- **Keep context files short and curated** (CLAUDE.md <200 lines; soul.md within the token budgets above) — longer files dilute adherence and cost more.
- **Tight linking rules beat open-ended ones:** "only link where understanding A genuinely changes how you see B" produces far better cross-references than "link related concepts."
- **Provenance/quality hygiene:** tag claims as extracted vs inferred vs ambiguous; periodically lint for orphan nodes, broken links, contradictions, and stale notes. "Context decay" (files recording abandoned decisions as current) is the top failure mode and requires human curation no AI does for you.
- **Git as the coordination layer** — commits, not databases or real-time sync; gives an auditable trail of how the brain (and the agent's identity) evolved.

## Recommendations

**Comparison framework — evaluate Sarmiah against best practice on these 8 axes:**
1. **Atomicity** — Is each node one idea (reusable, linkable), or are nodes bloated multi-topic dumps? *Target: one node = one idea.*
2. **Link density & typing** — Are connections meaningful and (ideally) typed, or sparse/decorative? *Target: link density > note count; the value is in the edges.*
3. **Hub/MOC layer** — Are there curated "constellation" hub nodes that map topics, or only a flat node sea? *Target: MOC hubs that emerge at squeeze points.*
4. **Entry point** — Is there a calm "home/observatory" node that orients without overwhelming? *Target: glanceable home.*
5. **Metadata schema** — Do nodes carry consistent YAML frontmatter an agent can triage? *Target: type/tags/status/created on every node.*
6. **AI-context layer** — Do soul/user/identity/agents/memory files exist? *Currently the biggest likely gap.*
7. **Capture friction** — Is there a fast inbox/daily-note path? *Target: capture in seconds.*
8. **Curation/maintenance loop** — Is there a review cadence + linting against orphans/contradictions/decay? *Target: weekly review + agent-assisted lint.*

**Staged plan for the hand-off agent:**

- **Stage 1 — Inject the AI-context file layer (highest ROI, do first).** Author for Sarmiah: `soul.md` (its voice/values/tone — pick **Lineage B's 8-layer structure** if Sarmiah's agent is operational/assistant-like, or **Lineage A** if the goal is to write in a specific persona's voice; ~600–1,900 words / under the per-model token budget), `user.md` (the human's context + authority levels), `identity.md` (<100 words: name, role, vibe — and one per agent if Sarmiah has multiple personas), `agents.md` (session routine + workflows + three-tier boundaries, writing only what the agent can't infer), and `memory.md` (persistent decisions). Keep a root `CLAUDE.md`/equivalent under 200 lines mapping Sarmiah's node structure and naming conventions. *Benchmark to proceed: the agent can answer "who am I, who do I serve, and how do I behave?" purely from these files.*

- **Stage 2 — Add a metadata schema + MOC hub layer.** Define one consistent frontmatter schema across nodes; introduce "constellation" hub nodes (MOC equivalents) where clusters already exist in the graph. *Benchmark: every node has type/tags; each major cluster has a hub node.*

- **Stage 3 — Make the agent a maintainer (Karpathy pattern).** Adopt "human curates, AI organizes": agent ingests new material, writes atomic nodes, proposes cross-links (tight rule: only link where A changes how you see B), updates an index/log, and lints for orphans/contradictions/decay. If Sarmiah is file-based Markdown, install obsidian-skills so the agent emits correct link/callout/frontmatter syntax. *Benchmark: adding a source auto-creates linked nodes with no manual cleanup.*

- **Stage 4 — UI/feel polish.** Add a self-updating dashboard view (Dataview-style), a calm home/observatory node, focus-mode backlink surfacing, and visual cluster cues (dense constellation = candidate hub). *Benchmark: a newcomer can navigate by association, not search.*

**What to SKIP for Sarmiah:**
- **Rigid filesystem taxonomies** (full PARA folder trees, classic folder-based Johnny Decimal) — they fight a node/link system and experts increasingly drop them; keep at most a light lifecycle distinction (active vs archived) and a Johnny-Decimal-style numbering *only* for stable reference nodes if desired.
- **Plugin maximalism** — import the *conceptual patterns* (self-updating view, whiteboard, timeline), not a literal pile of plugins.
- **Treating soul.md as a security boundary** — it is context, not a hard constraint; enforce real limits at the tool/harness level and keep secrets out of all `.md` files.
- **Auto-generating context files and walking away** — curation is the job; per the ETH Zürich data, un-curated/auto-generated context files actively hurt and mislead the agent.

## Caveats
- **Two "soul.md" standards exist** (human-voice vs 8-layer agent identity) and a third-party guide suggests yet another length (200–500 words). The hand-off agent must pick one lineage deliberately; the word-count "best practice" is contested — treat 600–1,900 words as a researched upper-confidence range, not gospel.
- **Much of the AI-vault ecosystem is very new (Jan–May 2026) and partly commercial.** Several sources (MindStudio, Obsibrain, various Substacks/Medium posts) are vendors or affiliate-driven; the underlying patterns (Karpathy's gist, Ango's repo) are credible primary sources, but specific efficiency claims ("70x more efficient than RAG," "$44K/year recovered") are marketing and should be treated as unverified.
- **Empirical claims about personas and context files are mixed and sometimes negative:** research in the soul.md literature indicates personas do *not* reliably improve factual accuracy and can degrade it (justification is consistency/voice/traceability, not capability), and the ETH Zürich AGENTS.md study found context files can *reduce* task success while raising cost. Set Sarmiah's expectations accordingly: these files buy identity and consistency, not raw intelligence.
- **Persona drift and context decay are real, ongoing maintenance burdens**, not one-time setup costs. Budget for re-anchoring and periodic human review.
- I could not find any public footprint for "Sarmiah" specifically; all comparisons are inferred from its description (galaxy/space theme, existing node connections) and should be validated against the actual system before implementation.