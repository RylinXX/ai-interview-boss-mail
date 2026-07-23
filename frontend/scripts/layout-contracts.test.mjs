import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('dashboard uses the compact module header', async () => {
  const [dashboard, layout, workbench, css, indexCss] = await Promise.all([
    read('src/pages/Dashboard/index.tsx'),
    read('src/components/Layout/index.tsx'),
    read('src/components/Workbench/index.tsx'),
    read('src/pages/BusinessWorkbench.css'),
    read('src/index.css'),
  ]);
  assert.match(workbench, /compact\?: boolean/);
  assert.match(dashboard, /<ModulePageHeader[\s\S]*?compact/);
  assert.match(css, /\.module-page-header-compact/);
  assert.match(dashboard, /className="consulting-metric-grid dashboard-metric-grid"/);
  assert.match(dashboard, /className="dashboard-industry-scroll"/);
  assert.match(dashboard, /className="dashboard-tab-count"/);
  assert.match(dashboard, /tabBarGutter=\{16\}/);
  assert.match(dashboard, /<Drawer[\s\S]*?size=\{560\}/);
  assert.doesNotMatch(dashboard, /<Drawer[\s\S]*?width=\{560\}/);
  assert.match(layout, /<Drawer[\s\S]*?size=\{280\}/);
  assert.doesNotMatch(layout, /<Drawer[\s\S]*?width=\{280\}/);
  assert.match(indexCss, /\.dashboard-page \.dashboard-metric-grid/);
  assert.match(indexCss, /\.dashboard-industry-scroll/);
  assert.match(indexCss, /\.dashboard-tab-count/);
  assert.doesNotMatch(dashboard, /tabBarStyle=\{\{ marginBottom: 20 \}\}/);
  assert.doesNotMatch(dashboard, /bodyStyle=/);
  assert.match(dashboard, /const candidateColumns[\s\S]*?title: '操作'[\s\S]*?fixed: 'right'/);
  assert.match(dashboard, /const workColumns[\s\S]*?title: '操作'[\s\S]*?fixed: 'right'/);
  assert.equal([...dashboard.matchAll(/className="dashboard-fix-button"/g)].length, 2);
  const dashboardFixButtonRule = css.match(/\.actions-column \.dashboard-fix-button\.ant-btn\s*\{([^}]*)\}/);
  assert.ok(dashboardFixButtonRule);
  assert.match(dashboardFixButtonRule[1], /^[ \t]*flex:[ \t]*0 0 76px;[ \t]*$/m);
  assert.match(dashboardFixButtonRule[1], /^[ \t]*width:[ \t]*76px;[ \t]*$/m);
  assert.match(dashboardFixButtonRule[1], /^[ \t]*min-width:[ \t]*76px;[ \t]*$/m);
  assert.match(dashboardFixButtonRule[1], /^[ \t]*padding-inline:[ \t]*10px;[ \t]*$/m);
  assert.match(workbench, /title="数据加载失败"/);
  assert.doesNotMatch(workbench, /message="数据加载失败"/);
});

test('dashboard releases the project workbench before loading secondary summaries', async () => {
  const source = await read('src/pages/Dashboard/index.tsx');
  assert.match(source, /const \[summaryLoading, setSummaryLoading\] = useState\(false\)/);
  assert.match(source, /const \[summaryError, setSummaryError\] = useState<string \| null>\(null\)/);
  assert.match(source, /const dashboardRequestIdRef = useRef\(0\)/);
  assert.match(
    source,
    /const fetchSummary = useCallback\(async \(requestId = \+\+dashboardRequestIdRef\.current\) => \{\s*if \(requestId !== dashboardRequestIdRef\.current\) return;[\s\S]*?setSummaryLoading\(true\);[\s\S]*?setSummaryError\(null\);[\s\S]*?setSummary\(null\);[\s\S]*?request\.get\('\/resumes\/experience-summary', \{ timeout: 20000 \}\)[\s\S]*?\}, \[message\]\);/,
  );

  const fetchSummaryStart = source.indexOf('const fetchSummary = useCallback');
  const fetchDataStart = source.indexOf('const fetchData = useCallback');
  assert.ok(fetchSummaryStart > -1 && fetchDataStart > fetchSummaryStart);
  const fetchSummarySource = source.slice(fetchSummaryStart, fetchDataStart);
  assert.match(
    fetchSummarySource,
    /const summaryRes = await request\.get[\s\S]*?if \(requestId === dashboardRequestIdRef\.current\) \{\s*setSummary\(summaryRes as ExperienceSummary\);\s*\}/,
  );
  assert.match(
    fetchSummarySource,
    /catch \(error\) \{\s*if \(requestId === dashboardRequestIdRef\.current\) \{[\s\S]*?setSummaryError\(errorMessage\);[\s\S]*?message\.warning\(errorMessage\);[\s\S]*?\}\s*\} finally/,
  );
  assert.match(
    fetchSummarySource,
    /finally \{\s*if \(requestId === dashboardRequestIdRef\.current\) \{\s*setSummaryLoading\(false\);\s*\}\s*\}/,
  );
  assert.match(source, /const fetchData = useCallback\(async \(initialLoad = false\) => \{\s*const requestId = \+\+dashboardRequestIdRef\.current;/);
  const useEffectStart = source.indexOf('useEffect(() => {', fetchDataStart);
  assert.ok(useEffectStart > fetchDataStart);
  const fetchDataSource = source.slice(fetchDataStart, useEffectStart);
  assert.match(
    fetchDataSource,
    /const \[resumeRes, projectRes\] = await Promise\.all[\s\S]*?if \(requestId !== dashboardRequestIdRef\.current\) return;[\s\S]*?setResumeMetrics\(resumeRes as ResumeMetrics\);[\s\S]*?setProjectLibrary\(projectRes as ProjectLibrary\);[\s\S]*?await fetchSummary\(requestId\);/,
  );
  assert.match(
    fetchDataSource,
    /setProjectLibrary\(projectRes as ProjectLibrary\);\s*setLoading\(false\);\s*await fetchSummary\(requestId\);/,
  );
  assert.match(
    fetchDataSource,
    /catch \(error\) \{[\s\S]*?if \(requestId === dashboardRequestIdRef\.current\) \{[\s\S]*?setLoadError\(errorMessage\);[\s\S]*?message\.error\(errorMessage\);[\s\S]*?setSummaryLoading\(false\);[\s\S]*?\}/,
  );
  assert.match(
    fetchDataSource,
    /finally \{\s*if \(requestId === dashboardRequestIdRef\.current\) \{\s*setLoading\(false\);\s*setRefreshing\(false\);\s*\}\s*\}/,
  );
  assert.match(
    source,
    /request\.get\('\/resumes\/project-library'[\s\S]*?setProjectLibrary\([\s\S]*?setLoading\(false\)[\s\S]*?await fetchSummary\(requestId\);/,
  );

  const capabilityStart = source.indexOf("key: 'capabilities'");
  const workStart = source.indexOf("key: 'works'");
  assert.ok(capabilityStart > -1 && workStart > capabilityStart);
  const capabilityTab = source.slice(capabilityStart, workStart);
  const workTab = source.slice(workStart);

  assert.match(capabilityTab, /\{summaryLoading \? '加载中' : summaryError \? '重试' : candidateRows\.length\}/);
  assert.match(workTab, /\{summaryLoading \? '加载中' : summaryError \? '重试' : workRows\.length\}/);
  assert.match(capabilityTab, /children: \(\s*<AsyncState loading=\{summaryLoading\} error=\{summaryError\} onRetry=\{\(\) => fetchSummary\(\)\}>/);
  assert.match(workTab, /children: \(\s*<AsyncState loading=\{summaryLoading\} error=\{summaryError\} onRetry=\{\(\) => fetchSummary\(\)\}>/);
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
  assert.match(source, /size=\{560\}/);
  assert.match(source, /forceRender/);
  assert.doesNotMatch(source, /width=\{560\}/);
  assert.match(source, /className="knowledge-detail-reading"/);
  assert.doesNotMatch(css, /\.knowledge-detail-grid[^}]*460px/s);
});

test('customer project detail uses explicit reading groups', async () => {
  const [source, listSource, css] = await Promise.all([
    read('src/pages/CustomerProjects/Detail.tsx'),
    read('src/pages/CustomerProjects/List.tsx'),
    read('src/pages/BusinessWorkbench.css'),
  ]);
  assert.match(source, /strategy-brief-background/);
  assert.match(source, /strategy-brief-pair/);
  assert.match(source, /strategy-brief-diagnosis/);
  assert.match(source, /<Col xs=\{24\} xl=\{14\}>/);
  assert.match(source, /<Col xs=\{24\} xl=\{10\}>/);
  assert.match(css, /\.strategy-brief-pair/);
  assert.match(listSource, /title: '操作'[\s\S]*?fixed: 'right'/);
  assert.match(listSource, /className: 'actions-column'/);
  assert.match(listSource, /className="customer-project-view-button"/);
  assert.match(css, /\.customer-project-view-button\.ant-btn/);
});
