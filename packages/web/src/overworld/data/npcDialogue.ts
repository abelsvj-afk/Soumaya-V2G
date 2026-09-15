/**
 * NPC Society — hand-authored dialogue for every door-building's two attendants (v1 shipped
 * with just Town Hall's Mira/Dez, docs/overworld/npc-society.md; the Town Economy round,
 * docs/overworld/npc-economy.md, rolls the same system out to all 10 buildings' 20 NPCs). Per
 * the "Hybrid" decision: static now, but shaped so a later stage can route a line through the
 * LLM adapter (`llm/adapter.ts`) for extra flavor without reworking this data — `NpcProfile` is
 * plain data, not tied to any rendering.
 *
 * "Grows and changes" (idea.md's own "reasons for all of it" rule) = personal lines unlock only
 * once the player has actually earned the matching real achievement id
 * (`components/achievements.ts`), and the friend line only unlocks once the relationship tier
 * with the OTHER attendant at the SAME building (`npcRelationships.ts`) actually reaches
 * "friends" — never on a timer, never invented.
 */

import type { PlaceId } from "../scenes/regionLayout.js";
import type { RelationshipTier } from "./npcRelationships.js";

/** Any `"<placeId>-0"` / `"<placeId>-1"` string — one of the two attendants at a door-building. */
export type SocietyNpcId = string;

export interface NpcProfile {
  id: SocietyNpcId;
  placeId: PlaceId;
  name: string;
  /** Always available — what they'd say about their actual job. */
  jobLines: readonly string[];
  /** Each unlocks only once the player holds the named real achievement id. */
  personalLines: ReadonlyArray<{ achievementId: string; line: string }>;
  /** Only available once the relationship with the other attendant at this building reaches
   *  "friends". */
  friendLine: (otherName: string) => string;
}

function profile(
  placeId: PlaceId,
  index: 0 | 1,
  name: string,
  jobLines: readonly string[],
  personalLines: ReadonlyArray<{ achievementId: string; line: string }>,
  friendLine: (otherName: string) => string,
): NpcProfile {
  return { id: `${placeId}-${index}`, placeId, name, jobLines, personalLines, friendLine };
}

const PROFILE_LIST: NpcProfile[] = [
  // Bank — Priya (teller), Otis (accountant).
  profile(
    "bank",
    0,
    "Priya",
    ["Counting the day's ledger. Every bill and goal in your sky, tallied honest.", "Safe-to-spend's looking steady today — good discipline."],
    [
      { achievementId: "goal_achiever", line: "A goal carried all the way to done. That's the kind of news that makes a teller's whole week." },
      { achievementId: "full_tank", line: "Heard you commissioned Soumaya directly. Bold move — I respect a patron who spends with intent." },
    ],
    (other) => `${other} covered my counter on a busy afternoon once — I haven't forgotten.`,
  ),
  profile(
    "bank",
    1,
    "Otis",
    ["Reconciling the books. Nothing dramatic — just steady, honest arithmetic.", "A bank only runs on trust. Good thing this town has plenty."],
    [
      { achievementId: "connector", line: "25 real connections woven through your collection. I like when the numbers actually mean something." },
      { achievementId: "sector_pioneer", line: "Four whole categories catalogued. Diversifying — smart, same as a good portfolio." },
    ],
    (other) => `${other} and I split the closing shift most nights. Good company for dull paperwork.`,
  ),

  // Library — Callum (shelves), Vera (archives).
  profile(
    "library",
    0,
    "Callum",
    ["Shelving new memories all morning. This town never runs out of things to remember.", "Ask me about anything in the stacks — well, anything already in your collection."],
    [
      { achievementId: "weaver_100", line: "A hundred connections woven through your collection. I've started a shelf just for the well-linked ones." },
      { achievementId: "goal_achiever", line: "Heard a goal got carried all the way to done. That deserves its own bookmark." },
    ],
    (other) => `${other} stopped by earlier — always good company on a break.`,
  ),
  profile(
    "library",
    1,
    "Vera",
    ["Cataloguing the archives. A well-organized library is a well-organized mind.", "Every memory that comes through here earns its place on a real shelf."],
    [
      { achievementId: "web_250", line: "250 connections now — a densely-woven collection. I had to build a whole new wing for the index." },
      { achievementId: "nexus", line: "One memory alone reached 8 connections. That one gets its own reading table." },
    ],
    (other) => `${other} always knows exactly where I left off. Rare, that.`,
  ),

  // Sanctuary — Nadia (mindfulness), Theo (journaling).
  profile(
    "sanctuary",
    0,
    "Nadia",
    ["Sitting with the quiet ones today. Not every thought needs fixing — some just need company.", "The Sanctuary's calm right now. That's its own kind of good news."],
    [
      { achievementId: "idea_garden", line: "Five living ideas, all cultivated at once. That's a real garden, not just a list." },
      { achievementId: "light_bringer", line: "Fifteen joyful memories held in your sky now. I noticed — it's the kind of thing worth noticing." },
    ],
    (other) => `${other} and I trade the quiet shifts. We don't talk much. It's enough.`,
  ),
  profile(
    "sanctuary",
    1,
    "Theo",
    ["Reading through today's reframes. Slow, careful work — the good kind.", "A cognitive shift logged properly is worth more than a dozen unexamined ones."],
    [
      { achievementId: "enduring_light", line: "A memory kept alive 180 days now. That's real endurance, not just storage." },
      { achievementId: "streak_month", line: "Thirty days of showing up in a row. I keep that kind of consistency in mind here too." },
    ],
    (other) => `${other} talked me through a rough one once. I owe them for that.`,
  ),

  // Bulletin Board attendants intentionally omitted — it's a standalone signpost object, not a
  // door-building with attendants (regionLayout.ts's OBJECT_PLACES).

  // Post Office — Wren (mail), Basil (reminders).
  profile(
    "postOffice",
    0,
    "Wren",
    ["Sorting today's notifications. Everything real gets delivered, nothing invented.", "The mailbag's light today — quiet, but that's alright too."],
    [
      { achievementId: "inner_circle", line: "Five people mapped close to you now. That's five more addresses on my real route." },
      { achievementId: "enduring_light", line: "A memory kept alive 180 days — I like delivering the ones that last." },
    ],
    (other) => `${other} covers my route when I'm behind. Good partner for this job.`,
  ),
  profile(
    "postOffice",
    1,
    "Basil",
    ["Chasing down reminders that still need an ack. No rush — they'll keep.", "A quiet inbox is a good sign, not a bad one."],
    [
      { achievementId: "streak_week", line: "A full week of tending in a row. I make a note of streaks like that — good ones to deliver." },
      { achievementId: "goal_achiever", line: "A goal carried all the way to done. That's the kind of letter I like handing over." },
    ],
    (other) => `${other} and I split the route down the middle. Fair, and it works.`,
  ),

  // Observatory — Iris (charts), Sol (digest watch).
  profile(
    "observatory",
    0,
    "Iris",
    ["Charting whatever the digest surfaces next. The sky's honest — it only shows what's real.", "Some nights the connections just aren't there yet. That's fine too."],
    [
      { achievementId: "nexus", line: "A memory reached 8 connections on its own. I like watching one grow that dense." },
      { achievementId: "galactic_atlas", line: "Every sector, body, and constellation discovered. The whole atlas, real and complete." },
    ],
    (other) => `${other} keeps the night shift with me most weeks. Good eyes for faint connections.`,
  ),
  profile(
    "observatory",
    1,
    "Sol",
    ["Watching the digest board for anything new. First to know when two things quietly line up.", "No fresh insight yet today — the sky needs time same as anything."],
    [
      { achievementId: "cartographer", line: "Five constellations charted now. I log every one that crosses this scope." },
      { achievementId: "living_nexus", line: "One memory alone reached 15 connections. That's the kind of density that earns a name." },
    ],
    (other) => `${other} spotted a real connection before I did last week. Fair enough — happens.`,
  ),

  // Theater (backlog #81, docs/overworld/theater-and-gazette.md) — Marlowe (usher), Odalys
  // (programmer). Their real "showings" are the player's own most significant memories'
  // evolving lore, never invented programming.
  profile(
    "theater",
    0,
    "Marlowe",
    ["Seating the evening's showings. Every one of them is a real memory, evolving its own way.", "A quiet house tonight — some stories take longer to find their next chapter."],
    [
      { achievementId: "light_bringer", line: "Fifteen joyful memories now held in your collection. That's a real run of good showings." },
      { achievementId: "enduring_light", line: "One memory kept alive six months and counting. That's the kind of story that earns a long run." },
    ],
    (other) => `${other} always knows which showing to lead with. Good instinct for a program.`,
  ),
  profile(
    "theater",
    1,
    "Odalys",
    ["Programming tonight's lineup from whichever memories have the most to say for themselves.", "Every showing here is real — nothing on this bill was ever invented."],
    [
      { achievementId: "enduring_light", line: "Half a year and a memory's story is still going. I gave it top billing tonight." },
      { achievementId: "light_bringer", line: "Fifteen joyful ones in the collection now — practically a whole festival's worth." },
    ],
    (other) => `${other} and I argue over the running order more than we'd admit. Always lands right, though.`,
  ),

  // Gym — Rocco (training floor), Fern (progress log).
  profile(
    "gym",
    0,
    "Rocco",
    ["Keeping the training floor honest. Progress only counts when it's real.", "No shortcuts here — just the actual work, logged as it happens."],
    [
      { achievementId: "streak_month", line: "Thirty days straight now. That's real discipline, not a lucky week." },
      { achievementId: "skill_master", line: "A skill grown all the way to Expert. I still remember when that one started at zero." },
    ],
    (other) => `${other} spots me on the slow days. Good to have someone who actually shows up.`,
  ),
  profile(
    "gym",
    1,
    "Fern",
    ["Logging today's real progress. Every rank-up here is earned, never handed out.", "The trainer card only ever shows what you actually did."],
    [
      { achievementId: "skill_advanced", line: "A skill grown to Skilled through real practice. I keep those milestones on the wall." },
      { achievementId: "streak_100", line: "A hundred-day streak — a Centurion. That's not luck, that's a habit." },
    ],
    (other) => `${other} and I compare notes on who's actually improving. Keeps us both honest.`,
  ),

  // Market (new) — Juno (stock), Hale (counter).
  profile(
    "market",
    0,
    "Juno",
    ["Stocking the shelves with whatever the town's actually earned. Nothing here is invented.", "Every item here was paid for out of the real Town Ledger — earned, not given."],
    [
      { achievementId: "sector_pioneer", line: "Four distinct categories catalogued. Good variety — I stock the shop the same way." },
      { achievementId: "deep_cluster", line: "One whole category grown past six. Now THAT'S a section worth a whole shelf." },
    ],
    (other) => `${other} restocks with me most mornings. We keep this place running together.`,
  ),
  profile(
    "market",
    1,
    "Hale",
    ["Minding the counter. Every purchase here comes straight out of real wages — never invented.", "Business is only as good as the hours this town actually puts in."],
    [
      { achievementId: "connector", line: "25 real connections now. I like a customer whose collection is actually well-linked." },
      { achievementId: "web_250", line: "250 connections — a densely-woven collection. That's the kind of regular I remember." },
    ],
    (other) => `${other} and I split the till every night. Never once had it come up short.`,
  ),

  // Town Hall — Mira (Deputy Mayor), Dez (Clerk). Names/dialogue unchanged from npc-society.md
  // v1 — only the title changed (Stage 2.17): Soumaya is the town's real autonomous governing
  // figure now (she calls and convenes Town Meetings), so Mira administers Town Hall day-to-day
  // in her stead rather than holding the top civic role herself. v1's own framing of "Mayor" as
  // "a role, not a superior" (npc-society.md) already meant this was always a flavor label with
  // no mechanical weight — nothing else about Mira (schedule, dialogue, relationship with Dez)
  // changes.
  profile(
    "townHall",
    0,
    "Mira",
    [
      "Town Hall's quiet today — good, means everyone's out actually living their Journeys.",
      "I keep half an eye on the digest board. Word travels fast once something real connects.",
    ],
    [
      { achievementId: "cartographer", line: "Five constellations charted now — I've been meaning to put one up on the town map." },
      { achievementId: "streak_week", line: "A full week of showing up every day. That's exactly the kind of thing worth a meeting." },
    ],
    (other) => `Good to see ${other} out here — we go back a while now.`,
  ),
  profile(
    "townHall",
    1,
    "Dez",
    [
      "Filing the day's business. Nothing official yet, but ask again after the next digest.",
      "Town Hall doesn't run itself — someone's got to keep the ledger straight.",
    ],
    [
      { achievementId: "consistent_pilot", line: "A 3-day streak already. Small start, but I log every one — they add up to something." },
      { achievementId: "sentinel_command", line: "Five real beacons deployed over cooling memories. That's the kind of watch I keep here too." },
    ],
    (other) => `${other} stopped by earlier — always good company on a break.`,
  ),

  // Park (new) — Marisol (trails), Otto (benches).
  profile(
    "park",
    0,
    "Marisol",
    ["Keeping the trails clear for whoever needs a real break.", "Not every visit here needs a reason. Some days you just sit a while."],
    [
      { achievementId: "pathfinder_quest", line: "A real path of 5 connected memories, traced start to finish. I mapped a trail here the same way." },
      { achievementId: "time_capsule", line: "A memory kept alive a full year now. Some things are worth sitting with that long." },
    ],
    (other) => `${other} and I walk the far loop most evenings. Best part of the day.`,
  ),
  profile(
    "park",
    1,
    "Otto",
    ["Minding the benches. This is where the town actually rests, not just works.", "Every attendant in this town ends up here on their break eventually."],
    [
      { achievementId: "light_bringer", line: "Fifteen joyful memories held in your sky. I like hearing that — this park's built for exactly that kind of thing." },
      { achievementId: "enduring_light", line: "A memory kept alive 180 days. Some things last. That's worth resting on." },
    ],
    (other) => `${other} always saves me the bench in the shade. Small thing, matters anyway.`,
  ),

  // Hangar — Zeke (ship bay), Nova (restoration).
  profile(
    "hangar",
    0,
    "Zeke",
    ["Running maintenance on whatever's actually flown. Real hops, real wear.", "That Footprint Trail's holding up nice. Good choice, for what it's worth."],
    [
      { achievementId: "cosmic_voyager", line: "Fifteen real travel hops logged. I've been tracking every one from the bay." },
      { achievementId: "galactic_megastructure", line: "Fifty real connections formed. That's the kind of structure I respect — built, not assumed." },
    ],
    (other) => `${other} handles the figurine fittings better than I ever could. Good hands.`,
  ),
  profile(
    "hangar",
    1,
    "Nova",
    ["Restoring what's actually been let go cold. Slow, careful work.", "Every outfit in this bay's been earned through real use, not just picked from a menu."],
    [
      { achievementId: "grand_restorer", line: "Ten cooling memories tended back to life. That's real restoration — I know the work." },
      { achievementId: "skill_master", line: "A skill grown all the way to Expert. Feels good watching that happen from the bay." },
    ],
    (other) => `${other} and I rebuilt half this hangar together. Wouldn't trust anyone else with it.`,
  ),

  // Mayor's Hall (mayors-hall.md, task #63) — "her security": Wren (gate), Cass (watch).
  profile(
    "mayorsHall",
    0,
    "Wren",
    ["Keeping the gate. The Mayor's always out doing her rounds — someone's got to hold the fort.", "Biggest building in town, smallest job title. Suits me fine."],
    [
      { achievementId: "sentinel_command", line: "Five beacons stood. I know a real watch when I see one." },
      { achievementId: "consistent_pilot", line: "A real consistent streak — that's the kind of steadiness this post respects." },
    ],
    (other) => `${other} and I split the gate shifts fair. Never once had to ask twice.`,
  ),
  profile(
    "mayorsHall",
    1,
    "Cass",
    ["On watch for the Hall. The Mayor comes through here more than people think, just never stays long.", "Real quiet post most days. Suits the job."],
    [
      { achievementId: "inner_circle", line: "A real inner circle built. That's exactly the kind of trust this post is built to protect." },
      { achievementId: "enduring_light", line: "Something kept lit that long deserves real watching over. I take that seriously." },
    ],
    (other) => `${other} covers the far door when I can't be two places at once. Good partner to have.`,
  ),
];

const PROFILES: Record<string, NpcProfile> = {};
for (const p of PROFILE_LIST) PROFILES[p.id] = p;

export function npcProfile(id: SocietyNpcId): NpcProfile {
  const found = PROFILES[id];
  if (!found) throw new Error(`Unknown NPC Society id: ${id}`);
  return found;
}

/** Any real npcId from the profile table above, or null for anything else (e.g. a building
 *  that hasn't been given NPC Society profiles yet) — the guard every caller uses before
 *  treating an AttendantPost as a society NPC. */
export function asSocietyNpcId(id: string): SocietyNpcId | null {
  return PROFILES[id] ? id : null;
}

/** The town's real, fixed 22 society NPCs (11 buildings x 2, 2026-09-15 audit fix — corrected
 *  from a stale "20" that undercounted Mayor's Hall's own 2), in one stable declaration order
 *  (PROFILE_LIST's own order) — housing.ts's single source of "who exists" for deterministic
 *  home assignment. */
export function allSocietyNpcIds(): readonly SocietyNpcId[] {
  return PROFILE_LIST.map((p) => p.id);
}

/** The other attendant at the same building, if this npcId is a real one — used to find who
 *  an interaction partner actually is without hard-coding building-specific pairs anywhere. */
export function partnerNpcId(id: SocietyNpcId): SocietyNpcId | null {
  const profileForId = PROFILES[id];
  if (!profileForId) return null;
  const partner = PROFILE_LIST.find((p) => p.placeId === profileForId.placeId && p.id !== id);
  return partner?.id ?? null;
}

/**
 * Picks one line from whatever's currently unlocked for this NPC — job lines always included,
 * personal lines gated on real achievements, the friend line gated on relationship tier.
 * Deterministic given the same seed (this repo's convention — no Math.random), so repeated
 * interactions vary without ever being random.
 */
export function dialogueFor(
  id: SocietyNpcId,
  unlockedAchievementIds: ReadonlySet<string>,
  tier: RelationshipTier,
  otherName: string,
  seed: number,
): string {
  const profileForId = npcProfile(id);
  const pool: string[] = [...profileForId.jobLines];
  for (const personal of profileForId.personalLines) {
    if (unlockedAchievementIds.has(personal.achievementId)) pool.push(personal.line);
  }
  if (tier === "friends") pool.push(profileForId.friendLine(otherName));
  if (pool.length === 0) return "";
  const index = ((seed % pool.length) + pool.length) % pool.length;
  return pool[index] ?? "";
}
