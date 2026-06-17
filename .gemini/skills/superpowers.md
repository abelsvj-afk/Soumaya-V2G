# ⚡ Skill: Obra Superpowers (v2026)
*Mandatory 7-Phase Agentic Development Workflow*

## 1. Socratic Brainstorming
- Never accept a prompt at face value.
- Ask 2-3 clarifying questions to uncover hidden edge cases.
- Challenge the user's architectural assumptions if a simpler path exists.

## 2. Context Discovery
- Use `grep_search` and `glob` to map the blast radius.
- Identify every shared type, service, and UI component affected.
- Locate existing tests to use as baseline.

## 3. Technical Spec (The "Contract")
- Draft the spec in the chat.
- Must include: **Objective**, **Implementation Plan**, and **Validation Strategy**.
- Human approval is a hard gate.

## 4. Failing Test (TDD Enforcement)
- Write a reproduction script or unit test that fails.
- Proves the problem exists and defines the "success" state.

## 5. Execution (Atomic)
- Implement changes using surgical `replace` calls.
- Maintain monorepo symmetry (Shared -> Server -> Web).

## 6. Verification
- Run tests. Build the app.
- Self-critique logic for hallucinations or performance regressions.

## 7. Documentation & Sync
- Update `GEMINI_CHANGES.md`.
- Sync `SOUMAYA_ROADMAP.md`.
