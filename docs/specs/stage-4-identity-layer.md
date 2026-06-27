# Spec — Stage 4: Wire the soul / identity / user context layer

> Design per [AI_ENGINEERING_WORKFLOW.md](../AI_ENGINEERING_WORKFLOW.md). **No code until approved.**
> Parent: [SECOND_BRAIN_ALIGNMENT.md](../SECOND_BRAIN_ALIGNMENT.md). Status: **DRAFT — files authored,
> runtime wiring pending.**

## 🎯 Objective

The briefing's highest-named-ROI layer: give Soumaya a persistent, editable identity instead of a
voice scattered across code. The canonical files now exist at repo root —
[`soul.md`](../../soul.md) (voice/values/boundaries, Lineage B 8-layer), [`identity.md`](../../identity.md)
(name badge), [`user.md`](../../user.md) (who she serves + authority levels). This stage **wires them
into the runtime** so Soumaya actually reads from them.

## 📐 Architecture / blast radius

| Layer | Change | Zone |
|-------|--------|------|
| `server` chat/agent prompt assembly (`chat/graphrag.ts`, `persona/derive.ts`, maintenance voice) | Inject `soul.md` (identity slot) + relevant `user.md`/derived owner profile into the system context. | 🔴 provider seam |
| Loader | Read the `.md` files at boot (bundled/served), parse frontmatter; fall back to current code persona if absent. | 🔴 |
| Per-space owner profile | Keep the existing `user_persona` derivation; `user.md` is the *global template*, the per-space derived profile is the live value. | 🔴 |
| Companion UI (optional) | Surface soul/identity as editable, like instruction profiles. | 🟢 |

## Logic

- On boot, load + cache `soul.md`/`identity.md` (global) and resolve the per-space owner profile
  (derived `user_persona`, seeded by `user.md`'s template).
- Chat/synthesis/maintenance system prompts get the soul identity in slot #1 + the owner profile.
- **Offline-safe:** if files are missing or the LLM is the heuristic, fall back to today's coded
  persona — never break the no-key path.

## Caveats (carry from the briefing)

- **Context, not constraint** — real limits stay in the harness (fuel/Research-Mode gating, USD
  budget, space scoping). Never put secrets in these files.
- **Persona drift is guaranteed** over long chats — design for re-anchoring (a condensed identity
  re-injected periodically), not prevention.
- **Don't over-stuff** — un-curated/over-long context files measurably *hurt* (ETH Zürich study).
  Keep `soul.md` within the Opus budget (~1,500–2,500 tokens), hand-curated.

## 🧪 Test plan

- Loader parses frontmatter + body; missing file → coded-persona fallback (no throw).
- Prompt assembly includes soul identity + owner profile; offline path unchanged.
- Space scoping: one brain's owner profile never leaks into another's prompt.
- Gate green.

## ✅ Acceptance criteria

1. Soumaya's chat/synthesis voice visibly derives from `soul.md` (editing it changes her tone).
2. Removing the files degrades gracefully to today's behavior.
3. Per-space owner context is honored and isolated. Gate green.

## Open questions

1. Bundle the `.md` files into the server image, or store editable copies per-space in the DB
   (seeded from these)?
2. Should the owner be able to edit Soumaya's `soul.md` from the Companion tab (with git/audit), or
   is it read-only canon?
