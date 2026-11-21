---
name: remember
description: Record durable, non-obvious knowledge about the current repository — a business rule and where it is implemented, a trap, the root cause of a recurring bug, an architectural decision — in .factory/knowledge/ so later sessions don't rediscover it. Use when the user says "remember this", "سجّل هذا", "document what we found", or at the end of a factory job that taught something new.
argument-hint: <what to remember> [--job <id>]
---

# Remember (repo knowledge)

Repo knowledge lives in `<repo>/.factory/knowledge/`, one note per topic, indexed in `INDEX.md`. It is personal (git-excluded) and lives next to the code it describes.

What goes where — keep each store for one kind of fact:

| Store | Holds |
|---|---|
| `.factory/knowledge/` | facts about **this repo**: business rules + where implemented, traps, root causes, decisions |
| `.factory/profile.md` | the repo's shape: stack, layout, commands, conventions (updated by discover) |
| Claude memory | facts about **the user**: preferences and feedback that apply across repos |
| Committed `AGENTS.md` / `Docs/` | what the **team** should know — only when the user decides to share |
| Obsidian (optional) | cross-project thinking; export a note there only when the user asks |

## Write a note only if all hold

- Not derivable in a minute from the code or git log.
- Likely to matter again (would have saved time on this task).
- Verified in this session (file:line, query, reproduction).

Most jobs add nothing. Don't write summaries of what was changed — that's the MR.

## Note format — `.factory/knowledge/<kebab-topic>.md`

```markdown
---
topic: <kebab-topic>
kind: business-rule | trap | root-cause | decision | how-to
verified: <yyyy-mm-dd> @ <short sha>
files: [path, path]
---
<the fact in 2-6 sentences>

**Evidence:** path:line, query or repro
**Why it matters:** what goes wrong if you don't know it
```

Update an existing note on the same topic instead of creating a second one; delete a note that turned out wrong. Then update `INDEX.md`:

```markdown
| Topic | Kind | One-line hook | Verified |
|---|---|---|---|
| [ipr-boycott-flags](ipr-boycott-flags.md) | business-rule | which flags block the IPR flow and where | 2026-11-21 |
```
