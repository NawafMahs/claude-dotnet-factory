---
name: build
description: Implement an approved plan (or a small fix) in the repo's own style, verify each acceptance criterion with real commands, and write .factory/jobs/<id>/build.md. Also used to address review findings or gate failures in a later round. Use as the factory's build stage or when the user says "implement the plan".
argument-hint: [--job <id>] [round <n>]
---

# Build

Preconditions: `plan.md` starts with `PLAN: APPROVED` (or the job is on the small-fix track). If not, stop and say so.

## Before the first edit

- `git status --porcelain` and `git branch --show-current`. Record both in build.md. **Pre-existing uncommitted changes belong to the user**: never revert, reformat or stage them; if they overlap files in scope, stop and ask.
- If on a protected branch (see profile), propose a branch name in the repo's style (`git log --oneline -20` / `git branch -a` for the pattern, e.g. `fix/…`, `feat/…`) and create it only with the user's yes.
- Read the files in scope **and** the example the plan says to copy.

## While building

- Exactly the plan's scope. A needed file not in the plan → stop, explain, get a yes, add it to plan.md Scope.
- Match surrounding code: naming, async style, DI registration, error/response envelope, logging, comment density.
- Repo conventions from the profile always apply (e.g. user-facing messages in `.resx` + accessor class, never inline strings).
- EF Core: no N+1 (Include/projection), `AsNoTracking` for reads where the repo does, no client evaluation surprises, transactions where the existing code uses them. Dapper/SQL: parameters only, never string-concatenated input.
- Migrations / SQL scripts: create them as files only. Applying them anywhere is the user's call.
- No new packages unless the plan's Decisions approved one.
- Never run repo-wide formatters or `--fix` linters; touch only lines you change.

## Verify (in this stage, before the gate)

For each acceptance criterion run its check and record the evidence: the command and the relevant output, or the request/response, or the query result. If a check cannot be run here (no DB, needs a deployed service), write `NOT VERIFIED: <why>` — never imply it passed.

Then run the gate yourself once (`node "${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs"` without `--job`) so the official gate run in verify is not the first time it builds.

## Later rounds

- Gate failure: read `checks.md` (and `checks.log` if needed), fix the cause. Never weaken, skip or special-case a test to make it pass.
- Review findings: fix only `VERDICT: CHANGES` findings. If you disagree with one, don't fix it — write why under `## Disputed` for the user to decide.

## build.md

```markdown
STATUS: READY | BLOCKED

## Summary
- 3-5 bullets
## Round
- n · branch · starting `git status` (pre-existing changes listed and left untouched)
## Changes
| File | What changed |
## Acceptance criteria evidence
1. <criterion> — PASS/FAIL/NOT VERIFIED — <command → result>
## Disputed
## Notes for reviewers
```

Overwrite build.md each round but keep a `## History` line per previous round.
