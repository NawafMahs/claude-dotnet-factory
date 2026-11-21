---
name: verify
description: Run the repository's deterministic gate (.factory/checks.json — build, tests, protected paths) and report the real result. Use as the factory's gate stage, or whenever the user asks "does it build", "run the checks", "verify this", or before claiming any change works.
argument-hint: [--job <id>]
---

# Verify (the gate)

The gate is a script, not an opinion. Its verdict is the only basis for saying "builds" or "tests pass".

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs" [--job <id>]
```
(fallback path: `ls ~/.claude/plugins/cache/*/dotnet-factory/*/scripts`). Builds can take minutes: run it in the background when longer than ~2 minutes and wait for the notification.

- `GATE: PASS` → report the line as is.
- `GATE: FAIL` → show the failing check and the first real error (from `checks.md` → `## Failure`), not the whole log. Say whether the failure is in files this job changed. If the same check fails on a clean tree (baseline in `.factory/profile.md`), say it is pre-existing — don't fix unrelated breakage unless asked.
- `GATE: NO-CHECKS` → the repo has no gate yet. Say so plainly and offer to run the gate step of **discover**. Until then, run `dotnet build` on the affected solution yourself and label the result "manual, not gated".
- Protected path changed → the gate fails by design. Explain which file and why it is protected; only the user can decide to change it.

Never edit `checks.md`, `.factory/checks.json` or a test to change the verdict.
