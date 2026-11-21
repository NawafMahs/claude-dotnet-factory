---
name: discover
description: Build or refresh the factory's profile of the current repository — stack, architecture as it actually is, conventions, how to build/test/run, delivery target, database access, risky areas — and set up its gate (.factory/checks.json). Use on first use of the factory in a repo, when the user says "discover/learn/profile this repo", or when .factory/profile.md is missing or stale.
argument-hint: [refresh]
---

# Discover a repository

Goal: a short, **true** profile that every later stage reads instead of re-discovering the repo. Facts only, each one checked against a file. Where you could not confirm something, write `UNVERIFIED:` in front of it.

`$S` = `${CLAUDE_PLUGIN_ROOT}/scripts` (fallback: `ls ~/.claude/plugins/cache/*/dotnet-factory/*/scripts`).

## Steps

1. `node "$S/job.mjs" init` — creates `.factory/` and hides it from git via `.git/info/exclude` (it is personal state; nothing is committed or shared).
2. **Read what already exists first** and don't contradict it: `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/`, `README*`, `Docs/`, the user's Claude memory for this project, repo-specific skills in `~/.claude/skills` (e.g. an MR skill for this repo). The profile links to them instead of copying them.
3. **Structure.** If the repo has vendor/third-party code (e.g. `wwwroot/lib`, `assets/vendors`, minified JS), make sure a `.graphifyignore` excludes it (add `/.graphifyignore` to `.git/info/exclude` so the team never sees it) — vendor code bloats the graph and every query. Prefer the knowledge graph when `graphify-out/graph.json` exists (`graphify query` / `explain`; GRAPH_REPORT.md for communities). Otherwise, for a large repo, spawn `dotnet-factory:investigator` with: "Map this solution: projects and their references, entry points, layering, where business logic, data access, validation, auth and messages live. Return file paths." Small repo: read the `.sln`, each `.csproj` and `Program.cs` yourself.
4. **Facts to collect** (each with the file that proves it):
   - Target frameworks, SDK style, key packages (EF Core / Dapper / MediatR / FluentValidation / AutoMapper / Identity / JWT), and their versions.
   - The architecture **as it is** (e.g. "layered: API → Services → Library(EF)", "Clean Architecture with MediatR handlers"), the dependency direction, and where a new endpoint / service / query normally goes. Name one existing example of each.
   - Conventions that differ from defaults: localization (resx?), response envelopes, error handling, naming, DI registration style, logging.
   - Database: provider, DbContext(s), migrations or SQL scripts, which DB is the local reference, whether DB-first scaffolding is used.
   - Build, test, run: exact commands that work here. Test projects (or the fact there are none). Launch profiles / `.claude/launch.json` entries.
   - Delivery: remote host (`git remote -v`: GitLab / GitHub / Azure DevOps), default target branch, existing MR/PR skill to delegate to, ticket system (Trello / Jira / issues).
   - Protected branches (from what you see: e.g. `trunk`, `Development`).
   - Hot spots: god classes, legacy areas, things that break often (from git log churn: `git log --since=6.months --name-only --format= | sort | uniq -c | sort -rn | head -20`).
5. **Gate.** Propose `.factory/checks.json` and **ask the user before writing it** (the guard will also ask). Start with the cheapest check that proves the code compiles, then tests if they exist:

   ```json
   {
     "base_branch": "origin/<target branch>",
     "checks": [
       { "name": "build", "run": "dotnet build <Solution>.sln -nologo -v q -clp:ErrorsOnly", "timeout_sec": 900 },
       { "name": "test",  "run": "dotnet test <Solution>.sln --no-build -nologo -v q", "timeout_sec": 1200 }
     ],
     "protected_paths": ["**/appsettings.Production.json", "**/*.pfx"]
   }
   ```
   Run `node "$S/gate.mjs"` once on the current tree to prove the checks work, and record the result (and time) in the profile. If the build is already broken on a clean tree, write that down — the gate must not be blamed on the next job.
6. **Guard.** If the repo's protected branches are not in the defaults (`main, master, develop, development, release/*, production, prod, staging`), propose `.factory/guard.json` `{ "protected_branches": [...] }` and ask before writing.
7. Write `.factory/profile.md` + `.factory/profile-details.md` (format and size limits below) and `.factory/knowledge/INDEX.md` (empty table if new).
8. Tell the user, in Arabic, the 5 most important things you learned and anything `UNVERIFIED`. Offer (don't do) to promote stable facts into a committed `AGENTS.md` for the team — that is the user's call.

## profile.md format

```markdown
PROFILE: <repo name> · discovered <yyyy-mm-dd> · commit <short sha>

## Summary
- 3-5 bullets: what this system is, its shape, the one thing that surprises newcomers

## Stack
## Architecture (as it is)
- Layers / projects and dependency direction
- Where things go: endpoint → <example path>; service → ...; query → ...; validation → ...; messages → ...
## Conventions that differ from defaults
## Database
## Build · Test · Run
- Gate: <checks> — baseline result <PASS/FAIL> in <n>s on <date>
## Delivery
- Host, target branch, MR/PR skill to use, ticket system, protected branches
## Hot spots and traps
## Existing docs to read
- Links, not copies
```

**Two files, because every session and every agent reads the first one:**
- `profile.md` — at most ~3 KB / 35 lines: Shape (layers + one example path per kind), Rules that differ from defaults, Build·verify·deliver one-liners, Traps (god files to read only by range, high-risk areas). Terse bullets, no prose.
- `profile-details.md` — everything else in the format above (full stack, package versions, DB detail, hot-spot numbers, docs). Read on demand, one section at a time.

With `refresh`, diff against the old files and update only what changed (bump the date and sha). Also refresh the graph (`graphify update .`, AST only, no LLM tokens) if it is older than the last commits.
