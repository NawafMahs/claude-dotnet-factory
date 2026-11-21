---
name: ui-discover
description: Inventory the current repository's front end — UI stack and versions, layouts, the design system as it actually exists (CSS sources, variables/colours, typography, spacing, components/partials, icons), RTL/LTR and localization mechanics, forms/validation, client libraries, how to run and sign in locally, and the main screens — into .factory/ui-profile.md. Use before the first UI job in a repo or when the user says "learn the UI", "design system inventory".
argument-hint: [refresh]
---

# UI discovery

A UI change fits in only if you know what "fitting in" means here. Collect facts with file paths; mark anything unconfirmed `UNVERIFIED:`. Read-only except for writing `.factory/ui-profile.md`.

## Collect

1. **Stack**: Razor Pages / MVC Views / Blazor (Server/WASM) / SPA (React/Vue/Angular) — from `.csproj` SDK and packages, `Program.cs` (`AddRazorPages`, `AddControllersWithViews`, `MapBlazorHub`), `package.json`. Areas (`Areas/*`) and their purpose.
2. **Layouts & shared UI**: `_Layout.cshtml` (and per-area layouts), `_ViewImports`, `_ViewStart`, partials (`_*.cshtml`), View Components, Tag Helpers, Blazor shared components. Name the 5–10 most reused pieces.
3. **Design system as it is**:
   - CSS framework and **version** (Bootstrap 4 vs 5 matters: `ml-*`/`mr-*` vs `ms-*`/`me-*`, `data-toggle` vs `data-bs-toggle`) from `wwwroot/lib/**` or package.json.
   - Theme/template (admin template folders like `assets/vendors`), custom stylesheets and their load order in the layout.
   - Colours, fonts, spacing scale, radii, shadows: CSS variables or the most-used values (`grep -rhoE "#[0-9a-fA-F]{3,6}\b" wwwroot/assets/css | sort | uniq -c | sort -rn | head`).
   - Recurring patterns: page header, cards, tables (DataTables?), forms, modals, toasts/alerts, badges/status chips, pagination, empty states. One example file for each.
   - Icons (Font Awesome / Bootstrap Icons / feather / SVG sprite) and version.
4. **Direction & language**: how `dir="rtl"`/`lang` is set; RTL stylesheet (`bootstrap.rtl`, `-rtl.css`); how culture is chosen (cookie, route, `Accept-Language`, `RequestLocalizationOptions`); where UI strings live (`.resx`, `IViewLocalizer`, `IStringLocalizer`, JS dictionaries). Hard-coded strings already present (as debt, not as a pattern).
5. **Forms & validation**: model validation + `jquery-validation-unobtrusive`, FluentValidation client adapters, anti-forgery usage, AJAX patterns (`$.ajax`, `fetch`) and how errors are shown.
6. **Client libraries** in use (jQuery, select2, datepickers incl. Hijri, fullcalendar, form-builder, print-js…) and where they are initialized.
7. **Run & sign in locally**: the launch entry (`.claude/launch.json` / `launchSettings.json`), URL/port, which API it needs running, how to log in with **test** credentials from the project's own seed/example config (never ask for or store real passwords), and the e2e setup if any (`e2e.config.ts`, Playwright).
8. **Screen map**: main areas and 10–20 key pages with their routes and the roles that see them.
9. **Accessibility baseline**: are labels/`for`, alt text, button vs link, focus styles generally present? (Sample 3 pages.)

## ui-profile.md

```markdown
UI-PROFILE: <repo> · <yyyy-mm-dd> · commit <sha>

## Summary
## Stack
## Layouts and shared components (with paths)
## Design system as it is
- Framework + version · theme · stylesheet order
- Colours / type / spacing (values or variables)
- Patterns: page header → path; card → path; table → path; form → path; modal → path; alert → path; empty state → path
- Icons
## Direction and localization
## Forms and validation
## Client libraries
## Run and sign in locally
## Screen map
## Accessibility baseline
## Rules for new UI (derived)
- e.g. "Use Bootstrap 4 spacing (ml/mr), not BS5 ms/me"; "Strings via SharedResource.resx"; "Tables use the DataTables init in site.js"
```

Split it like the backend profile: `ui-profile.md` at most ~3 KB (stack + version, the pattern file for each component kind, direction/localization mechanics, "Rules for new UI", how to run/sign in), everything else in `ui-profile-details.md`, read on demand. Then tell the user (Arabic) the stack, the 3 rules that matter most, and anything UNVERIFIED.
