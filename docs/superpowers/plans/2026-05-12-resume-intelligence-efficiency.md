# Resume Intelligence Efficiency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve resume intelligence display and processing efficiency with a project library, queue visibility, and a single-call PDF analysis path.

**Architecture:** Keep the existing resume JSON data model for this MVP, but expose server-side flattened project/experience summaries so the frontend can show project-first views. Prefer direct PDF-to-structured-analysis via the Responses API when available, and fall back to the existing text extraction plus analysis pipeline.

**Tech Stack:** FastAPI, SQLAlchemy, OpenAI-compatible HTTP/SDK calls, React, Ant Design, Vite, pytest, Playwright CLI for browser verification.

---

### Task 1: Backend Project Library And Queue APIs

**Files:**
- Modify: `backend/app/services/resume_service.py`
- Modify: `backend/app/routes/resumes.py`
- Test: `backend/tests/test_resume_intelligence_service.py`

- [ ] Add a failing pytest that creates resumes with `parsed_data.project_experiences`, calls `/resumes/project-library`, and expects flattened project rows with resume context and optional `missing_only` filtering.
- [ ] Add a failing pytest that calls `/resumes/queue-stats` with a patched task queue and expects queue/running/completed metrics.
- [ ] Implement `summarize_resume_projects(db, limit, missing_only, candidate_name)` in `resume_service.py`.
- [ ] Add `GET /resumes/project-library` and `GET /resumes/queue-stats` routes before `/{resume_id}`.
- [ ] Run the targeted backend tests and keep them green.

### Task 2: Direct PDF Intelligence Path

**Files:**
- Modify: `backend/app/services/ai_service.py`
- Modify: `backend/app/services/resume_service.py`
- Modify: `backend/app/utils/prompt_manager.py`
- Modify: `backend/app/config/prompt_variables.py`
- Test: `backend/tests/test_resume_intelligence_service.py`

- [ ] Add a failing unit test proving PDF processing first attempts direct document intelligence and does not call local text extraction when the direct path succeeds.
- [ ] Add `analyze_resume_intelligence_from_document(file_path)` that sends `input_file` plus a structured JSON prompt to the configured `/responses` endpoint.
- [ ] Add prompt defaults and variables for `analyze_resume_intelligence_from_document`.
- [ ] Update `process_resume_task` to use direct document intelligence for PDFs, with fallback to `read_file_content` and `analyze_resume_intelligence`.
- [ ] Run targeted backend tests and then the full backend suite.

### Task 3: Frontend Project Library And Queue Display

**Files:**
- Modify: `frontend/src/pages/Dashboard/index.tsx`
- Modify: `frontend/src/pages/Resumes/List.tsx`
- Modify: `frontend/src/index.css`

- [ ] Add dashboard data calls for `/resumes/project-library` and `/resumes/queue-stats`.
- [ ] Replace the current project table with a project-first library section: project, candidate, role, business model, missing evidence, landing direction.
- [ ] Add a queue/status card showing waiting, running, completed, failed, and max concurrency.
- [ ] Keep the resume list focused on operational actions and preserve the newly added batch regenerate action.
- [ ] Run `npm run build` and verify dashboard/list pages in the browser.
