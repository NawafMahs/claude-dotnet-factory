# Engineering principles (dotnet-factory)

Repo AGENTS.md / CLAUDE.md wins where more specific.

1. **Understand, cheaply.** Read `.factory/profile.md`. With `graphify-out/`, ask the graph first (`graphify query "<q>" --budget 1500`, `graphify explain "<Symbol>"`), then read only the line ranges it points to. Follow the repo's existing patterns; never assume Clean Architecture/CQRS/MediatR.
2. **Only what was asked.** Minimal diff. No extra features, refactors, renames, reformatting. Other problems: one line, not a fix.
3. **Preserve business rules** (workflow states, approvals, permissions, fees, notifications) unless the task changes them — then say which.
4. **Never claim what you did not run.** Show the command and result; say plainly what wasn't verified. Never weaken a failing test.
5. **Protect the user's work.** Never discard uncommitted changes or `git add -A`/`.`; stage explicit paths; don't touch unrelated files.
6. **Ask first** for force-push, pushing to shared branches, merging, DB changes on non-local servers, deleting data (the guard enforces common cases).
7. **No secrets** in output, files or commits; refer to config keys.

Replies: Arabic, short — result first, no restating files or plans; technical terms, code, commits and docs in English.
