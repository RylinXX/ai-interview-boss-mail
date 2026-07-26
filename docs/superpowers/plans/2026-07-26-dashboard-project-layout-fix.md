# Dashboard Project Layout Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep project-table summaries inside their columns and make expanded project details use the full desktop table width.

**Architecture:** Retain the existing Ant Design table and responsive card split. Correct the CSS ownership boundary by attaching the existing project-table class, then let the existing `Row`/`Col` layout control expanded-detail columns instead of nesting it inside another two-column grid.

**Tech Stack:** React, TypeScript, Ant Design, CSS, Node test runner

---

### Task 1: Add failing layout contracts

**Files:**
- Modify: `frontend/scripts/layout-contracts.test.mjs`

- [ ] **Step 1: Add a dashboard project-layout test**

Assert that the desktop project table uses `project-library-card`, the evidence renderer uses `project-evidence-cell`, the evidence tags have bounded wrapping rules, and `.project-expanded-detail` is full-width without a two-column grid declaration.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run test:layout`

Expected: FAIL because the table and evidence classes are absent and the expanded wrapper still declares `display: grid` with two columns.

### Task 2: Correct the project table layout

**Files:**
- Modify: `frontend/src/pages/Dashboard/index.tsx:503`
- Modify: `frontend/src/pages/Dashboard/index.tsx:777`
- Modify: `frontend/src/index.css:2527`

- [ ] **Step 1: Attach the table and evidence containment classes**

Add `className="project-library-card"` to the desktop project `Table` and `className="project-evidence-cell"` to the missing-evidence wrapper.

- [ ] **Step 2: Make the expanded wrapper full width**

Replace the wrapper's grid declarations with `display: block`, `width: 100%`, and `min-width: 0`. Keep the existing Ant Design `Row` and `Col` structure unchanged.

- [ ] **Step 3: Bound long evidence tags**

Add CSS that gives the evidence wrapper `min-width: 0`, flex wrapping, and gives its tags `max-width: 100%`, normal white-space, and `overflow-wrap: anywhere`.

- [ ] **Step 4: Run the layout test and verify GREEN**

Run: `npm run test:layout`

Expected: all layout-contract tests pass.

### Task 3: Verify behavior and visual layout

**Files:**
- Verify: `frontend/src/pages/Dashboard/index.tsx`
- Verify: `frontend/src/index.css`

- [ ] **Step 1: Run static verification**

Run: `npm run build`

Expected: TypeScript and Vite build complete successfully.

Run: `npm run lint`

Expected: zero errors and no new warnings introduced by these files.

- [ ] **Step 2: Reproduce in the browser**

Open the dashboard project-experience tab, expand the affected row, and verify at desktop and mobile widths that there is no text overlap or document-level horizontal overflow.

- [ ] **Step 3: Review the final diff**

Run: `git diff --check` and `git status --short`.

Expected: no whitespace errors and only the intended dashboard, CSS, test, spec, and plan files are modified.
