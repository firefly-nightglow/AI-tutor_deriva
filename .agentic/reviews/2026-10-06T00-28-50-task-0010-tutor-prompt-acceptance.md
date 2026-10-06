# Review audit trail — Task 0010 tutor prompt and v1 acceptance

**Scope:** Task 0010 (teaching system prompt v0.1, the prompt regression test, the v1 acceptance
walkthrough, and the follow-up maths-delimiter fix prompted by the user's acceptance run). No git
baseline exists in this workspace, so the review covers the current working tree. Reviewed state is the
tree at 2026-10-06T00:28:50+08:00.

**Shape:** Codex single-pass two-axis review (ad-review). One reviewer, axes reported separately.
Fresh-context fidelity is not claimed; this file is the packet for an optional user-spawned reviewer.

## Change inventory (relative to Task 0009)

New: `src/main/llm/__tests__/system-prompt.test.ts`;
`doc/product/v1-acceptance-walkthrough.md`; `doc/research/0010-ground-teaching-prompt.md`.

Changed: `src/main/llm/system-prompt.ts` (prompt v0.1 with version constant and changelog);
`src/renderer/src/lib/markdownSource.ts` (paired `\\(...\\)` / `\\[...\\]` conversion and multi-line
display-math promotion); `src/renderer/src/components/__tests__/MarkdownContent.test.tsx` (regressions);
`doc/tasks/0010-tutor-prompt-acceptance.md` (acceptance record and status).

## Standards sources read

- `AGENTS.md` (agentic kit `WORKFLOW.md`), `CONTEXT.md`
- `doc/adr/0001`..`doc/adr/0004` (all accepted)
- `doc/research/0010-ground-teaching-prompt.md` (implementation evidence receipt)

## Spec sources read

- `doc/tasks/0010-tutor-prompt-acceptance.md` — 3 acceptance criteria and Definition of Done
- `doc/specs/0001-tree-chat.md` — Success Criteria, especially the API-key/prompt criterion, plus
  FR-2 (Markdown + KaTeX rendering)
- `doc/product/v1-acceptance-walkthrough.md` — the six Success Criteria mapped to evidence

## Verification evidence gathered during this review

- Focused regression file: 12/12 tests pass after the multi-line display fix.
- Full suite: 168/168 tests pass across 31 files.
- `npm run typecheck` (node + web) and `npm run build` pass.
- Grounding record validation passes: 5 claims, A1/B1/C2/D1, no errors.
- The user confirmed the real-key acceptance run and the final maths rendering check on 2026-10-06.

## Standards-axis checklist applied

Prompt injection order and defaulting; whether each binding teaching constraint has a regression test;
paired versus unpaired maths delimiters; fenced-code preservation; multi-line display-math promotion;
offset consistency between the parsed source and quote slicing; and the cost of broad regular-expression
matching on model output.

## Spec-axis checklist applied

Every acceptance criterion mapped to an artefact and a verification line; the SPEC-0001 prompt criterion
checked against both injection tests and live-model evidence; the v1 walkthrough checked for stale
`待验` states; and the follow-up maths fix checked against FR-2's Markdown + KaTeX requirement.

## Findings summary

Standards: 0 Blockers, 0 Concerns, 1 Note. Spec: 0 Blockers, 0 Concerns.

No Blocker or Concern remains. The review-time regression is fixed below; the remaining Note is
informational and does not affect the acceptance decision.

## Resolution log

- **Review-time Standards regression (fixed).** The delimiter conversion produced a paired
  multi-line `$$...$$` block, but `normalizeDisplayMath` only promoted single-line blocks. The focused
  test failed with `$$a = b\nc = d$$` instead of `$$\na = b\nc = d\n$$`. The normalizer now promotes a
  standalone `$$...$$` line or block while refusing to cross an internal `$$`; unpaired delimiters are
  still left untouched, preserving the earlier runaway-math protection. Re-verified by the focused
  file, full suite, typecheck and build.
- **Standards Note (informational).** `normalizeMathDelimiters` protects fenced code blocks but not
  inline-code spans. A model that writes a literal inline example such as `` \\(x\\) `` inside inline
  code will see that example normalized to `$x$`. This is a narrow content-fidelity edge case; it does
  not break normal maths rendering or the acceptance criteria and should be revisited if Deriva later
  teaches LaTeX syntax explicitly.
- **Spec traceability (fixed).** The walkthrough still said the live prompt comparison was `待验` after
  the user had completed it. The row and section now record the user's 2026-10-06 confirmation, and the
  task acceptance item and Definition of Done are closed.

Post-fix verification: 168 tests pass, typecheck and build clean, validator clean.
