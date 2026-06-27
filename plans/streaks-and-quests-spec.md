# Technical Specification: Streaks & Daily Quests (Gamification Phase 2)

**Author:** AI Engineer Agent (`agy`)  
**Status:** DRAFT (Phase A: Spec-First Strategy)  
**Zone:** 🟡 Yellow Zone (Shared Schemas & API Contract = RED; UI HUD & Animation = GREEN)  

---

## 🎯 1. Objective & Scope

This specification details the design for the **Streaks & Daily Quests** engagement loop (Wave 2 Gamification). The goal is to incentivize daily check-ins, encourage graph cleanup/exploration, and provide clear progression incentives—without breaking the offline-fallback capability or multi-tenant database constraints.

### Key Features
1. **Pilot Streaks:** Track consecutive days the user has interacted with their brain (logged thoughts, tended nodes, forged links), displaying a HUD flame indicator (🔥) and providing fuel multipliers.
2. **Daily Quest Board:** Provide 3 dynamically generated, graph-aware tasks each day (e.g., "Warm up 2 cooling memories", "Review 1 insight") that reward fuel upon completion.
3. **Additive Rewards:** Streak milestones (e.g., 3-day, 7-day, 30-day) unlock cosmetic ship custom trails and monuments in the Hangar.

---

## 📐 2. Architecture & Blast Radius

The implementation crosses all three tiers of the monorepo:

```
[packages/shared]  <--- Register new Quest Zod schemas & types
       |
[packages/server]  <--- db/schema migration, QuestService, API endpoints (/api/quests/*)
       |
[packages/web]     <--- HUD Streak Flame, RightDock Quest List component, Toast alerts
```

### Affected Files
* **Shared Contract:** `packages/shared/src/types.ts`
* **Server Schemas & Migrations:** `packages/server/src/db/schema.ts`, `packages/server/src/db/client.ts`
* **Server Logic:** `packages/server/src/economy.ts` (adding multiplier hook), creation of `packages/server/src/quests/service.ts`
* **Server Endpoints:** `packages/server/src/api/routes/quests.ts` (new routes), registered in `packages/server/src/api/server.ts`
* **Client API:** `packages/web/src/api/client.ts`
* **Client HUD Components:** `packages/web/src/App.tsx`, `packages/web/src/components/RightDock.tsx`, and a new component `packages/web/src/components/QuestBoard.tsx`
* **Client Styles:** `packages/web/src/index.css`

---

## 💾 3. Database Schema & Migrations (RED ZONE)

We will execute an additive, idempotent migration in `packages/server/src/db/client.ts` (`migrateSchema`) to register the following updates:

### Update `space_meta` Table
We add metadata fields to `space_meta` to track the user's active streak without breaking existing space credentials:
```sql
ALTER TABLE space_meta ADD COLUMN streak_count INTEGER DEFAULT 0;
ALTER TABLE space_meta ADD COLUMN last_tended_date TEXT; -- ISO Date: YYYY-MM-DD
ALTER TABLE space_meta ADD COLUMN highest_streak INTEGER DEFAULT 0;
```

### Create `daily_quests` Table
This table stores the active daily tasks generated for each private space:
```sql
CREATE TABLE IF NOT EXISTS daily_quests (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  quest_type TEXT NOT NULL,      -- 'tend_cooling' | 'forge_link' | 'view_insight' | 'log_memory'
  label TEXT NOT NULL,           -- Human readable prompt: "Warm up 2 cooling memories"
  current_progress INTEGER DEFAULT 0,
  target_count INTEGER NOT NULL,
  fuel_reward REAL NOT NULL,
  completed INTEGER DEFAULT 0,    -- 0 = false, 1 = true
  reward_claimed INTEGER DEFAULT 0,
  created_date TEXT NOT NULL,    -- YYYY-MM-DD
  FOREIGN KEY(space_id) REFERENCES space_meta(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_quests_space_date ON daily_quests(space_id, created_date);
```

---

## ⚙️ 4. Server-Side Service Logic (RED/YELLOW ZONES)

### A. Streak Evaluation Algorithm
Streak calculation must be timezone-agnostic and evaluated on the client's request payload header or on any read/write API call.
* **Algorithm (Triggered on API calls or `/api/quests/streak` GET):**
  1. Let `today` be the user's current local date in format `YYYY-MM-DD` (supplied as a query param or header `x-local-date` to handle client timezone changes).
  2. Query `space_meta` for `streak_count` and `last_tended_date`.
  3. If `last_tended_date` is null:
     - Set `streak_count = 1`, `last_tended_date = today`.
  4. If `last_tended_date == today`:
     - Keep streak count the same (already checked in today).
  5. If `last_tended_date == yesterday` (today - 1 day):
     - Increment `streak_count` by 1.
     - Update `last_tended_date = today`.
     - Update `highest_streak = max(highest_streak, streak_count)`.
  6. If `last_tended_date < yesterday`:
     - Reset `streak_count = 1`.
     - Update `last_tended_date = today`.

### B. Daily Quest Heuristic Generator
At the start of each calendar day (when `current_date != last_quest_generation_date`), the server compiles exactly 3 quests based on the space's graph density and entropy levels:

1. **Quest 1: The Restorer (Entropy)**
   - *Target:* Find the count of cooling nodes (where `entropy > 0.4`).
   - *If count >= 2:* Quest = "Warm up 2 cooling memories" (target=2, reward=5.0 fuel).
   - *Otherwise:* Quest = "Log a new memory" (target=1, reward=3.0 fuel).
2. **Quest 2: The Architect (Constellations/Links)**
   - *Target:* Identify isolated nodes or unlinked constellation clusters.
   - *Quest:* "Forge 1 new connection in the 3D web" (target=1, reward=4.0 fuel).
3. **Quest 3: The Explorer (Insight/Daily Digest)**
   - *Quest:* "Read 1 generative insight or daily digest" (target=1, reward=3.0 fuel).

### C. Hooking Actions to Quest Progression
To track progress, we intercept write routes:
* **Tending node:** `POST /api/nodes/:id/tend` calls `QuestService.incrementProgress(spaceId, 'tend_cooling')`.
* **Forging link:** `POST /api/edges` calls `QuestService.incrementProgress(spaceId, 'forge_link')`.
* **Viewing insight:** `POST /api/insights/view` calls `QuestService.incrementProgress(spaceId, 'view_insight')`.

---

## 📺 5. Frontend HUD & UI Additions (GREEN ZONE)

### A. Streak HUD Flame
Next to the progressive fuel chip in the brand header, we render a styled streak flame:
```html
{streakCount > 0 && (
  <span className="status streak-chip" title={`🔥 Active Streak: ${streakCount} Days`}>
    🔥 {streakCount}d
  </span>
)}
```
* **CSS Styling (`index.css`):**
  - Animated flame glow using a soft pulsing CSS box-shadow (e.g. `rgba(255, 120, 50, 0.4)`).
  - Hovering over the streak chip details the multiplier bonus applied to incoming fuel.

### B. Quest Board in the Right Dock
A new tab or sub-panel within the **Agenda (Actions)** view of the Right Dock displaying the day's tasks:
- Render each quest card with:
  * Description label.
  * Linear progress bar (`current/target`).
  * Fuel reward indicator (+F ⛽).
  * A "Claim" button once complete, triggering a CSS floaty checkmark animation.

```
+--------------------------------------+
| 🚀 DAILY QUESTS                      |
+--------------------------------------+
| [ ] Warm up 2 cooling memories       |
|     =====>------ [1/2]  +5.0 Fuel ⛽ |
|                                      |
| [x] Read today's daily digest        |
|     ================= [1/1]  [Claim] |
+--------------------------------------+
```

---

## 🧪 6. Test & Verification Plan (GREEN/RED ZONES)

### A. Server Test Suite (`packages/server/src/__tests__/quests.test.ts`)
- **Unit Test 1 (Streak Progression):**
  Mock time-advancement to test `last_tended_date` transitions:
  * day 1 check-in -> streak = 1.
  * day 2 check-in -> streak = 2.
  * day 4 check-in (skipped day 3) -> streak resets to 1.
- **Unit Test 2 (Quest Generation Limit):**
  Verify the server never generates more than 3 quests per day per space.
- **Unit Test 3 (Quest Completion Bounds):**
  Confirm progress increments cannot exceed the target count and can only be claimed once.

### B. Visual QA & Fallback Test
- **Offline Fallback Check:** Disconnect API connection and verify the frontend displays empty/mock static checklist items gracefully without causing a React render crash.
- **Visual Claim Check:** Trigger a quest claim, confirming the HUD fuel chip triggers the `+N` floaty popup animation we implemented.
