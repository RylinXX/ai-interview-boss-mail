# Unified Evidence Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual resume-upload mental model with universal knowledge intake, and consolidate the overlapping solution generation entrances behind one evidence-backed solution Agent.

**Architecture:** Keep legacy resume/mail-import behavior intact, but route manual uploads into `KnowledgeAsset`. Add one backend solution Agent endpoint that retrieves `KnowledgeAsset` evidence and returns a payload compatible with customer project creation. Update navigation and pages so the main flow is data intake -> evidence library -> solution Agent -> customer dossier.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic v2, pytest, React 19, TypeScript, Ant Design, Vite

---

## File Structure

- `backend/app/schemas/knowledge_assets.py`: add upload and solution Agent response schemas.
- `backend/app/services/knowledge_asset_service.py`: add document text extraction, chunking, upload-to-assets, and evidence-backed solution generation.
- `backend/app/routes/knowledge_assets.py`: add multipart upload route and unified solution Agent route.
- `backend/tests/test_knowledge_assets.py`: add tests for upload chunking and solution Agent generation from `KnowledgeAsset`.
- `frontend/src/pages/KnowledgeAssets/Intake.tsx`: add file upload mode while preserving manual paste intake.
- `frontend/src/pages/AIEmployees/List.tsx`: repurpose as the single `方案 Agent` page using `/solution-agent/generate`.
- `frontend/src/components/Layout/index.tsx`: remove separate `方案生成` and `AI 产品经理` nav entries; rename `AI 员工` to `方案 Agent`; route manual upload to `/knowledge-assets/intake`.
- `frontend/src/router/index.tsx`: redirect `/resumes/upload` to `/knowledge-assets/intake`.
- `frontend/src/pages/BusinessWorkbench.css`: small style additions for upload controls and evidence display if needed.

## Tasks

### Task 1: Backend Upload To Knowledge Assets

- [ ] Write failing tests in `backend/tests/test_knowledge_assets.py` for `POST /api/knowledge-assets/upload`.
- [ ] Run `backend/venv/bin/python -m pytest backend/tests/test_knowledge_assets.py -q` and confirm the new tests fail.
- [ ] Add upload schemas and service functions: supported file validation, text extraction, chunking, and asset creation.
- [ ] Add the route and return `KnowledgeAssetListResponse`.
- [ ] Re-run the focused tests and confirm they pass.

### Task 2: Unified Solution Agent API

- [ ] Write a failing backend test that creates `KnowledgeAsset` rows, calls `POST /api/solution-agent/generate`, and asserts cited assets are used.
- [ ] Run the focused test and confirm it fails because the route does not exist.
- [ ] Add request/response schemas and service function to retrieve `KnowledgeAsset` evidence.
- [ ] Reuse `generate_solution_agent_response` with a knowledge-asset payload and deterministic fallback.
- [ ] Re-run focused tests and confirm they pass.

### Task 3: Frontend Universal Intake

- [ ] Update `KnowledgeAssets/Intake.tsx` to support either file upload or pasted text.
- [ ] If a file is selected, submit multipart form data to `/knowledge-assets/upload`.
- [ ] If no file is selected, keep the existing `/knowledge-assets/intake` JSON path.
- [ ] Keep source metadata and tags shared between both modes.

### Task 4: Frontend Solution Agent Consolidation

- [ ] Update `AIEmployees/List.tsx` to call `/solution-agent/generate`.
- [ ] Rename visible copy to `方案 Agent`.
- [ ] Render cited knowledge assets instead of resume-derived evidence labels.
- [ ] Keep `生成客户案卷` using `/customer-projects/from-agent-solution`.

### Task 5: Navigation And Route Cleanup

- [ ] In `Layout`, remove primary nav entries for `/industry-agent` and `/ai-product-manager`.
- [ ] Rename `/ai-employees` menu label to `方案 Agent`.
- [ ] Rename `/resumes` to `邮箱样本` and remove `导入样本` from the main nav.
- [ ] In router, redirect `/resumes/upload` to `/knowledge-assets/intake`.

### Task 6: Verification

- [ ] Run `backend/venv/bin/python -m pytest backend/tests/test_knowledge_assets.py backend/tests/test_business_workbench_routes.py -q`.
- [ ] Run `cd frontend && npm run build`.
- [ ] If a frontend build error is unrelated to changed files, capture it and report clearly.
