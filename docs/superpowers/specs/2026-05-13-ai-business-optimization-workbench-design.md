# AI Business Optimization Workbench Design

## Goal

Reposition the current system from a recruiting product into an internal AI consulting
workbench for business optimization projects.

The first version is for the solution provider's own use, not for customer self-service.
It should help create a customer project, diagnose business problems, match relevant
high-end talent capability samples, generate an internal execution task board, and
maintain a living solution document that can later be exported as a customer-facing
report.

The existing resume parsing capability remains valuable, but it should be reframed as
a high-end talent capability sample library rather than a hiring funnel.

## Product Positioning

The product is an AI business optimization product manager for consultants and
solution teams.

It uses cross-industry senior white-collar resume samples as an expert capability
reference base. Those samples support business diagnosis, solution design, capability
gap analysis, and later AI employee execution planning.

The product should not present itself as a recruiting system. Recruiting terms are
implementation leftovers and should be gradually replaced in the user-facing product.

Recommended public-facing wording:

> An AI business optimization workbench powered by cross-industry senior talent
> capability samples, helping solution teams produce business diagnosis, execution
> roadmaps, and implementation plans.

## Current System Context

The current codebase already has useful foundations:

- File upload and resume parsing.
- AI extraction and analysis through configurable LLM settings.
- A resume detail page with generated analysis and report export.
- Admin settings for model, prompts, users, and mail import.
- A dashboard and an industry-agent page that can be repurposed.

The current mismatch is conceptual:

- `Resume` currently means candidate resume, but the new product needs talent
  capability samples.
- `Position` currently means hiring role, but the new product needs customer project,
  business scenario, or capability target.
- `match_score` currently means job fit, but the new product needs scenario relevance,
  capability confidence, or reference strength.
- Interview, offer, and coding-test modules are not part of the first business
  optimization workflow.

## Recommended Approach

Use a staged repositioning instead of a rewrite.

Version 1 should keep the existing resume ingestion and AI parsing path, then add a
new customer project layer on top:

1. Convert uploaded resumes into anonymized talent capability samples.
2. Create customer projects with industry, scale, business status, pain points, and goals.
3. Generate business diagnosis from project inputs.
4. Match relevant capability samples to the diagnosis.
5. Create an execution task board.
6. Generate and update a solution document from completed or reviewed tasks.

This preserves the existing data asset while changing the visible product from
recruiting to business solution design.

## Core Concepts

### Customer Project

A customer project is the top-level workspace for a consulting opportunity.

Suggested fields:

- Customer name or internal alias.
- Industry.
- Company scale.
- Business model summary.
- Current pain points.
- Business goals.
- Available source materials.
- Project status.
- Created by and updated by.

The project owns the diagnosis, tasks, capability references, and solution document.

### Talent Capability Sample

A talent capability sample is derived from one resume or professional profile.

The raw resume is retained as an internal source record, but product workflows should
primarily use the anonymized capability layer.

Suggested fields:

- Source resume id.
- Industry tags.
- Function tags, such as growth, sales, operations, finance, supply chain, product,
  delivery, human resources, legal, risk, technology, data, and customer success.
- Seniority level.
- Capability tags.
- Project experience summaries.
- Metric and result snippets.
- Methodology tags.
- Applicable business scenarios.
- Anonymization status.
- Data source category.

Raw identity data should not be used in customer-facing reports by default.

### Business Diagnosis

A diagnosis turns customer input into structured problem categories.

Initial problem categories:

- Growth.
- Cost reduction.
- Efficiency improvement.
- Sales conversion.
- Operations and delivery.
- Organization collaboration.
- Supply chain.
- Finance and cash flow.
- Digital transformation.
- Risk and compliance.
- Customer service.
- New business incubation.

The diagnosis should include assumptions, missing information, and questions to ask
the customer before presenting a final solution.

### Execution Task

Tasks are internal work units that can later be assigned to AI employees.

Suggested task fields:

- Project id.
- Stage: source collection, diagnosis, solution design, capability matching,
  roadmap design, risk and metrics, final review.
- Title.
- Description.
- Inputs.
- Expected output.
- Status: todo, in progress, review, done, blocked.
- Assignee type: human, AI employee, unassigned.
- AI employee type for future use.
- Linked evidence and linked capability samples.

Version 1 does not need autonomous AI employees. It only needs task structure that
can support them later.

### Solution Document

The solution document is the living internal deliverable for each project.

Suggested sections:

- Customer background.
- Business status summary.
- Key problems.
- Diagnosis conclusions.
- Optimization opportunities.
- Relevant capability sample references.
- Recommended solution.
- Execution roadmap.
- Required roles and AI employees.
- Expected impact.
- Risks and validation metrics.
- Open questions.

The document should be editable and exportable. The first export format can be
Markdown or PDF, reusing the existing report export pattern.

## Version 1 User Flow

1. Upload or import senior professional resumes into the capability sample library.
2. AI parses each resume and creates an anonymized capability sample.
3. Create a customer project.
4. Enter customer industry, scale, business status, pain points, and goals.
5. AI generates an initial diagnosis and missing-information questions.
6. AI matches relevant capability samples and summarizes why they matter.
7. AI creates an execution task board for internal work.
8. The consultant reviews and edits tasks.
9. Completed or reviewed task outputs update the solution document.
10. The solution document can be exported for later customer-facing packaging.

## First-Version Navigation

Recommended main navigation:

- `方案工作台`
- `客户项目`
- `高级人才能力样本库`
- `业务优化方案智能体`
- `系统设置`

Existing labels should be changed gradually:

- `分析仪表盘` -> `方案工作台`
- `简历智能库` -> `高级人才能力样本库`
- `上传简历` -> `导入人才样本`
- `行业方案智能体` -> `业务优化方案智能体`
- `导出报告` -> `导出方案文档`

## Backend Design

Add new domain modules while leaving the existing resume routes available during the
transition.

Recommended new modules:

- `customer_projects`
- `capability_samples`
- `business_diagnoses`
- `project_tasks`
- `solution_documents`

The first implementation can reuse existing resume parsing services to populate
capability sample data. A later migration can rename database tables if needed, but
Version 1 should avoid a disruptive table rename.

Recommended APIs:

- `GET /api/customer-projects`
- `POST /api/customer-projects`
- `GET /api/customer-projects/{project_id}`
- `PUT /api/customer-projects/{project_id}`
- `POST /api/customer-projects/{project_id}/diagnose`
- `GET /api/customer-projects/{project_id}/tasks`
- `POST /api/customer-projects/{project_id}/tasks/generate`
- `PUT /api/project-tasks/{task_id}`
- `GET /api/customer-projects/{project_id}/solution-document`
- `PUT /api/customer-projects/{project_id}/solution-document`
- `POST /api/customer-projects/{project_id}/solution-document/export`
- `GET /api/capability-samples`
- `POST /api/resumes/{resume_id}/capability-sample`

## AI Behavior

AI output must be structured and evidence-aware.

For capability samples, extract:

- Industries.
- Functions.
- Seniority.
- Business problems handled.
- Project patterns.
- Metrics and outcomes.
- Methods used.
- Applicable scenarios.

For customer diagnosis, produce:

- Problem categories.
- Root-cause hypotheses.
- Optimization opportunities.
- Missing information.
- Recommended next questions.

For solution generation, produce:

- Recommended solution path.
- Reasoning tied to customer inputs.
- Capability samples used as anonymous references.
- Execution tasks.
- Validation metrics.

AI should not invent specific personal identities, employer details, or performance
claims that are not present in the source material.

## Privacy And Data Handling

The system should keep two layers:

1. Raw source layer: original files, extracted text, and identity information for
   internal traceability.
2. Anonymous capability layer: industry, function, capability, project pattern, and
   metric summaries for business-solution reasoning.

Customer-facing exports should default to anonymous and aggregate references.

The product should track data source category, such as authorized, public, partner,
or internal historical source. This supports auditability without changing the first
workflow.

## Out Of Scope For Version 1

- Customer self-service portal.
- Full autonomous AI employee execution.
- CRM, billing, contract, or proposal signing.
- Complex multi-user review workflow.
- Full table and route rename from resume terminology.
- Interview, offer, coding-test, and recruiting pipeline revival.

## Testing

Backend tests:

- Capability sample generation from an existing resume.
- Customer project create, update, and list.
- Diagnosis generation with mocked LLM output.
- Task board generation with deterministic mocked output.
- Solution document update and export.
- Permission checks for project and sample access.

Frontend checks:

- Navigation labels reflect the new product positioning.
- Customer project list and detail pages load.
- Task board supports status movement and edit.
- Solution document can be generated, edited, and exported.
- Existing talent sample import path remains usable.

Integration checks:

- Upload a resume, create a capability sample, create a customer project, generate
  diagnosis, generate tasks, and export a solution document.

## Rollout Plan

1. Change visible navigation and product copy to the new positioning.
2. Add customer project models, routes, and pages.
3. Add capability sample extraction on top of existing resume analysis.
4. Add diagnosis generation for customer projects.
5. Add project task board generation.
6. Add solution document generation and export.
7. Add integration tests for the complete internal workflow.

## Success Criteria

The first version is successful when the consultant can:

- Import senior professional resumes as capability samples.
- Create a customer project.
- Generate a structured business diagnosis.
- Match capability samples to the customer problem.
- Generate an internal execution task board.
- Produce and export a coherent solution document.

The product should feel like an internal AI solution workbench, not a recruiting or
applicant tracking system.
