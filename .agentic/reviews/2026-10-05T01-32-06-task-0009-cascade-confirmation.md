# Review audit trail — Task 0009 cascade confirmation, naming rules and model badges

**Scope:** Task 0009 (destructive-delete confirmation with the affected descendant count, duplicate-name
rules, and the per-message model badge). No git baseline exists, so the review covers the working tree.
Reviewed state is the tree at 2026-10-05T01:32+08:00.

**Shape:** Codex single-pass two-axis review (ad-review). One reviewer, axes reported separately.
Fresh-context fidelity is not claimed; this file is the packet for an optional user-spawned reviewer.

## Change inventory (relative to Task 0008)

New: `src/renderer/src/components/__tests__/SubjectSidebar.delete.test.tsx`;
`doc/research/0009-ground-cascade-delete-confirmation.md`.

Changed: `src/renderer/src/lib/grouping.ts` (`descendantCounts`); `SubjectSidebar.tsx` (the two-step
inline confirm replaced by a platform `<dialog>`, new `descendantCounts` prop); `App.tsx` (computes and
passes the counts); `styles.css` (dialog + backdrop tokens); `grouping.test.ts` and
`chat-service.test.ts` (counting and FR-13 coverage).

## Standards sources read

- `AGENTS.md` (agentic kit `WORKFLOW.md`), `CONTEXT.md`
- `doc/adr/0001`..`doc/adr/0004` (accepted); ADR-0004's hard-delete decision (OQ-3) is what this task
  implements
- `doc/research/0009-ground-cascade-delete-confirmation.md` (implementation evidence receipt)

## Spec sources read

- `doc/tasks/0009-deletion-rename-model-badge.md` — 4 acceptance criteria, 4 plan items, DoD
- `doc/specs/0001-tree-chat.md` — FR-11, FR-12, FR-13, and the "delete cascades, no recycle bin"
  decision recorded in SPEC-0001's resolved Open Questions

## Verification evidence gathered during this review

- `npx vitest run` — 160 tests pass (30 files).
- `npm run typecheck` (node + web) and `npm run build` clean.
- Dev smoke check healthy.
- The user verified live: the modal confirmation names the affected descendant count, Esc cancels, focus
  stays inside the dialog, confirming removes the subtree, the open pane closes and focus returns to the
  parent, and the dialog matches the dark theme.

## Standards-axis checklist applied

Platform-API fallbacks (`showModal`/`close` absent under jsdom), accessibility exposure of a closed
dialog, what a destructive action should disclose before it runs, and whether the same protection is
applied to every destructive control in the sidebar.

## Spec-axis checklist applied

Each acceptance criterion mapped to an artefact and a verification line; FR-13 checked as a behavioural
claim about model switching rather than as a new field.

## Findings summary

Standards: 0 Blockers, 0 Concerns, 2 Notes. Spec: 0 Blockers, 0 Concerns.

No Blocker or Concern on either axis. The two Notes are recorded below; one is a small UX asymmetry in
the sidebar, the other documents a deliberate verification limitation.

## Resolution log

- Standards Note 1 (asymmetric destructiveness) — **delete a subject has no confirmation** while deleting
  a conversation does: `onDeleteSubject` fires immediately (SubjectSidebar.tsx:134). It is not a data
  loss (the FK is `ON DELETE SET NULL`, so its conversations fall back to 未分类), but a subject holding
  many conversations is moved without warning. Recorded for Task 0010's acceptance sweep rather than
  fixed here, because SPEC-0001 does not require it and the shape of the prompt depends on whether v1
  keeps subjects as the only grouping.
- Standards Note 2 (native dialog behaviour) — `showModal()` and `close()` are guarded because jsdom has
  no `HTMLDialogElement`; a closed dialog is correctly absent from the accessibility tree, which is why
  the test targets it by selector. Esc handling and focus return were confirmed by the user, not by an
  automated test.

Post-review verification: no code changed during this review; 160 tests, typecheck and build remain
green.
