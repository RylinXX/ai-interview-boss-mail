# Unified Evidence Agent Design

## Goal

Refocus the product around one data-driven solution workflow:

客户问题 -> 通用资料入库 -> 证据检索 -> 方案 Agent -> 客户案卷 -> AI 执行任务 -> 报告导出

The current product has three overlapping generation entrances: `方案生成`, `AI 产品经理`, and `AI 员工`. They all try to do the same job with different data paths, which makes the output shallow and inconsistent. This version should consolidate the product logic around a single evidence retrieval layer and a single solution Agent flow.

## Product Decision

Manual upload is no longer a resume-upload workflow.

Resumes can still come from the existing BOSS mail import path because that is useful for capability samples. But any user-facing manual upload should be a universal data intake flow:

- PDF, DOCX, TXT, Markdown, or pasted text.
- Stored as knowledge assets.
- Split into searchable chunks when needed.
- Tagged and scored as evidence.
- Used by the solution Agent as cited source material.

The old `Resume` model can remain for mail-imported resumes and legacy capability samples, but it should no longer be the primary product mental model.

## Current State

Already available:

- `KnowledgeAsset` for manually entered evidence.
- Resume-derived knowledge assets via `sync_resume_knowledge_assets`.
- Basic keyword/tag search through `search_assets`.
- AI product manager draft generation using `KnowledgeAsset`.
- Customer project and solution document creation.
- AI employee task board, but task execution is mostly templated.

Problems to fix in this iteration:

- `/resumes/upload` is still the visible manual upload path.
- `方案生成` and `AI 员工` still primarily read `Resume.parsed_data`.
- `AI 产品经理` reads `KnowledgeAsset`, but is isolated from customer project creation and AI execution tasks.
- Uploaded external reports cannot be directly parsed and split into the evidence layer.
- The UI still presents three equivalent generation entrances.

## MVP Scope

### Included

- Add file upload to the knowledge asset intake API.
- Extract text from PDF, DOCX, TXT, and Markdown using the existing file-reading utilities.
- Split long uploaded documents into evidence chunks.
- Store each chunk as a `KnowledgeAsset` tied to the same source file path and source name.
- Add a unified solution Agent API that retrieves knowledge assets, generates a cited solution, dynamic AI workers, human confirmation points, and can be converted into a customer project.
- Update frontend navigation so the visible workflow is `资料入库`, `知识资产库`, `方案 Agent`, `客户案卷`.
- Make `/resumes/upload` route redirect or become the universal data intake page so manual upload no longer means resume upload.
- Keep BOSS mail resume sync intact.

### Not Included

- Dropping or renaming database tables.
- Full vector search.
- External web crawling.
- Fully autonomous multi-step agent execution.
- Removing all legacy recruiting code.

## Backend Design

### Knowledge Asset Upload

Add:

- `POST /api/knowledge-assets/upload`

Request:

- multipart form:
  - `file`
  - `title`
  - `source_type`
  - `source_name`
  - `source_url`
  - `source_confidentiality`
  - optional tags such as `industry_tags`, `business_topic_tags`, `evidence_type_tags`

Behavior:

1. Save the file under `uploads/knowledge`.
2. Read text using a shared document reader.
3. Split text into chunks when long.
4. Create one parent asset if the text is short, or multiple chunk assets for long documents.
5. Run the existing AI tagging helper per chunk when available, with deterministic fallback.
6. Return a list of created assets.

Chunking should be simple in this MVP:

- Target chunk length: about 1800 characters.
- Overlap: about 180 characters.
- Preserve order with titles like `原标题 - 片段 1`.
- Store `source_file_path` on every generated asset.

### Unified Solution Agent

Add:

- `POST /api/solution-agent/generate`

Request:

- `requirement`
- `company_profile`
- `project_materials`
- `constraints`
- `confirmed_context`
- `limit`

Behavior:

1. Build a search query from all user inputs.
2. Retrieve relevant `KnowledgeAsset` items through the knowledge asset search service.
3. Build a controlled evidence payload containing asset ids, titles, summaries, proof boundaries, and scores.
4. Call the LLM using the existing solution generation helper, but the evidence source must be `KnowledgeAsset`, not raw `Resume`.
5. If the model is unavailable, return a deterministic fallback grounded in retrieved assets.
6. Return:
   - `assistant_message`
   - `solution`
   - `retrieved_evidence`
   - `dynamic_workers`
   - `human_decision_points`
   - `model_used`
   - `fallback_used`

The `solution` shape should remain compatible with `/customer-projects/from-agent-solution` so the frontend can create a customer project without another conversion layer.

## Frontend Design

### Navigation

Visible core menu:

- `方案工作台`
- `客户案卷`
- `方案 Agent`
- `资料入库`
- `知识资产库`
- `邮箱样本`
- `系统设置`

Legacy pages can remain reachable, but the main menu should stop presenting `方案生成`, `AI 产品经理`, and `AI 员工` as separate product concepts.

### Data Intake

`/knowledge-assets/intake` becomes the universal intake page:

- Upload document file.
- Paste text manually.
- Fill source and tags.
- Submit to either upload API or manual intake API depending on whether a file is selected.

`/resumes/upload` should navigate to the same universal intake page or render it, so manual users no longer see resume upload as the default path.

### Solution Agent Page

Use `/ai-employees` as the consolidated solution Agent page in this iteration to minimize route churn.

The page should:

- Use `POST /api/solution-agent/generate`.
- Show retrieved evidence from `KnowledgeAsset`.
- Show generated solution directions.
- Show dynamic AI workers.
- Show human decision points.
- Offer `生成客户案卷`.

The old `AI 产品经理` and `方案生成` pages should no longer be primary nav entries.

## Testing

Backend tests:

- Uploading a text/markdown file creates knowledge asset chunks.
- Uploading a PDF-like unsupported/empty file returns a clear 400 when no text can be extracted.
- Unified solution Agent uses `KnowledgeAsset` evidence and returns compatible solution payload.
- Creating a customer project from the unified solution still generates document and tasks.

Frontend verification:

- TypeScript build succeeds.
- Universal intake can submit manual data and has file-upload state.
- Navigation no longer exposes the three overlapping generation concepts.

## Migration Notes

Do not remove existing resume endpoints in this iteration. The mail import feature still depends on them. Resume-derived assets remain valuable as one evidence source, but user-facing manual upload should move to knowledge assets.

## Acceptance Criteria

- A user can upload or paste an external report into `资料入库`.
- The uploaded content becomes searchable knowledge assets.
- The main solution generation page retrieves those assets and cites them.
- The user can generate a customer案卷 from that same solution output.
- The main navigation presents one solution Agent path, not three competing generation paths.
