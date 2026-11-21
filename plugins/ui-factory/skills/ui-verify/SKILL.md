---
name: ui-verify
description: Verify a UI change in a real browser against its UI acceptance criteria — run the app locally, check the affected pages at desktop and phone widths, in RTL and LTR, through their states and roles, with console and network checks and screenshots as evidence. Writes .factory/jobs/<id>/ui-verify.md. Also reproduces UI bugs before a fix. Use after a passing gate in the UI factory, or when the user says "check it in the browser", "verify the page".
argument-hint: [--job <id>] [reproduce]
---

# UI verify

Evidence, not impressions. Every criterion ends PASS / FAIL / NOT VERIFIED with what you saw.

## 1. Run the app (local only)

Use the run instructions in `.factory/ui-profile.md`, in this order of preference:
1. `.claude/launch.json` entry via the preview tools (`preview_start {name}`) when they're available (desktop app).
2. Otherwise start it in the background (`dotnet run --project … --urls http://127.0.0.1:<port>`) and wait for the port; stop only the process you started when done.
3. If the page needs the API too, start that first. If the app can't start, write `NOT VERIFIED: app did not start` with the error, and stop.

Only `localhost`/`127.0.0.1`. Sign in only with test credentials from the project's own seed/example config or values the user typed for this app; never real accounts, never production/staging URLs unless the user named them for this purpose.

## 2. Pick the browser tool available in this session

- Built-in browser pane (`mcp__Claude_Browser__*`): `navigate`, `read_page`/`find`, `computer` (click/type/screenshot), `resize_window` (`mobile` preset or width/height), `read_console_messages`, `read_network_requests`.
- Chrome DevTools MCP (`mcp__plugin_chrome-devtools-mcp_chrome-devtools__*`): `new_page`/`navigate_page`, `take_snapshot`, `click`/`fill`, `resize_page`, `take_screenshot` (with `filePath` to save evidence), `list_console_messages`, `list_network_requests`, `lighthouse_audit` (accessibility).
- The repo's e2e runner (`e2e.config.ts`) when a deterministic test is wanted — write it under `tests/*.e2e.ts` only if the plan includes it.

Prefer text reads (accessibility tree, console, network) to judge; screenshots are the evidence for layout.

## 3. Check, per affected page

For each UI acceptance criterion in plan.md, plus always:
- **Widths**: 1366×768 and 375×812. Nothing overflows horizontally, nothing overlaps, tables scroll inside their container.
- **Directions**: each language the app supports (switch the culture the way ui-profile says). Alignment, icons, spacing mirror correctly; no untranslated or hard-coded strings (look for English on the Arabic page and vice versa).
- **States**: loading, empty, error, validation, no-permission — reach each one (e.g. submit an empty form, filter to no results, sign in as a role without access) without changing real data; on a dev DB, only create records the plan allows and say which.
- **Console**: no new errors/warnings caused by the change (note pre-existing ones separately).
- **Network**: no 4xx/5xx on load or on the tested actions; no request to unexpected hosts.
- **Keyboard**: tab through the new/changed controls; focus is visible and in order; Enter/Escape do what they should in forms/modals.

Reproduce mode (UI bug): do the same on the **unfixed** code, capture the failing state (screenshot + console/network), and write it as the baseline in ui-verify.md before investigation.

## 4. ui-verify.md

```markdown
UI-VERIFY: PASS | FAIL | PARTIAL

## Summary
- 3-5 bullets
## Environment
- URL, commit, user/role used (test account name only), browser tool
## Criteria
1. <criterion> — PASS/FAIL/NOT VERIFIED — what was seen — evidence: ui/<file>.png
## Console and network
## Not verified
- what and why
```

Save screenshots as `ui/<page>-<desktop|mobile>-<rtl|ltr>.png` in the job folder when the tool can write files; otherwise describe what the screenshot showed. Stop the app/browser sessions you started.
