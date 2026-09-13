# Sanctuary: Inquiries + Suggested Connections + People (Stage 2.40, task #79)

> Per Rule #1. Direct finding from the overlay/menu quality-parity audit (task #79): three whole
> real, working, server-backed sub-features (`api/mind.ts`'s Inquiries, Candidates/Suggested
> Connections, and Person suggestions) have zero UI anywhere in the Overworld — the single
> largest unused-surface finding in the audit. Direct match for the user's own "missing
> interactions, missing places to put content in" complaint.

## What already exists that this must reuse, not reinvent

- **Inquiries** (`getInquiries`/`answerInquiry`/`dismissInquiry`/`rejectInquiry`) — a real
  question Soumaya has about a memory (e.g. a gap she noticed), each carrying the node(s) it's
  about. Same list-with-actions shape `ObservatoryOverlay.tsx` already uses for Insights.
- **Candidates** (`getCandidates`/`acceptCandidate`/`dismissCandidate`) — a real review queue of
  suggested-but-not-yet-formal connections between two memories, each with a reason + score.
  Identical shape to Inquiries.
- **Person suggestions** (`getPersonSuggestions`/`dismissPersonSuggestion`) — real names the
  system noticed appearing across memories without a formal person profile yet.

## Resolved decisions

**1. Home: the Sanctuary, as three new sections.** The Sanctuary (Mind tab equivalent) already
owns the review-and-tend model for ephemeral/reviewable mental content (working-memory thoughts,
goals/ideas). These three queues are the same kind of thing — real system-noticed content
waiting for a decision — so they join it rather than getting new buildings.

**2. Full CRUD for Inquiries and Candidates; a minimal list for Person suggestions.** Inquiries
and Candidates both already have the exact list-with-accept/dismiss shape this codebase already
renders elsewhere — full parity. Person suggestions gets a real list + dismiss only this round;
`getPersonProfile` (a full profile detail view) is deliberately deferred — it implies its own
navigation/detail-view pattern that doesn't exist anywhere in the Overworld yet, and inventing
one just for this would be scope creep beyond "surface what's already there."

**3. Answering an Inquiry needs a real text answer; dismissing/rejecting/accepting are direct
button actions.** Mirrors `answerInquiry`'s own signature (it takes free text, same as the Daily
Contact question in Mission Control) — a small inline input, not a new modal.

**4. Real work credit**: answering an Inquiry, accepting a Candidate, or naming/dismissing a
Person suggestion are the Sanctuary's own real work events (`recordBuildingWork`), same
convention as its existing thought/goal actions. Merely dismissing/rejecting is not (matches the
file's own existing distinction between "created real content" and "a gesture on existing
content").

## Deferred, explicitly

`getPersonProfile` (full profile view — needs its own navigation pattern); `linkMemories`/
`pruneWeakLinks` (a separate manual-linking tool, not a review queue — out of scope for this
audit-driven pass); `updateCognitive`/`unlinkCognitive`/`pruneCognitive`/`editThought` (edit/
delete affordances for the EXISTING Sanctuary sections — a real but separate finding, worth its
own follow-up rather than bundling into this round's three-new-section addition).
