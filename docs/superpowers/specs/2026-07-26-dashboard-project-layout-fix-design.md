# Dashboard Project Layout Fix Design

## Scope

Fix the project-experience table on the dashboard without changing its data model, editing workflow, pagination, or mobile card layout.

## Root Causes

1. `.project-expanded-detail` declares a two-column CSS grid, but its only direct child is an Ant Design `Row`. The row is therefore placed in the first grid track and the expanded content uses only half of the available width.
2. Project-table containment rules are scoped under `.project-library-card`, but the rendered project table does not carry that class. Long warning tags retain their default single-line behavior and overflow into the adjacent landing-direction cell.

## Design

- Add `project-library-card` to the desktop project `Table` so existing project-table rules apply to the actual component.
- Make `.project-expanded-detail` a full-width block container. Keep the existing Ant Design `Row` and `Col` structure responsible for the internal two-column layout, with the capability analysis remaining a full-width row.
- Add a dedicated `project-evidence-cell` class to the missing-evidence renderer. Its tags wrap within the cell, break long text when needed, and never paint over an adjacent column.
- Preserve the existing four desktop table columns and the mobile card implementation.

## Success Criteria

- Expanded project content occupies the full table width on desktop.
- Missing-evidence text stays inside its own table cell and does not overlap landing-direction text.
- The internal expanded detail remains two columns on desktop and follows the existing responsive behavior on narrow screens.
- Existing layout tests, TypeScript build, and lint complete without new errors.

## Verification

- Add source-level layout contracts for the project table class, evidence-cell class, full-width expanded container, and wrapping tag rules.
- Run `npm run test:layout`, `npm run build`, and `npm run lint` from `frontend/`.
- Reproduce the affected expanded row in a browser at the reported desktop size, then verify a narrow/mobile viewport for regressions.
