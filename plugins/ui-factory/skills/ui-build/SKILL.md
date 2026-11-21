---
name: ui-build
description: Implement an approved UI plan (views, components, styles, client scripts) so it looks and behaves like the rest of the application — reusing its layouts, components, classes, localization and validation patterns, safe in RTL and LTR, accessible, and with every state handled. Writes build.md like dotnet-factory:build. Use as the UI factory's build stage.
argument-hint: [--job <id>] [round <n>]
---

# UI build

Everything in `dotnet-factory:build` applies (approved plan, exact scope, pre-existing changes untouched, no new packages without a decision, evidence per criterion, build.md format). Read `.factory/ui-profile.md` first — its "Rules for new UI" override generic habits.

## Fit in

- **Copy the closest existing screen.** Name it in build.md. Same layout, page header, card/table/form markup, spacing classes, button styles and order (primary/secondary), icon set.
- **No new styling systems.** No new CSS framework, CDN link, font or icon pack. Prefer existing classes; when CSS is really needed, add it to the repo's existing custom stylesheet, using its variables/values — no inline `style=""`, no hard-coded colours that already exist as a class or variable.
- **Framework version matters** (from ui-profile): e.g. Bootstrap 4 → `ml-/mr-`, `data-toggle`; Bootstrap 5 → `ms-/me-`, `data-bs-toggle`.

## Direction & language

- All visible text, titles, placeholders, button labels, validation and toast messages come from the repo's localization resources (resx / localizer) — never inline Arabic or English strings, including in JS (use the repo's existing pattern for passing strings to scripts).
- RTL-safe: no `left/right`-specific spacing or floats where logical equivalents or the repo's RTL stylesheet handle it; icons with direction (arrows, chevrons) flip; numbers/dates follow the repo's formatting (including Hijri if used).

## Behaviour & states

- Loading, empty, error, validation and no-permission states, as the plan lists them.
- Server stays authoritative: client validation mirrors server validation, never replaces it; hiding a button is not authorization (the server check must exist — flag it if it doesn't).
- Forms: anti-forgery token as the repo does it; disable submit while posting; show server errors where the repo shows them.
- Output encoding: Razor `@` by default; `Html.Raw` / `innerHTML` only for trusted, sanitized content — and say so in build.md.

## Accessibility

Real `<button>`/`<a>` for actions vs navigation; `<label for>` (or `asp-for` label) for inputs; `alt` on images; visible focus; logical tab order; modals trap and return focus; colour is not the only signal for status.

## Evidence

Compile (gate), then hand over to **ui-verify** for the browser evidence; in build.md list each UI acceptance criterion as `PENDING ui-verify` rather than claiming it.
