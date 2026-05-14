# Industry Knowledge Asset Control System Design

## Goal

Build the next version around a precise industry knowledge asset system.

The product should treat data as the core asset. Resumes, project cases, official
documents, third-party data, open-source projects, competitor references, and SOPs
are all source materials that need to be cleaned, tagged, classified, and made
retrievable before they are used by AI.

The first version should not try to become a fully autonomous AI employee platform.
It should control the data layer first, then let an AI product manager use those
controlled assets as evidence when drafting solution ideas for internal consultants.

## Product Positioning

The product is an internal `行业知识资产库 + AI 产品经理方案台`.

Its job is to help the solution team collect and structure reusable business
evidence, then use that evidence to answer customer needs with more grounded
solution hypotheses.

The product should not present a large menu of industries and scenarios to the
customer. Customers often do not know which part of the business should be
optimized. The user should be able to describe a need naturally, such as:

> 我们公司想做招投标相关的优化。

The system then searches the knowledge asset library for relevant evidence, asks
missing-context questions, and drafts a controlled solution path.

## Core Principle

Control comes before automation.

The first version must control four things:

- Data control: source materials are stored as auditable knowledge assets.
- Tag control: AI can suggest tags, but humans can correct them.
- Evidence control: every asset states what it can support and what it cannot prove.
- Output control: AI product manager responses must follow a fixed structure and
  cite retrieved assets as supporting evidence.

The product is valuable even if the final solution execution remains manual,
because the data layer becomes a reusable company asset.

## Current System Context

The current codebase already has useful foundations:

- Resume upload and parsing.
- AI extraction of work experience, project experience, business model, missing
  evidence, and follow-up questions.
- Resume industry positioning tags and deterministic industry fallback.
- Business workbench pages for solution generation, customer projects, knowledge
  assets, and AI employee concepts.
- A branch dedicated to this redesign:
  `codex/industry-knowledge-product-manager`.

The current mismatch is that the product still carries some resume/recruiting
mental model. The next version should preserve existing resume parsing capability
but reinterpret it as one source for industry knowledge assets.

## Recommended Approach

Use a controlled data-asset redesign instead of a broad product rewrite.

Version 1 should add a universal knowledge asset layer on top of existing resume
analysis. A resume-derived project, an official document, a third-party data source,
and a competitor product reference should all normalize into the same asset model
where possible.

The AI product manager should search this asset layer dynamically when a user asks
for a solution. It should not require the user to browse a detailed taxonomy first.

## First-Version Scope

Included:

- Unified knowledge asset model.
- Multi-dimensional tag taxonomy.
- AI-assisted tagging with human correction.
- Evidence strength and confidence fields.
- Source traceability.
- Demand-driven asset retrieval.
- Controlled AI product manager solution draft.
- Basic UI for asset intake, tag review, asset detail, and solution draft review.

Not included:

- Fully autonomous AI employees.
- Browser automation or external data crawling.
- Customer-facing self-service portal.
- Complex workflow orchestration.
- Automatic software development execution.
- A complete industry taxonomy for every possible market.

## Knowledge Asset Model

A knowledge asset is the normalized record created from any useful source material.

Suggested fields:

- `id`
- `title`
- `source_type`: resume_project, resume_work_experience, company_case,
  official_document, third_party_data, competitor_product, open_source_project,
  sop, manual_note
- `source_name`
- `source_url`
- `source_file_id`
- `source_resume_id`
- `source_confidentiality`: internal, anonymized, public, restricted
- `raw_text`
- `summary`
- `industry_tags`
- `business_topic_tags`
- `scenario_tags`
- `evidence_type_tags`
- `capability_tags`
- `methodology_tags`
- `customer_type_tags`
- `proves`
- `does_not_prove`
- `applicable_conditions`
- `migration_risks`
- `evidence_strength_score`
- `data_verification_score`
- `commercial_value_score`
- `relevance_score`
- `confidence_score`
- `manual_review_status`: unreviewed, reviewed, needs_revision
- `created_at`
- `updated_at`

For resume-derived data, the asset should point back to the original resume record,
but downstream solution generation should use anonymized project and experience
evidence by default.

## Tag Taxonomy

Tags should be multi-dimensional rather than a single rigid tree.

### Industry Tags

Initial tags can extend the existing taxonomy:

- 计算机/AI
- 金融行业
- 工程建设
- 旅游文娱
- 教育培训
- 零售电商
- 服务业
- 企业管理
- 通用业务

These should remain extensible. The first version should not force every asset into
a perfect fine-grained industry tree.

### Business Topic Tags

Examples:

- 招投标
- 人员资质库
- 工程造价
- 结算审计
- 项目资料管理
- AI 影视
- 短视频账号运营
- 内容生产
- 客户增长
- 流程自动化
- 风控合规
- 数据看板
- 内部效率系统

These tags answer what the asset is useful for.

### Evidence Type Tags

Examples:

- 真实项目经验
- 官方资料
- 第三方数据
- 竞品案例
- 开源项目
- 商业化产品
- SOP
- 方法论
- 待验证线索

These tags answer why the asset can be trusted or how it should be used.

### Value Tags

Examples:

- 验证可行性
- 提供流程参考
- 提供数据依据
- 提供工具参考
- 提供系统模块参考
- 提供运营打法
- 提供风险提示

These tags answer how the AI product manager may cite the asset.

## Scoring

The system should use a composite score rather than a single vague rating.

Suggested scoring dimensions:

- `feasibility_score`: whether the asset describes something that appears runnable.
- `verification_score`: whether the asset includes data, metrics, official evidence,
  market evidence, or other validation.
- `commercial_value_score`: whether the asset supports revenue growth, cost
  reduction, efficiency improvement, risk reduction, or delivery quality.
- `similarity_score`: how close the asset is to the current customer demand.
- `transferability_score`: whether the asset can be reused in another company or
  industry with reasonable changes.
- `complexity_score`: estimated implementation difficulty.
- `risk_control_score`: whether risks and prerequisites are clear.

The first version can store these as optional numeric fields generated by AI and
correctable by humans. The composite confidence score should be calculated from the
available dimensions, with missing dimensions lowering confidence rather than being
treated as zero-value facts.

## Intake Flow

1. User uploads or creates a source material record.
2. System stores raw source text and metadata.
3. AI extracts a normalized knowledge asset draft.
4. AI suggests tags, scores, what the asset proves, and what remains unverified.
5. User reviews and corrects tags or evidence statements.
6. Reviewed assets become available for solution retrieval.

Resume intake should reuse the existing resume parsing pipeline, then generate
knowledge assets from extracted work experiences and project experiences.

Manual intake should support pasting text, adding a source URL, and uploading a file.

## AI Product Manager Flow

The AI product manager should be demand-driven.

1. User enters a natural-language demand.
2. System extracts likely industry, business topics, constraints, and missing fields.
3. System retrieves relevant knowledge assets by tags, semantic similarity, and
   evidence scores.
4. AI product manager drafts a controlled response.
5. User can answer follow-up questions or ask for a deeper solution draft.

The user should not need to pre-select a detailed scenario taxonomy. Search should
start from the demand text.

## Controlled Output Format

AI product manager responses should follow this structure:

1. Demand understanding.
2. Retrieved evidence summary.
3. Solution hypotheses.
4. Why these hypotheses are reasonable.
5. Missing information and questions.
6. Human confirmation points.
7. Suggested next workflow.

For a demand like `招投标相关优化`, the system may output:

- A possible `招投标平台` or `投标资料自动化` direction.
- Evidence from engineering consulting projects, official bidding process materials,
  competitor systems, or existing software references.
- A warning that the current customer still needs to confirm existing document
  templates, staff roles, qualification data, approval flow, and budget.
- A next workflow such as: create design brief, write PRD, search open-source
  references, evaluate build-vs-buy, then enter development planning.

The response must avoid unsupported claims such as promising ROI without evidence.

## UI Design

### Navigation

Recommended first-version navigation:

- `方案工作台`
- `行业知识资产库`
- `数据入库`
- `AI 产品经理`
- `客户项目`
- `系统设置`

Existing resume pages can remain available internally, but user-facing naming should
gradually shift from resume-centric wording to data-asset wording.

### Industry Knowledge Asset Library

The asset library should be a searchable and filterable table.

Primary controls:

- Search by demand or keyword.
- Filter by industry tag.
- Filter by business topic.
- Filter by evidence type.
- Filter by review status.
- Filter by source type.
- Sort by confidence or updated time.

The table should show:

- Asset title.
- Source type.
- Industry and business topic tags.
- Evidence strength.
- Review status.
- What it can support.
- Last updated time.

### Asset Detail

The detail page should show:

- Source metadata.
- Summary.
- Tags.
- Scores.
- What this asset proves.
- What this asset does not prove.
- Applicable conditions.
- Migration risks.
- Original extracted text or source excerpt.
- Human review controls.

Tag and evidence correction should be easy because manual correction is part of the
control layer, not an exception.

### AI Product Manager Page

The AI product manager page should be a structured chat/workbench.

The left side can hold the demand input and conversation. The right side should show
retrieved evidence, missing fields, and the current draft structure.

Important UI behavior:

- Show which assets were cited.
- Show whether each cited asset is reviewed or unreviewed.
- Show missing information questions clearly.
- Allow the user to regenerate after changing demand or confirming missing fields.
- Keep outputs as drafts until the user accepts them.

## Backend Design

Recommended modules:

- `knowledge_asset_models`: persistent asset and tag data.
- `knowledge_asset_service`: intake, normalization, tag updates, review status.
- `knowledge_asset_tagging_service`: AI-assisted extraction and scoring.
- `knowledge_asset_retrieval_service`: keyword, tag, and semantic retrieval.
- `ai_product_manager_service`: controlled response generation from user demand and
  retrieved assets.

Existing resume service should call into the knowledge asset layer after resume
analysis succeeds.

The first version can store tags in JSON fields if that fits current database
patterns. A later version can normalize tags into dedicated tables when search,
analytics, and governance requirements grow.

## Prompt Design

The tagging prompt should return structured JSON with:

- title
- summary
- source_type
- industry_tags
- business_topic_tags
- evidence_type_tags
- value_tags
- proves
- does_not_prove
- applicable_conditions
- migration_risks
- score_dimensions
- confidence_reason
- suggested_followup_questions

The AI product manager prompt should require citations to retrieved asset ids or
titles. It should include a rule:

> If evidence is insufficient, ask questions instead of inventing facts.

## Error Handling

Expected failure states:

- Source text extraction failed.
- AI tagging failed.
- AI returned invalid JSON.
- Asset has low confidence.
- Asset needs manual review before citation.
- Retrieval found no strong evidence.

If retrieval finds weak evidence only, the AI product manager should explicitly say
that the direction is a hypothesis and list what needs to be verified.

## Security And Data Governance

- Preserve source traceability.
- Mark confidential and internal-only assets.
- Do not expose raw resume identity in customer-facing outputs by default.
- Allow anonymized use of resume-derived project experience.
- Keep source URLs and file references for audit.
- Do not treat unreviewed AI tags as final truth.

## Testing

Backend tests:

- Create knowledge asset from resume project experience.
- Create knowledge asset from manual text input.
- AI tagging fallback stores an unreviewed asset when structured extraction fails.
- Human tag update persists corrected tags.
- Retrieval finds assets by business topic and evidence type.
- AI product manager response includes cited assets and missing questions.
- Low-confidence evidence is marked as hypothesis rather than fact.

Frontend tests:

- Asset library filters by industry, business topic, evidence type, and review status.
- Asset detail allows tag correction.
- AI product manager page displays retrieved evidence and missing fields.
- Draft outputs remain drafts until accepted.

## Rollout

1. Add the knowledge asset model and API.
2. Generate knowledge assets from existing resume parsed data.
3. Build the asset library and asset detail review UI.
4. Add manual asset intake.
5. Add demand-driven retrieval.
6. Add controlled AI product manager draft generation.
7. Gradually rename resume-centric surfaces into data-asset surfaces.

## Success Criteria

The first version is successful if:

- Existing resume-derived project and work experiences can be converted into
  searchable industry knowledge assets.
- New source materials can be entered and tagged without changing the data model.
- A user can ask for a business direction such as `招投标相关优化`.
- The AI product manager can retrieve relevant assets and produce a controlled
  solution draft with evidence, questions, and human confirmation points.
- The output clearly separates supported evidence from unverified assumptions.

