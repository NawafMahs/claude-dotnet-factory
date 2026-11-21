---
name: dashboard
description: Open the factory dashboard — a live kanban (Intake · Plan · Build · Review · Needs you · Done) of every factory job in every registered repository, with gate and reviewer verdicts, rounds, timing, MR links, and each job's stage files. Use when the user types /dotnet-factory:dashboard or asks to see the factory board, job status visually, or "what is waiting on me".
argument-hint: [port]
---

# Dashboard

Read-only local web page. Approvals and feedback still happen in the chat; the board only shows state.

1. Start the server **in the background** (it keeps running across turns; a second start just reports the running URL):
   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/dashboard.mjs" --port <port or 4777>
   ```
   Fallback path: `ls ~/.claude/plugins/cache/*/dotnet-factory/*/scripts`. It prints `DASHBOARD: http://127.0.0.1:4777/ (n repo(s): …)`.
2. Open the URL for the user: in the Claude desktop app use the browser pane (`preview_start` with `url`); otherwise `Start-Process http://127.0.0.1:4777/` (Windows) / `open` / `xdg-open`.
3. Say in one line which repos it shows. Repos appear once `job.mjs init` (run by discover) has registered them in `~/.software-factory/repos.json`; the repo the server starts in is registered automatically if it has `.factory/`.

Columns map from each job's files (see `scripts/jobs.mjs` `COLUMN`): `awaiting-approval`, `blocked` and `reviewed` land in **Needs you** with a red "YOUR CALL" card. Clicking a card shows its stage files (task, context, plan, build, checks, route, reviews, delivery).

To stop it, stop the background task that runs it.
