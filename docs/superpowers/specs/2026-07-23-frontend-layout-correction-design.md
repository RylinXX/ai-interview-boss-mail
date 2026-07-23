# Frontend Layout Correction Design

## Objective

Correct the existing application's visual layout without redesigning its business workflows. The work focuses on two observed classes of defects:

1. Text, tags, controls, and buttons overlap, clip, or compete for the same space.
2. Tables and detail pages leave useful space empty while important content is compressed into a narrow column.

Backend APIs, stored data, permissions, and business behavior remain unchanged.

## Evidence From The Production UI

- At 1280x720, the resume table's content extends beyond the visible table area and pushes the three row actions off screen. The operation column is not fixed and the global table cell padding consumes too much width.
- At the normal 1447px content viewport, the resume row action buttons still sit beyond the visible table card boundary.
- Knowledge asset detail reserves a fixed 460px review form with 20 fields. The asset text and evidence view receive only 667px, even when the user is reading rather than editing.
- Customer project detail uses equal-height two-column grid rows. A long customer-background block stretches a short problem block to the same height, creating large blank areas and weakening the reading order.
- The dashboard module header, four-step strip, metric cards, and filter row consume most of a 720px-high viewport before the main work table appears.

## Chosen Approach

Use a shared layout correction layer plus focused page fixes. This retains the current Ant Design and Workbench components, avoids a product redesign, and produces consistent behavior across pages.

Rejected alternatives:

- Page-by-page CSS patches: lower initial effort but inconsistent and likely to regress.
- Full frontend redesign: unnecessary for the requested typography and space corrections.

## Shared Layout Rules

### Typography

- Give text containers `min-width: 0` wherever they participate in flex or grid layouts.
- Use readable line heights and allow Chinese and long Latin content to wrap with `overflow-wrap: anywhere` where needed.
- Reserve single-line ellipsis for dense table summaries; always expose the complete value through an existing tooltip or detail view.
- Prevent headings, tags, and action controls from sharing an inflexible row when their combined width exceeds the container.

### Buttons And Toolbars

- Toolbars wrap by logical group, not at arbitrary individual controls.
- Primary actions remain visible; secondary actions may move into an existing overflow menu when space is limited.
- Icon-only table actions use stable 36px controls with tooltips and do not shrink below their interaction target.
- Header and card actions wrap beneath their title at narrow widths instead of clipping.

### Tables

- Reduce excessive global cell padding for operational tables.
- Assign explicit priorities and practical widths to identity, status, summary, date, and operation columns.
- Fix operation columns to the right for desktop tables that have multiple actions.
- Keep horizontal scrolling inside the table container and preserve a visible fixed action area.
- Use fixed table layout and ellipsis only for dense summary columns. Structured content can wrap to at most a small number of lines.
- Continue using the existing card view on mobile breakpoints.

## Page-Level Changes

### Dashboard

- Convert the large module header into a compact header: smaller vertical padding, tighter title spacing, and a single compact process strip for steps 01-04.
- Reduce metric card height and internal padding while preserving labels, values, and click behavior.
- Tighten the industry filter row and workbench tab spacing.
- At 1280x720, the main workbench must show at least its tab header, toolbar, table header, and part of the first data row without browser zoom.

### Resume List

- Fix the operation column to the right and guarantee room for all three action buttons.
- Rebalance column widths around the useful summary field rather than spreading fixed padding across every cell.
- Keep names and contact details readable without colliding; truncate the summary with a tooltip.
- Wrap the filter and batch-action groups into separate rows when their combined width does not fit.

### Resume Detail

- Keep the existing document-preview and analysis split on wide screens.
- Rebalance the two columns, make the analysis text use its full column, and let the toolbar wrap cleanly.
- Switch to one column at the existing medium breakpoint with no fixed-height clipping.
- Ensure list titles, tags, questions, and long analysis paragraphs wrap without overlap.

### Knowledge Asset Detail

- Default to a full-width reading view for asset text, evidence boundaries, score summary, and source information.
- Move the review form into an Ant Design drawer opened by an `Edit review` action. Saving and refreshing retain their existing API behavior.
- Present evidence and source data in a logical order before the raw document.
- Compact missing fields into a clear empty state instead of rendering repeated dash-only rows.

### Customer Project Detail

- Replace equal-height paired rows with deliberate content groups.
- Use full width for customer background and long diagnostic sections.
- Pair core problems with business goals only where their content lengths are compatible.
- Keep root-cause hypotheses and next questions in ordered full-width sections.
- Preserve the solution editor and project actions, but allow card header actions to wrap without obscuring the document title.

### Remaining Data Pages

- Audit all existing Ant Design tables and shared card/detail layouts for the same overflow pattern.
- Apply shared table/action classes to interviews, positions, offers, workflows, users, and dashboard tables where applicable.
- Do not alter their data fetching, permissions, state transitions, or modal behavior.

## Responsive Targets

- 1440x900: full desktop layout with fixed action columns and balanced detail pages.
- 1280x720: compact sidebar layout, complete primary actions, and visible first-screen table content.
- 1024x768: reduced columns or internal table scrolling with actions still accessible.
- 760px and below: existing mobile card views and single-column detail layouts.

## Verification

- Add layout-oriented tests for the shared header and responsive data behavior where the existing test stack permits.
- Run TypeScript compilation and the production frontend build.
- Run the frontend lint command and distinguish existing warnings from new errors.
- Inspect production-like pages at 1440x900, 1280x720, 1024x768, and a mobile viewport.
- For each target viewport, verify no document-level horizontal overflow, no overlapping text boxes, fully visible primary actions, and correct table scrolling/fixed actions.
- Visually verify dashboard, resume list/detail, knowledge asset list/detail, and customer project list/detail using representative server data.

## Deployment Scope

- Commit the frontend-only changes to the current project branch.
- Build one candidate frontend image from the committed source.
- Back up the currently deployed frontend image, deploy the candidate, and verify the public site before marking the work complete.
- No database migration or backend restart is required unless deployment tooling recreates an unchanged dependency.
