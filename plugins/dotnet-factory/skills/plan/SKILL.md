---
name: plan
description: Turn an investigated task into a reviewable implementation plan — exact scope (files), approach following the repo's existing patterns, acceptance criteria that can be verified, risks, and what is explicitly out of scope. Writes .factory/jobs/<id>/plan.md as PLAN: DRAFT for the user to approve. Use as the factory's planning stage or when the user asks "plan this before you code".
argument-hint: [--job <id>]
---

# Plan

A plan is a contract with the user: after approval, build does exactly this and nothing more. It must be short enough that the user actually reads it.

Read first: `task.md`, `context.md`, `.factory/profile.md`. For a large feature with many unknowns, say so and suggest the user's Speckit flow (`/speckit-specify` → `/speckit-plan` → `/speckit-tasks`) instead of forcing it into one plan — then link the Speckit artifacts from plan.md.

## Rules

- **Follow the repo.** The approach copies an existing pattern and names it ("same as `TrademarksController.Search` → `ITrademarkService`"). Do not introduce a new layer, library, pattern or abstraction unless the task requires it; if you think it does, list it under Decisions for the user with the alternative.
- **Smallest change that meets the request.** Every file in scope must be justified by the request. No opportunistic refactors, renames or formatting.
- **Acceptance criteria are tests.** Each one says how it will be verified: a build, a unit/integration test, a request with expected status/body, a query, or a page state. "Works correctly" is not a criterion.
- **Business rules explicit.** If behaviour of a workflow state, approval, permission, fee or notification changes, state the old and the new rule.
- **Compatibility.** Note any change to public contracts (DTO fields, routes, status codes), DB schema (migration or SQL script, and whether it is backward compatible), configuration keys.
- Ask the user only what the code cannot tell you, at most 3 questions, in Open questions.

## plan.md

```markdown
PLAN: DRAFT

## Summary
- 3-5 bullets: what will change and why

## Scope
| File | Change |
|---|---|
| path | one line |

## Approach
- Steps, naming the existing pattern each one follows

## Acceptance criteria
1. <observable outcome> — verify by: <command / request / test / query>

## Risks and compatibility
## Out of scope
- Things noticed but deliberately not done (one line each)
## Decisions for the user
## Open questions
```

Only the orchestrator (after the user's yes) changes the first line to `PLAN: APPROVED`.
