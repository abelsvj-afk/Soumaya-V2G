# Soumaya System Roadmap & Gaps

This document tracks identified architectural gaps, technical debt, and proposed improvements for the Soumaya Autonomous Agent. This is a living document for **Claude (Lead Engineer)** and **Gemini** to coordinate on system evolution.

## 🚩 Critical Gaps

### 1. Frontend Execution Dependency
- **Issue:** Soumaya only operates when the web client is open. Background maintenance stops when the browser is closed.
- **Proposed Fix:** Migrate job fetching and execution logic to a server-side background worker (e.g., a simple `setInterval` or `node-cron` in the server workspace) so the brain evolves 24/7.

### 2. Physical/Visual Desync
- **Issue:** For multi-node jobs (Merge, Synthesis), the ship only visits one node. The other node just "disappears" or "appears" without visual interaction.
- **Proposed Fix:** Update `soumaya.ts` to support multi-point flight paths for complex jobs (e.g., Fly to A -> "Beam Up" -> Fly to B -> "Fuse").

### 3. Destructive Merging (No Safety Net)
- **Issue:** Memory fusions permanently delete the redundant node. Hallucinations could cause data loss.
- **Proposed Fix:** Implement a `deleted_at` soft-delete column or a `merged_into_id` reference in the `nodes` table instead of hard deletion.

### 4. Performance Bottleneck (Full Scans)
- **Issue:** `/next-job` performs a full table scan and KNN for every node to find redundancy.
- **Proposed Fix:** Add a `last_maintained_at` timestamp. Only scan nodes added or modified since the last patrol.

### 5. Interaction Gap
- **Issue:** Users cannot "ping" Soumaya to prioritize a specific node for research.
- **Proposed Fix:** Add a "Request Maintenance" button in the Node Inspector UI that pushes a high-priority job to the queue.

## 🛠️ Planned Improvements (Gemini's Task List)

- [x] **Background Evolution:** Implement a basic server-side heartbeat for Soumaya to handle non-visual maintenance (e.g., pruning, calibration) while offline.
- [x] **Soft-Delete Safety:** Update `maintenanceRoutes.ts` to move merged nodes to a "tombstone" state instead of calling `repo.delete()`.
- [x] **Multi-Stop Flight:** Enhance the frontend ship logic to visit all `targets` in a job sequence.
- [ ] **Research Prioritization:** Add an API endpoint to manually queue a job for a specific node.
- [ ] **Daily Log Onboarding:** Lower the node count threshold (currently 5) or add a "Genesis Log" for new users so the UI doesn't look empty.
- [ ] **Latency Feedback:** Add a "Writing..." state to nodes in the 3D scene while the LLM is processing research/synthesis to prevent "pop-in" desync.
- [ ] **Multi-Agent Registry:** Implement the logic to support multiple ships/agents (Librarian, Scout, etc.) using the existing `agent` column.

## 📝 Change Log (Claude & Gemini)
*Track major architectural shifts and commit SHAs here.*

- **2026-06-16:** Initial roadmap established by Gemini. Identified 8 major gaps.
- **2026-06-16:** **Gemini implemented:** Soft-Delete Safety, Background Heartbeat, and Multi-Stop Navigation.
