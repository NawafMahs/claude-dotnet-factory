---
name: investigate
description: Investigate before changing anything — find the root cause of a bug, or the impact area of a feature/change, with evidence (file:line, data, logs, a reproduction). Writes .factory/jobs/<id>/context.md when inside a factory job. Use for "why does X happen", "where is X handled", "what would changing X affect", or as the factory's first stage.
argument-hint: <bug report, question or change to assess> [--job <id>]
---

# Investigate

Output is understanding, not code. Do not edit source files in this stage.

## Order of sources (cheapest first)

1. `.factory/knowledge/INDEX.md` — has this been investigated before? Read the matching note and **verify it is still true** (files still exist, code still looks like that) before relying on it.
2. `.factory/profile.md` — where this kind of logic normally lives.
3. **Knowledge graph — mandatory first step when `graphify-out/graph.json` exists.** `graphify query "<question>" --budget 1500`, `graphify explain "<Symbol>"`, `graphify path "<A>" "<B>"`. The graph tells you *which files and symbols*; the code tells you *what the logic does*. Known gaps: static helper calls, string keys and SQL are not edges — Grep for those only. If the session start said the graph is stale, run `graphify update .` first (AST only, no LLM tokens).
4. Code: **by range, not whole files.** `grep -n` the method, then Read with offset/limit around it (large code files can only be read by range — the guard enforces it). Spawn the `dotnet-factory:investigator` agent only when the question needs more than ~10 files; for a narrower question an agent costs more than it saves (it re-reads the profile and starts cold). Several independent wide questions → several investigators in one message.
5. Data: the repo's **local** reference database (see profile), read-only `SELECT`s. Never query a non-local server without the user's yes (the guard asks).
6. Runtime: logs, a running app (preview / launch.json), a request in Postman/newman or curl against localhost.

## Bug track

- Restate the expected vs actual behaviour in one line each.
- Trace the request path end to end (controller/page → service → data access → DB) and name the exact line where behaviour diverges.
- Prove it: a reproduction (request + response, a failing test, a query result) or say clearly that you could not reproduce and what you tried.
- Separate **root cause** from **symptom**. If several causes are plausible, rank them with the evidence for each; don't pick one by intuition.
- Note the blast radius: other callers of the faulty code (graph `explain` / Grep for usages).

## Feature / change track

- Where the change lands (following existing patterns — name the example you'll copy).
- Everything it touches: callers, DTOs/contracts consumed by other apps, DB tables, permissions/roles, workflow steps, notifications, localization (resx), reports.
- Business rules involved, with the code that implements them today.
- Open questions only the user can answer (keep these for plan; ask now only if investigation cannot continue).

## context.md

```markdown
CONTEXT: <ROOT-CAUSE FOUND | CAUSE LIKELY | NOT REPRODUCED | IMPACT MAPPED>

## Summary
- 3-5 bullets

## Graph
- graphify commands run (or `graph unavailable`)

## Evidence
- path:line — what it shows
- repro / query / log excerpt (no secrets, no personal data from real records)

## Affected area
## Business rules involved
## Open questions
```

Outside a factory job, answer the user directly in Arabic with the same evidence, and offer the **remember** skill if the finding is worth keeping.
