---
name: deliver
description: Deliver a verified, reviewed change — commit only the job's files, push the feature branch, and open the MR/PR through the repository's own delivery skill (e.g. a create-mr skill for GitLab, a create-pr skill for Azure DevOps) or the generic CLI. Writes .factory/jobs/<id>/delivery.md. Use only after the user explicitly says to deliver/commit/push/open the MR.
argument-hint: [--job <id>]
---

# Deliver

Precondition: the user said yes to delivery **in this conversation**. Gate `PASS` and reviews `PASS` (or the user explicitly accepted the remaining findings). Otherwise stop and say what is missing.

## 1. Pick the delivery adapter — don't rebuild what exists

Look in this order and use the first that fits:

1. The delivery section of `.factory/profile.md`.
2. A repo-specific skill in the available skills list (e.g. `create-mr`, `create-pr`) — invoke it with the Skill tool and let it own the MR/PR format, assignee and reviewer conventions.
3. The user's memory for this project (e.g. an MR workflow note).
4. Generic fallback from `git remote -v`: GitLab → `glab mr create`, GitHub → `gh pr create`, Azure DevOps → `az repos pr create`. Draft by default.

## 2. Commit

- Stage **only** the files listed in build.md `## Changes`, by explicit path. Never `git add -A` / `git add .`. Pre-existing user changes stay unstaged.
- Show `git diff --cached --stat` and confirm it matches build.md.
- Commit message in the repo's style (`git log --oneline -15`), e.g. `fix(api): …`. Add the attribution trailer the session asks for.

## 3. Push and open the MR/PR

- Push only the feature branch: `git push -u origin <branch>`. Never to a protected branch; never force unless the user asked for it on their own branch (the guard asks).
- Open the MR/PR via the adapter. The description must come from build.md, plan.md and checks.md: what changed, why, how it was verified (gate line + criteria evidence), what was **not** verified, ticket link.
- Never merge or approve. That is the human reviewer's job.

## delivery.md

```markdown
DELIVERED: <MR/PR URL>

## Summary
- branch, commit sha(s), target branch
- adapter used
- verification carried into the description
```
