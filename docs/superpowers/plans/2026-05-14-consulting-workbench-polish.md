# Consulting Workbench Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the customer project area into a formal consulting delivery workbench with a more premium enterprise visual system, clearer project purpose, and a dossier-first customer detail experience.

**Architecture:** Keep the current backend business workbench APIs as the source of truth and implement this pass primarily in focused frontend files. Create a local consulting visual layer so the existing dirty global `frontend/src/index.css` is not used as the main editing surface. Keep the customer project list, project detail, AI employee registry, and layout shell as separate units.

**Tech Stack:** React, TypeScript, Ant Design, React Router, existing Axios `request` helper, CSS modules via plain imported CSS files, existing FastAPI backend tests.

---

## File Structure

- Modify `frontend/src/components/Layout/index.tsx`: product shell wording, navigation grouping, and notification copy.
- Modify `frontend/src/pages/CustomerProjects/List.tsx`: portfolio-style customer engagement list with formal hero/KPIs/table.
- Modify `frontend/src/pages/CustomerProjects/Detail.tsx`: consulting dossier layout, strategy brief, document workspace, execution lane, AI run modal.
- Modify `frontend/src/pages/AIEmployees/List.tsx`: delivery role registry styling and copy.
- Create/modify `frontend/src/pages/BusinessWorkbench.css`: premium consulting visual system for the above pages.
- Optional modify `frontend/src/pages/IndustryAgent/index.tsx`: only if a minimal "create customer project from generated solution" CTA can be added without colliding with existing dirty work.
- Test with `npm run build`, `backend/venv/bin/python -m pytest backend/tests/test_business_workbench_routes.py backend/tests/test_resume_intelligence_service.py -q`, and browser verification on `/customer-projects`, `/customer-projects/:id`, `/ai-employees`.

---

### Task 1: Formal Product Shell

**Files:**
- Modify: `frontend/src/components/Layout/index.tsx`

- [ ] **Step 1: Update shell positioning copy**

Use these labels and copy:

```tsx
const shellProductLine = 'Business Transformation OS';
const shellModuleLine = '咨询方案与 AI 员工交付';
const headerSubtitle = '客户诊断、方案文档、能力样本与 AI 员工执行统一推进';
const headerTag = 'Consulting Workbench';
```

Replace the current shell subtitle, bottom sidebar label, and header subtitle/tag with these values while preserving existing auth, notification, theme, and routing behavior.

- [ ] **Step 2: Update notification language**

Keep the notification logic intact, but rename resume-specific notifications into capability-sample language:

```tsx
title: '能力样本解析失败'
description: '点击批量重新提交到模型解析队列'
title: '能力样本分析中'
description: '模型正在读取文件并整理行业、项目和方法论'
title: '能力样本已完成'
description: '可以引用到客户诊断、方案设计和能力背书'
```

- [ ] **Step 3: Run build**

Run:

```bash
cd frontend && npm run build
```

Expected: build succeeds with only the existing large chunk warnings.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Layout/index.tsx
git commit -m "feat: refine consulting workbench shell"
```

---

### Task 2: Customer Projects Portfolio Page

**Files:**
- Modify: `frontend/src/pages/CustomerProjects/List.tsx`
- Modify: `frontend/src/pages/BusinessWorkbench.css`

- [ ] **Step 1: Replace the basic header with an engagement portfolio hero**

Use the existing `projects` array. Add derived metrics:

```tsx
const portfolioMetrics = useMemo(() => {
  const active = projects.filter(item => item.status !== 'archived').length;
  const ready = projects.filter(item => item.status === 'ready').length;
  const industries = new Set(projects.map(item => item.industry).filter(Boolean)).size;
  const documented = projects.filter(item => item.solution_document?.title).length;
  return { active, ready, industries, documented };
}, [projects]);
```

Render a formal hero with:

- title: `客户项目案卷`
- subtitle: `每个项目都是一次业务优化交付：客户背景、诊断、方案、执行任务和 AI 员工产出统一沉淀。`
- primary action: `启动新交付`
- secondary action: `刷新`

- [ ] **Step 2: Add four KPI cards**

Render four cards:

```tsx
[
  ['进行中交付', portfolioMetrics.active, '待推进客户项目'],
  ['可交付方案', portfolioMetrics.ready, '已进入交付状态'],
  ['覆盖行业', portfolioMetrics.industries, '来自项目样本'],
  ['方案文档', portfolioMetrics.documented, '已生成案卷文档'],
]
```

- [ ] **Step 3: Upgrade project table**

Keep `onRow` navigation. Rename columns to:

- `项目案卷`
- `客户背景`
- `核心问题`
- `交付目标`
- `交付状态`

Render project name with a small dossier code using `created_at`, and show document title below it.

- [ ] **Step 4: Add CSS**

Add scoped classes:

```css
.consulting-hero {}
.consulting-hero-copy {}
.consulting-hero-actions {}
.consulting-metric-grid {}
.consulting-metric-card {}
.consulting-table-card {}
.dossier-code {}
```

Use deep navy, ivory surfaces, thin borders, 8px radius, and gold accent lines.

- [ ] **Step 5: Run build and commit**

```bash
cd frontend && npm run build
git add frontend/src/pages/CustomerProjects/List.tsx frontend/src/pages/BusinessWorkbench.css
git commit -m "feat: polish customer project portfolio"
```

---

### Task 3: Customer Project Dossier Detail

**Files:**
- Modify: `frontend/src/pages/CustomerProjects/Detail.tsx`
- Modify: `frontend/src/pages/BusinessWorkbench.css`

- [ ] **Step 1: Add derived dossier state**

Add these memoized values:

```tsx
const completedTasks = tasks.filter(task => task.status === 'done').length;
const progressPercent = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;
const diagnosisReady = !!project.diagnosis && Object.keys(project.diagnosis).length > 0;
const nextAction = !diagnosisReady
  ? '先生成业务诊断'
  : tasks.length === 0
    ? '生成执行任务板'
    : '推进 AI 员工草稿验收';
```

- [ ] **Step 2: Replace the detail header with dossier header**

Render:

- Back button.
- `客户方案案卷`
- project name.
- industry, scale, status tags.
- actions: refresh, generate diagnosis, generate task board.

- [ ] **Step 3: Make first screen dossier-first**

Use a two-column first section:

- left: strategy brief with customer background, pain points, goals, diagnosis highlights, risks/next questions.
- right: solution document preview/edit card with export/save actions and a document-like textarea.

The task board moves below the strategy/document section as the execution lane.

- [ ] **Step 4: Upgrade task board into AI execution lane**

Keep existing `runEmployee`, `acceptRun`, and `discardRun` behavior. Render stages as formal lanes with role labels, output preview, and the action label `生成交付草稿`.

- [ ] **Step 5: Add evidence panel placeholder**

Add a compact panel titled `能力样本背书` explaining that senior talent resumes are used as evidence for industry methods and solution feasibility. Use current project industry as context; this is a UI placeholder using existing data source positioning, not a new backend query.

- [ ] **Step 6: Run build and browser smoke**

```bash
cd frontend && npm run build
```

Open `/customer-projects`, create or use an existing project, and verify the detail page renders without console errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/CustomerProjects/Detail.tsx frontend/src/pages/BusinessWorkbench.css
git commit -m "feat: turn project detail into consulting dossier"
```

---

### Task 4: AI Employee Registry Polish

**Files:**
- Modify: `frontend/src/pages/AIEmployees/List.tsx`
- Modify: `frontend/src/pages/BusinessWorkbench.css`

- [ ] **Step 1: Update page framing**

Rename the page title to `AI 员工交付编队` and subtitle to `每个 AI 员工对应一个咨询交付角色，从诊断、研究、方案到实施拆解。`

- [ ] **Step 2: Add role registry card layout**

Each employee card should show:

- role badge.
- responsibility.
- output template.
- status tag `MVP 可用`.
- footer text `可在客户项目任务板中调用`.

- [ ] **Step 3: Add CSS**

Use formal badge/card styles:

```css
.employee-registry-grid {}
.employee-role-card {}
.employee-role-badge {}
.employee-role-footer {}
```

- [ ] **Step 4: Run build and commit**

```bash
cd frontend && npm run build
git add frontend/src/pages/AIEmployees/List.tsx frontend/src/pages/BusinessWorkbench.css
git commit -m "feat: polish ai employee registry"
```

---

### Task 5: Verification

**Files:**
- No new files unless test output is needed.

- [ ] **Step 1: Run targeted backend tests**

```bash
backend/venv/bin/python -m pytest backend/tests/test_business_workbench_routes.py backend/tests/test_resume_intelligence_service.py -q
```

Expected: all pass.

- [ ] **Step 2: Run frontend build**

```bash
cd frontend && npm run build
```

Expected: build succeeds with only large chunk warnings.

- [ ] **Step 3: Browser verify**

Start services if needed:

```bash
cd backend && venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
cd frontend && npm run dev -- --host 127.0.0.1 --port 5173
```

Verify:

- `/customer-projects` has consulting hero and portfolio metrics.
- Creating a customer project opens the dossier detail page.
- Detail first screen prioritizes strategy brief and solution document.
- Task board still runs AI employee draft modal.
- `/ai-employees` reads like a delivery role registry.

- [ ] **Step 4: Final status**

Report commit hashes, verification commands, and any remaining unrelated dirty files.
