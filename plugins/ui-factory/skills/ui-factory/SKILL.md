---
name: ui-factory
description: Run a UI task — a new page/screen, a change to an existing page, a UI bug, or visual polish — through the factory with UI-specific stages (design-system inventory, UI acceptance criteria, optional mockup approval, UI build rules, browser verification, UI review). Use when the user types /ui-factory:ui-factory <task> or hands over front-end work (Razor Pages/MVC views, Blazor, React/Vue, CSS/JS) on a .NET system.
argument-hint: <UI task, ticket text or screenshot description> | status
---

# UI factory

This extends the **dotnet-factory** pipeline; it doesn't replace it. Same job folder (`.factory/jobs/<id>/`), same scripts, same human checkpoints. If dotnet-factory is not installed, say so and stop — the gate, router and guard come from it.

`$S` = dotnet-factory's scripts folder (`ls ~/.claude/plugins/cache/*/dotnet-factory/*/scripts`).

## 0. Preconditions

1. `.factory/profile.md` exists (else run `dotnet-factory:discover`).
2. `.factory/ui-profile.md` exists (else run **ui-discover** now). It tells you the UI stack, where styles and components live, how to run and sign in locally, and how RTL/LTR switches.

## 1. Classify

| Track | Stages |
|---|---|
| **new screen** | investigate → plan (+ UI criteria) → *mockup* → ✋ → ui-build → gate → ui-verify → review → ✋ deliver |
| **change to a screen** | investigate → plan (+ UI criteria) → ✋ → ui-build → gate → ui-verify → review → ✋ deliver |
| **UI bug** | ui-verify first to **reproduce** (screenshot + console/network) → investigate → plan → ✋ → ui-build → gate → ui-verify → review → ✋ deliver |
| **polish** (spacing, alignment, copy) | ui-build → gate → ui-verify → ui review → ✋ deliver |

Backend work the screen needs (an endpoint, a query) goes in the same job and gets the normal dotnet-factory reviewers; the router picks them from the diff.

## 2. Stages that differ from dotnet-factory

- **plan** — use `dotnet-factory:plan`, and add a `## UI acceptance criteria` section. Every criterion is checkable in a browser:
  - Layout at desktop (1366×768) and phone (375×812) widths
  - Both directions/languages the app supports (e.g. Arabic RTL and English LTR), all text from the localization resources
  - States: loading, empty, error, validation errors, no-permission (per role the screen serves)
  - Interactions: what each button/link does; keyboard reachable; focus visible
  - No new console errors; no failed (4xx/5xx) requests on the page
- **mockup** (new screens, optional elsewhere) — before writing views, show the user a static mockup built from the app's **own** CSS and components (inventory in ui-profile), e.g. `ui/mock.html` in the job folder, linking the stylesheets of the locally running app. Show it at both widths and directions. **✋ The user approves the mockup with the plan.** Skip it if the user says the plan is enough.
- **ui-build** skill instead of `dotnet-factory:build` for view/style/script files (backend files in the same job follow `dotnet-factory:build`'s rules).
- **gate** — `node "$S/gate.mjs" --job <id>` as usual (it proves compilation, including Razor views when the build compiles them).
- **ui-verify** skill after a passing gate → `ui-verify.md` + screenshots in `ui/`.
- **review** — `node "$S/route.mjs" --job <id>`; view/style changes route `ui-reviewer` automatically (`ui-factory:ui-reviewer`). Run reviewers in parallel as in `dotnet-factory:review`.

Everything else (checkpoints, deliver, remember, status/resume) is exactly the dotnet-factory flow.
