# DialogLingo Interface System

## Direction

DialogLingo is an evidence workbench for turning local agent sessions into reviewable English-learning material. It should feel like a calm local productivity tool with a visible provenance trail, not a chat browser, dashboard, learning game, or marketing surface.

Codex Desktop remains a reference for restraint and desktop utility, but it is not a visual lock. The interface may use a stronger product identity when it supports the core workflow:

`local sessions -> selection -> generation -> review workbook -> export`

## Palette

- `canvas porcelain` `#f6f6f4`: main app canvas.
- `panel white` `rgba(255, 255, 255, 0.84)`: chrome, sheets, drawers, and elevated panels.
- `ink slate` `#111827`: primary text and selected top-level actions.
- `line gray` `#d8dce2`: borders, dividers, and low-emphasis structure.
- `evidence amber` `#d97706`: source positioning, active evidence thread, and search match focus.
- `review sage` `#5f7f68`: modified, saved, and reviewed states.
- `danger red` `#b42318`: destructive, failed, and flagged-risk states only.

Use amber and sage sparingly. Color communicates evidence and review state; gray carries the layout.

## Type

- Use system UI faces for primary interface text: `SF Pro Text`, `PingFang SC`, `Helvetica Neue`, sans-serif.
- Use mono faces for metadata, paths, prompt text, source counts, and export manifests: `SFMono-Regular`, `Menlo`, `Monaco`, monospace.
- Keep headings compact inside panels. DialogLingo is a workbench; workbook cards should not use hero-scale display type.

## Depth And Motion

- Dense list and card surfaces use subtle borders and quiet surface shifts.
- Reserve blur/translucency for app chrome, sheets, source drawers, and sticky toolbars.
- Avoid heavy glass, large shadows, and nested-card styling inside dense workflows.
- UI motion should be quick and explanatory: 120-180ms for controls, up to 220ms for drawers/sheets.
- Respect reduced motion. Text preview scrolling and transcript surfaces must not feel animated for decoration.

## Workbook Pattern

Workbook cards are review records, not generic form cards.

- Each card may use a thin provenance ribbon on the left edge.
- The card's source text is the main read target.
- Target and gloss are review rows with editable controls that stay visually quiet until focused or dirty.
- Explanation, quiz, quiz answer, and tags remain secondary disclosure content.
- Modified state uses sage; selected/evidence focus uses amber only as a small accent, not a full-card warning outline.
- `View source`, `Revert`, `Delete`, and `Restore` are lightweight action clusters and should not compete with learning content.

## Search Rail Pattern

Search remains a compact left rail paired with a normalized preview pane.

- Search input is the primary control.
- Time, platform, and project are data filters.
- Group by is a view control, not a data filter.
- Session rows stay title-only; snippets belong in the preview pane.
- The footer keeps selected count, rescan/settings, and the primary generate action.
- Clicking a row focuses preview; the checkbox toggles selection.

## Rejected Directions

- No long-term learning dashboard, streaks, mastery tracking, or game layer.
- No permanent source/transcript column by default; source stays drawer-first with optional pinning.
- No full dark terminal theme, acid accent palette, editorial serif notebook style, gradient hero, or decorative illustration system.
