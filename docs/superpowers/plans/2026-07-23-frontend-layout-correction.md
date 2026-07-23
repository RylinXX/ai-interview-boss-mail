# Frontend Layout Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate frontend text collisions and make tables, detail pages, and the dashboard use the available viewport efficiently without changing backend data or business workflows.

**Architecture:** Add a small source-level layout contract test, strengthen the existing Workbench layout primitives, and then apply narrow page-specific structure changes where shared CSS cannot express the intended reading order. Preserve Ant Design, current routes, requests, permissions, and mobile card views.

**Tech Stack:** React 19, TypeScript 5.9, Ant Design 6, Vite 7, CSS, Node.js built-in test runner, production browser viewport checks.

---

### Task 1: Add Failing Layout Contract Tests

**Files:**
- Create: `frontend/scripts/layout-contracts.test.mjs`
- Modify: `frontend/package.json`

- [ ] **Step 1: Add the layout test command**

Add this script to `frontend/package.json`:

```json
"test:layout": "node --test scripts/layout-contracts.test.mjs"
```

- [ ] **Step 2: Write source-level regression tests**

Create `frontend/scripts/layout-contracts.test.mjs` with Node's built-in test runner. The test reads real application files and asserts the intended layout contracts:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('dashboard uses the compact module header', async () => {
  const [dashboard, workbench, css] = await Promise.all([
    read('src/pages/Dashboard/index.tsx'),
    read('src/components/Workbench/index.tsx'),
    read('src/pages/BusinessWorkbench.css'),
  ]);
  assert.match(workbench, /compact\?: boolean/);
  assert.match(dashboard, /<ModulePageHeader[\s\S]*?compact/);
  assert.match(css, /\.module-page-header-compact/);
});

test('resume list fixes the operation column to the visible right edge', async () => {
  const source = await read('src/pages/Resumes/List.tsx');
  assert.match(source, /title: '操作'[\s\S]*?fixed: 'right'/);
  assert.match(source, /className: 'actions-column'/);
  assert.match(source, /className="resume-row-actions"/);
});

test('knowledge detail keeps review editing demand-driven', async () => {
  const [source, css] = await Promise.all([
    read('src/pages/KnowledgeAssets/Detail.tsx'),
    read('src/pages/BusinessWorkbench.css'),
  ]);
  assert.match(source, /<Drawer/);
  assert.match(source, /open=\{reviewOpen\}/);
  assert.match(source, /className="knowledge-detail-reading"/);
  assert.doesNotMatch(css, /\.knowledge-detail-grid[^}]*460px/s);
});

test('customer project detail uses explicit reading groups', async () => {
  const [source, css] = await Promise.all([
    read('src/pages/CustomerProjects/Detail.tsx'),
    read('src/pages/BusinessWorkbench.css'),
  ]);
  assert.match(source, /strategy-brief-background/);
  assert.match(source, /strategy-brief-pair/);
  assert.match(source, /strategy-brief-diagnosis/);
  assert.match(css, /\.strategy-brief-pair/);
});
```

- [ ] **Step 3: Run the tests and verify RED**

Run:

```bash
cd frontend && npm run test:layout
```

Expected: four failing subtests because the compact header, fixed resume actions, review drawer, and explicit project reading groups do not exist yet.

- [ ] **Step 4: Commit the failing test**

```bash
git add frontend/package.json frontend/scripts/layout-contracts.test.mjs
git commit -m "test: add frontend layout contracts"
```

### Task 2: Strengthen Shared Layout Primitives

**Files:**
- Modify: `frontend/src/components/Workbench/index.tsx`
- Modify: `frontend/src/pages/BusinessWorkbench.css`
- Modify: `frontend/src/index.css`
- Test: `frontend/scripts/layout-contracts.test.mjs`

- [ ] **Step 1: Add compact header support**

Extend `ModulePageHeaderProps` and its root class:

```tsx
type ModulePageHeaderProps = {
  eyebrow: React.ReactNode;
  title: string;
  description: React.ReactNode;
  actions?: React.ReactNode;
  steps?: string[];
  compact?: boolean;
};

export const ModulePageHeader: React.FC<ModulePageHeaderProps> = ({
  eyebrow,
  title,
  description,
  actions,
  steps,
  compact = false,
}) => (
  <section className={`module-page-header${compact ? ' module-page-header-compact' : ''}`}>
```

- [ ] **Step 2: Add shared text and action containment rules**

Add focused CSS rules rather than changing every Ant Design component globally:

```css
.workbench-page,
.workbench-page * {
  box-sizing: border-box;
}

.module-page-header-copy,
.module-page-header-actions,
.data-toolbar,
.data-toolbar-group,
.ant-card-head-title,
.ant-card-extra {
  min-width: 0;
}

.module-page-header-copy > .ant-typography,
.workbench-page .ant-descriptions-item-content,
.workbench-page .ant-list-item-meta-title,
.workbench-page .ant-list-item-meta-description {
  overflow-wrap: anywhere;
}

.workbench-page .ant-card-head-wrapper {
  align-items: flex-start;
  gap: 12px;
}

.actions-column .ant-space,
.resume-row-actions {
  display: inline-flex;
  flex-wrap: nowrap;
  gap: 6px !important;
}

.actions-column .ant-btn,
.resume-row-actions .ant-btn {
  flex: 0 0 36px;
  width: 36px;
  min-width: 36px;
  padding-inline: 0;
}
```

- [ ] **Step 3: Add compact header CSS**

```css
.module-page-header-compact {
  gap: 8px 16px;
  padding: 12px 16px;
  margin-bottom: 12px;
}

.module-page-header-compact h2.ant-typography {
  margin: 2px 0;
  font-size: 22px;
  line-height: 1.2;
}

.module-page-header-compact .module-page-header-copy > .ant-typography {
  display: block;
  font-size: 12px;
  line-height: 18px;
}

.module-page-header-compact .module-page-steps {
  gap: 6px;
  padding-top: 8px;
}

.module-page-header-compact .module-page-steps li {
  min-height: 28px;
  padding: 4px 8px;
}
```

- [ ] **Step 4: Run build and layout tests**

```bash
cd frontend && npm run test:layout && npm run build
```

Expected: the dashboard test may still fail because the page has not opted into compact mode; TypeScript and Vite build succeed.

- [ ] **Step 5: Commit shared primitives**

```bash
git add frontend/src/components/Workbench/index.tsx frontend/src/pages/BusinessWorkbench.css frontend/src/index.css
git commit -m "fix: contain frontend text and action layouts"
```

### Task 3: Compact The Dashboard First Viewport

**Files:**
- Modify: `frontend/src/pages/Dashboard/index.tsx`
- Modify: `frontend/src/index.css`
- Test: `frontend/scripts/layout-contracts.test.mjs`

- [ ] **Step 1: Opt the dashboard into compact header mode**

Add the `compact` prop to its `ModulePageHeader`:

```tsx
<ModulePageHeader
  compact
  eyebrow={<><DatabaseOutlined /> 业务控制台</>}
  title="业务总览"
  description="集中查看人才样本、项目打法、任职经历与能力逻辑，优先处理证据缺口。"
  actions={<Button icon={<ReloadOutlined />} loading={refreshing} onClick={() => fetchData(false)}>刷新数据</Button>}
  steps={['样本入库', '结构解析', '证据补齐', '能力复用']}
/>
```

- [ ] **Step 2: Reduce dashboard-only vertical density**

Add dashboard-scoped rules so other modules retain their current rhythm:

```css
.dashboard-page .consulting-metric-grid {
  gap: 10px;
  margin-bottom: 12px;
}

.dashboard-page .consulting-metric-card .ant-card-body {
  min-height: 102px;
  gap: 5px;
  padding: 12px 14px;
}

.dashboard-page .consulting-metric-card strong {
  font-size: 25px;
}

.dashboard-page .workbench-main-workspace .ant-tabs-nav {
  margin-bottom: 10px;
}

.dashboard-page .project-library-toolbar {
  margin-bottom: 10px !important;
}
```

Also reduce the industry filter card's bottom margin and internal padding through a named class instead of inline style.

- [ ] **Step 3: Verify the dashboard contract passes**

```bash
cd frontend && npm run test:layout && npm run build
```

Expected: compact dashboard subtest passes; remaining page-level subtests still fail.

- [ ] **Step 4: Commit dashboard density changes**

```bash
git add frontend/src/pages/Dashboard/index.tsx frontend/src/index.css
git commit -m "fix: compact dashboard first viewport"
```

### Task 4: Correct Resume List And Detail Layouts

**Files:**
- Modify: `frontend/src/pages/Resumes/List.tsx`
- Modify: `frontend/src/pages/Resumes/Detail.tsx`
- Modify: `frontend/src/index.css`
- Test: `frontend/scripts/layout-contracts.test.mjs`

- [ ] **Step 1: Fix the resume action column**

Set a stable action column and add the row action class:

```tsx
{
  title: '操作',
  key: 'action',
  width: 152,
  fixed: 'right' as const,
  className: 'actions-column',
  render: (_: any, record: any) => (
    <Space className="resume-row-actions" size={6}>
      <Tooltip title="查看分析">
        <Button icon={<EyeOutlined />} onClick={() => navigate(`/resumes/${record.id}`)} />
      </Tooltip>
      <Tooltip title="重新分析">
        <Button icon={<ReloadOutlined />} onClick={() => handleReparse(record)} disabled={record.parse_status === 'processing'} />
      </Tooltip>
      <Tooltip title="删除">
        <Button danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} />
      </Tooltip>
    </Space>
  ),
}
```

Change the table to `tableLayout="fixed"`, retain internal `scroll={{ x: 1120 }}`, and rebalance fixed column widths so the summary receives the remaining space.

- [ ] **Step 2: Make the resume toolbar wrap by group**

Keep search controls in the first `.data-toolbar-group`, batch status and actions in the second, and apply:

```css
.resume-list-page .data-toolbar-group:first-child {
  flex: 1 1 520px;
}

.resume-list-page .data-toolbar-group:last-child {
  flex: 1 1 420px;
  justify-content: flex-end;
}

@media (max-width: 1280px) {
  .resume-list-page .data-toolbar-group:last-child {
    justify-content: flex-start;
  }
}
```

- [ ] **Step 3: Give the detail toolbar named wrapping groups**

Replace nested unnamed `Space` containers with:

```tsx
<div className="resume-detail-toolbar-inner">
  <Space wrap className="resume-detail-toolbar-status">
    <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/resumes')}>返回</Button>
    <Tag color={status.color}>{status.text}</Tag>
  </Space>
  <Space wrap className="resume-detail-toolbar-actions">
    {isEditing ? (
      <>
        <Button type="primary" icon={<SaveOutlined />} onClick={handleUpdate}>保存</Button>
        <Button onClick={() => setIsEditing(false)}>取消</Button>
      </>
    ) : (
      <>
        <Dropdown menu={{ items: exportItems }} disabled={!canExportReport}>
          <Button icon={<FilePdfOutlined />} disabled={!canExportReport}>导出报告 <DownOutlined /></Button>
        </Dropdown>
        <Button icon={<ReloadOutlined />} onClick={handleReparse} disabled={resume.parse_status === 'processing'}>重新分析</Button>
        <Button icon={<EditOutlined />} onClick={() => setIsEditing(true)}>编辑信息</Button>
      </>
    )}
  </Space>
</div>
```

Add text containment for profile names, list metadata, tags, questions, and Markdown content. Preserve the existing two-column preview/analysis layout and its one-column breakpoint.

- [ ] **Step 4: Run layout tests and build**

```bash
cd frontend && npm run test:layout && npm run build
```

Expected: resume action contract passes and build succeeds.

- [ ] **Step 5: Commit resume layout corrections**

```bash
git add frontend/src/pages/Resumes/List.tsx frontend/src/pages/Resumes/Detail.tsx frontend/src/index.css
git commit -m "fix: keep resume content and actions visible"
```

### Task 5: Turn Knowledge Asset Detail Into A Full-Width Reading View

**Files:**
- Modify: `frontend/src/pages/KnowledgeAssets/Detail.tsx`
- Modify: `frontend/src/pages/BusinessWorkbench.css`
- Test: `frontend/scripts/layout-contracts.test.mjs`

- [ ] **Step 1: Add the failing drawer state contract**

Confirm `npm run test:layout` still fails the knowledge-detail test before editing production code.

- [ ] **Step 2: Move the review form into a drawer**

Import `Drawer`, add `const [reviewOpen, setReviewOpen] = useState(false)`, and replace the permanently visible right column with an edit action:

```tsx
<Button type="primary" icon={<SaveOutlined />} onClick={() => setReviewOpen(true)}>
  编辑复核
</Button>
```

Render the review form inside the drawer. Keep the current field names because they are the payload contract used by `saveReview`:

```tsx
<Drawer
  title="编辑资产复核"
  width={560}
  open={reviewOpen}
  onClose={() => setReviewOpen(false)}
  extra={<Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={saveReview}>保存</Button>}
>
  <Form form={form} layout="vertical" className="knowledge-review-form">
    <Form.Item label="标题" name="title" rules={[{ required: true, message: '请输入标题' }]}><Input /></Form.Item>
    <Form.Item label="摘要" name="summary"><TextArea rows={4} /></Form.Item>
    <Form.Item label="复核状态" name="manual_review_status">
      <Select options={[
        { value: 'unreviewed', label: '待复核' },
        { value: 'reviewed', label: '已复核' },
        { value: 'needs_revision', label: '需修订' },
      ]} />
    </Form.Item>
    <div className="knowledge-review-grid">
      <Form.Item label="行业标签" name="industry_tags"><Select {...tagFieldProps} /></Form.Item>
      <Form.Item label="业务主题" name="business_topic_tags"><Select {...tagFieldProps} /></Form.Item>
      <Form.Item label="场景标签" name="scenario_tags"><Select {...tagFieldProps} /></Form.Item>
      <Form.Item label="证据类型" name="evidence_type_tags"><Select {...tagFieldProps} /></Form.Item>
      <Form.Item label="能力标签" name="capability_tags"><Select {...tagFieldProps} /></Form.Item>
      <Form.Item label="方法论标签" name="methodology_tags"><Select {...tagFieldProps} /></Form.Item>
      <Form.Item label="客户类型" name="customer_type_tags"><Select {...tagFieldProps} /></Form.Item>
      <Form.Item label="可用价值" name="value_tags"><Select {...tagFieldProps} /></Form.Item>
    </div>
    <Form.Item label="能证明" name="proves"><Select {...tagFieldProps} /></Form.Item>
    <Form.Item label="不能证明" name="does_not_prove"><Select {...tagFieldProps} /></Form.Item>
    <Form.Item label="适用条件" name="applicable_conditions"><Select {...tagFieldProps} /></Form.Item>
    <Form.Item label="迁移风险" name="migration_risks"><Select {...tagFieldProps} /></Form.Item>
    <div className="knowledge-score-form-grid">
      <Form.Item label="证据强度" name="evidence_strength_score"><InputNumber min={0} max={100} /></Form.Item>
      <Form.Item label="数据验证" name="data_verification_score"><InputNumber min={0} max={100} /></Form.Item>
      <Form.Item label="商业价值" name="commercial_value_score"><InputNumber min={0} max={100} /></Form.Item>
      <Form.Item label="置信度" name="confidence_score"><InputNumber min={0} max={100} /></Form.Item>
    </div>
    <Form.Item label="置信说明" name="confidence_reason"><TextArea rows={3} /></Form.Item>
  </Form>
</Drawer>
```

Close the drawer after a successful save.

- [ ] **Step 3: Reorder the reading view**

Use this structure:

```tsx
<div className="knowledge-detail-reading">
  <div className="knowledge-detail-score-grid">
    <ScoreItem label="证据强度" value={asset.evidence_strength_score} />
    <ScoreItem label="数据验证" value={asset.data_verification_score} />
    <ScoreItem label="商业价值" value={asset.commercial_value_score} />
    <ScoreItem label="置信度" value={asset.confidence_score} />
  </div>
  <Card className="consulting-table-card" title="证据判断">
    {hasEvidenceBoundaries ? (
      <Descriptions column={{ xs: 1, md: 2 }} bordered size="small">
        <Descriptions.Item label="能证明">{tagList(asset.proves, 'green')}</Descriptions.Item>
        <Descriptions.Item label="不能证明">{tagList(asset.does_not_prove, 'red')}</Descriptions.Item>
        <Descriptions.Item label="适用条件">{tagList(asset.applicable_conditions, 'blue')}</Descriptions.Item>
        <Descriptions.Item label="迁移风险">{tagList(asset.migration_risks, 'gold')}</Descriptions.Item>
        <Descriptions.Item label="置信说明" span={2}>{asset.confidence_reason || '-'}</Descriptions.Item>
      </Descriptions>
    ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无结构化证据边界" />}
  </Card>
  <Card className="consulting-table-card" title="来源信息">
    <Descriptions column={{ xs: 1, md: 2, xl: 3 }} bordered size="small">
      <Descriptions.Item label="来源类型">{sourceTypeLabel[asset.source_type] || asset.source_type}</Descriptions.Item>
      <Descriptions.Item label="来源名称">{asset.source_confidentiality === 'anonymized' ? '已匿名化来源' : asset.source_name || '-'}</Descriptions.Item>
      <Descriptions.Item label="保密级别">{asset.source_confidentiality}</Descriptions.Item>
      <Descriptions.Item label="创建时间">{compactDateTime(asset.created_at)}</Descriptions.Item>
      <Descriptions.Item label="更新时间">{compactDateTime(asset.updated_at)}</Descriptions.Item>
      <Descriptions.Item label="来源链接">{asset.source_confidentiality === 'anonymized' ? '已隐藏' : asset.source_url ? <Link href={asset.source_url} target="_blank">{asset.source_url}</Link> : '-'}</Descriptions.Item>
      <Descriptions.Item label="文件路径">{asset.source_confidentiality === 'anonymized' ? '已隐藏' : asset.source_file_path || '-'}</Descriptions.Item>
    </Descriptions>
  </Card>
  <Card className="consulting-table-card" title="资产正文">
    <Paragraph className="knowledge-raw-text">{asset.raw_text || asset.summary || '暂无正文'}</Paragraph>
  </Card>
</div>
```

Define `hasEvidenceBoundaries` exactly as follows:

```tsx
const hasEvidenceBoundaries = [
  asset.proves,
  asset.does_not_prove,
  asset.applicable_conditions,
  asset.migration_risks,
].some(values => normalizeList(values).length > 0) || Boolean(asset.confidence_reason);
```

When all evidence arrays and `confidence_reason` are empty, render one compact `Empty` state rather than four dash-only description rows.

- [ ] **Step 4: Replace fixed 460px CSS with responsive reading rules**

```css
.knowledge-detail-reading {
  display: grid;
  gap: 16px;
}

.knowledge-detail-score-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.knowledge-review-form .knowledge-review-grid,
.knowledge-review-form .knowledge-score-form-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

@media (max-width: 980px) {
  .knowledge-detail-score-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

- [ ] **Step 5: Verify GREEN and commit**

```bash
cd frontend && npm run test:layout && npm run build
git add frontend/src/pages/KnowledgeAssets/Detail.tsx frontend/src/pages/BusinessWorkbench.css
git commit -m "fix: use full width for knowledge detail reading"
```

Expected: knowledge-detail contract passes and production build succeeds.

### Task 6: Rebuild Customer Project Reading Order Without Empty Grid Rows

**Files:**
- Modify: `frontend/src/pages/CustomerProjects/Detail.tsx`
- Modify: `frontend/src/pages/BusinessWorkbench.css`
- Test: `frontend/scripts/layout-contracts.test.mjs`

- [ ] **Step 1: Verify the project grouping contract is RED**

```bash
cd frontend && npm run test:layout
```

Expected: the customer project subtest fails because the named background, pair, and diagnosis groups are absent.

- [ ] **Step 2: Replace the equal-height grid structure**

Keep the current values and fallback copy, but group them deliberately:

```tsx
<div className="strategy-brief-flow">
  <section className="strategy-brief-background">
    <Text type="secondary">客户背景</Text>
    <Paragraph>{project.business_model || '业务模式待补充。建议先补齐客户获客、交付、收费和组织协同方式。'}</Paragraph>
  </section>
  <div className="strategy-brief-pair">
    <section>
      <Text type="secondary">核心问题</Text>
      <Space wrap className="formal-tag-row">{(project.pain_points || []).length ? project.pain_points.map(item => <Tag key={item}>{item}</Tag>) : <Tag>痛点待补充</Tag>}</Space>
    </section>
    <section>
      <Text type="secondary">业务目标</Text>
      <Space wrap className="formal-tag-row">{(project.goals || []).length ? project.goals.map(item => <Tag color="gold" key={item}>{item}</Tag>) : <Tag color="gold">目标待补充</Tag>}</Space>
    </section>
  </div>
  <section className="strategy-brief-diagnosis">
    <Text type="secondary">诊断标签</Text>
    {diagnosisReady ? <Space wrap className="formal-tag-row">{(diagnosis.problem_categories || []).map((item: string) => <Tag color="purple" key={item}>{item}</Tag>)}</Space> : <Paragraph>尚未生成诊断。先用当前客户背景生成根因假设和追问清单。</Paragraph>}
  </section>
  <section>
    <Text type="secondary">根因假设</Text>
    {diagnosisReady ? <ul className="formal-list">{(diagnosis.root_cause_hypotheses || []).map((item: string) => <li key={item}>{item}</li>)}</ul> : <Paragraph>生成诊断后，这里会展示可验证的业务根因假设。</Paragraph>}
  </section>
  <section>
    <Text type="secondary">下一步问题</Text>
    {diagnosisReady ? <ul className="formal-list">{(diagnosis.next_questions || []).map((item: string) => <li key={item}>{item}</li>)}</ul> : <Paragraph>生成诊断后，这里会变成客户访谈和方案确认的问题清单。</Paragraph>}
  </section>
</div>
```

- [ ] **Step 3: Add content-driven CSS**

```css
.strategy-brief-flow {
  display: grid;
  gap: 12px;
}

.strategy-brief-flow section {
  min-width: 0;
  padding: 14px;
  border: 1px solid #ece4d7;
  border-radius: 8px;
  background: #fffdf8;
}

.strategy-brief-pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-items: start;
}

@media (max-width: 760px) {
  .strategy-brief-pair {
    grid-template-columns: 1fr;
  }
}
```

Allow `.solution-document-card .ant-card-head-wrapper` and `.dossier-header` actions to wrap.

- [ ] **Step 4: Verify GREEN and commit**

```bash
cd frontend && npm run test:layout && npm run build
git add frontend/src/pages/CustomerProjects/Detail.tsx frontend/src/pages/BusinessWorkbench.css
git commit -m "fix: organize customer project detail content"
```

Expected: all four layout contract tests pass.

### Task 7: Audit Remaining Data Tables For The Same Action Overflow

**Files:**
- Modify: `frontend/src/pages/Interviews/List.tsx`
- Modify: `frontend/src/pages/Offers/List.tsx`
- Modify: `frontend/src/pages/Positions/List.tsx`
- Modify: `frontend/src/pages/Workflows/List.tsx`
- Modify: `frontend/src/pages/Settings/Users.tsx`
- Modify: `frontend/src/pages/Reviews/MyReviews.tsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Apply a consistent desktop operation-column contract**

For each table with multiple row actions, keep its current render conditions and add these exact layout properties:

```text
Interviews/List.tsx: operation width 160, fixed right, actions-column, table scroll x 1120
Offers/List.tsx: operation width 196, fixed right, actions-column, table scroll x 1120
Positions/List.tsx: operation width 220, fixed right, actions-column, retain table scroll x 1160
Workflows/List.tsx: operation width 176, fixed right, actions-column, table scroll x 960
Settings/Users.tsx: operation width 152, fixed right, actions-column, retain table scroll x 900
Reviews/MyReviews.tsx: operation width 120, fixed right, actions-column, table scroll x 860
```

- [ ] **Step 2: Prevent text columns from forcing document overflow**

Give long name, description, interviewer, and date columns practical widths plus ellipsis/tooltips or wrapping. Ensure tables scroll within `.ant-table-content`, never at the document root.

- [ ] **Step 3: Build and lint**

```bash
cd frontend && npm run test:layout && npm run build && npm run lint
```

Expected: layout tests and build exit 0; lint has no errors introduced by these changes. Existing warnings must be recorded separately.

- [ ] **Step 4: Commit remaining table corrections**

```bash
git add frontend/src/pages/Interviews/List.tsx frontend/src/pages/Offers/List.tsx frontend/src/pages/Positions/List.tsx frontend/src/pages/Workflows/List.tsx frontend/src/pages/Settings/Users.tsx frontend/src/pages/Reviews/MyReviews.tsx frontend/src/index.css
git commit -m "fix: standardize table action visibility"
```

### Task 8: Run Production-Like Visual Verification

**Files:**
- Modify only if a verified defect remains in files already listed above.

- [ ] **Step 1: Start the local frontend against a safe API configuration**

Run the existing Vite development server or build preview with the project's current API proxy configuration. Do not copy production credentials into tracked files.

```bash
cd frontend && npm run dev -- --host 127.0.0.1
```

- [ ] **Step 2: Verify four viewports**

Inspect dashboard, resume list/detail, knowledge asset list/detail, and customer project list/detail at:

```text
1440x900
1280x720
1024x768
390x844
```

At each size assert:

```text
document.documentElement.scrollWidth <= document.documentElement.clientWidth
No visible text rectangles overlap sibling text or controls
Primary page buttons are fully visible
All row actions are visible or reachable inside the table
Dashboard workbench table header and first row appear in the 1280x720 first viewport
Knowledge detail opens full-width and review drawer opens/closes without shifting document width
Customer project short sections no longer inherit long-section height
```

- [ ] **Step 3: Run final automated verification**

```bash
cd frontend && npm run test:layout && npm run build && npm run lint
git diff --check
git status --short --branch
```

Expected: layout tests pass, build succeeds, lint has zero errors, diff check reports no whitespace errors, and only intended changes are present.

- [ ] **Step 4: Commit any final verified corrections**

If visual verification required a correction, stage only the affected frontend files and commit:

```bash
git commit -m "fix: finish responsive layout verification"
```

If no correction was required, do not create an empty commit.

### Task 9: Publish And Deploy The Verified Frontend

**Files:**
- No source changes expected.

- [ ] **Step 1: Confirm branch synchronization**

```bash
git fetch origin codex/industry-knowledge-product-manager
git rev-list --left-right --count HEAD...origin/codex/industry-knowledge-product-manager
```

Expected: the local branch is only ahead by the commits created in this plan and the remote branch has no unseen commits.

- [ ] **Step 2: Push the current branch**

```bash
git push origin codex/industry-knowledge-product-manager
```

- [ ] **Step 3: Build a candidate frontend image on the server**

Create a timestamped release from the pushed source, copy the existing environment file, and build a uniquely tagged frontend image. Do not recreate the database or change backend source.

- [ ] **Step 4: Preserve rollback state and deploy**

Tag the current frontend image with the release timestamp, switch only the frontend service to the candidate image, and retain the previous release directory and image.

- [ ] **Step 5: Verify the public site**

Check the public HTTPS status, frontend container state, browser console errors, and the same target pages at 1440x900 and 1280x720. Confirm the deployed asset bundle contains the committed layout changes before updating the active release symlink.
