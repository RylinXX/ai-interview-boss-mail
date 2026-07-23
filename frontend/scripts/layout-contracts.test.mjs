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
