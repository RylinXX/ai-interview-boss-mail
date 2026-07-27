import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Input, Pagination, Progress, Select, Segmented, Space, Table, Tag, Typography } from 'antd';
import {
  AppstoreOutlined,
  AuditOutlined,
  DatabaseOutlined,
  EyeOutlined,
  FileSearchOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  TagsOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import request, { getApiErrorMessage } from '../../utils/request';
import { AsyncState, ModulePageHeader } from '../../components/Workbench';
import '../BusinessWorkbench.css';

const { Text } = Typography;

type ReviewStatus = 'unreviewed' | 'reviewed' | 'needs_revision';

type KnowledgeAsset = {
  id: string;
  title: string;
  source_type: string;
  source_name?: string | null;
  source_url?: string | null;
  source_confidentiality: string;
  summary?: string | null;
  industry_tags: string[];
  business_topic_tags: string[];
  scenario_tags: string[];
  evidence_type_tags: string[];
  capability_tags: string[];
  methodology_tags: string[];
  customer_type_tags: string[];
  value_tags: string[];
  proves: string[];
  does_not_prove: string[];
  evidence_strength_score: number;
  data_verification_score: number;
  commercial_value_score: number;
  confidence_score: number;
  manual_review_status: ReviewStatus;
  created_at: string;
  updated_at?: string | null;
};

type KnowledgeAssetListResponse = {
  items: KnowledgeAsset[];
  total: number;
  industry_tags: string[];
  business_topic_tags: string[];
  evidence_type_tags: string[];
  metrics?: {
    asset_total: number;
    reviewed: number;
    evidence_ready: number;
    high_confidence: number;
  };
};

type AssetFilters = {
  query?: string;
  industry?: string;
  topic?: string;
  evidenceType?: string;
  reviewStatus?: string;
  sourceType?: string;
};

const reviewStatusMeta: Record<ReviewStatus, { label: string; color: string }> = {
  unreviewed: { label: '待复核', color: 'gold' },
  reviewed: { label: '已复核', color: 'green' },
  needs_revision: { label: '需修订', color: 'red' },
};

const sourceTypeLabel: Record<string, string> = {
  manual_note: '人工资料',
  company_case: '案例资料',
  official_database: '官方数据库',
  third_party_data: '三方数据',
  open_source_project: '开源项目',
  commercial_product: '商业产品',
  resume_project: '简历项目',
  resume_work_experience: '简历经历',
};

const sourceTypeOptions = Object.entries(sourceTypeLabel).map(([value, label]) => ({ value, label }));
const reviewStatusOptions = Object.entries(reviewStatusMeta).map(([value, meta]) => ({ value, label: meta.label }));

const compactDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString();
};

const renderTags = (values: string[] = [], color?: string, limit = 4) => (
  values.length ? (
    <Space wrap size={[4, 4]}>
      {values.slice(0, limit).map(item => <Tag color={color} key={item}>{item}</Tag>)}
      {values.length > limit ? <Tag>+{values.length - limit}</Tag> : null}
    </Space>
  ) : <Text type="secondary">待补充</Text>
);

const scoreColor = (value: number) => {
  if (value >= 75) return '#389e0d';
  if (value >= 50) return '#d48806';
  return '#cf1322';
};

const getSourceLabel = (record: KnowledgeAsset) => (
  record.source_confidentiality === 'anonymized'
    ? '已匿名化来源'
    : record.source_name || record.source_confidentiality || '内部资料'
);

const KnowledgeAssetsPage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [assets, setAssets] = useState<KnowledgeAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [serverMetrics, setServerMetrics] = useState({
    asset_total: 0,
    reviewed: 0,
    evidence_ready: 0,
    high_confidence: 0,
  });
  const [taxonomy, setTaxonomy] = useState({
    industry_tags: [] as string[],
    business_topic_tags: [] as string[],
    evidence_type_tags: [] as string[],
  });
  const [query, setQuery] = useState('');
  const [industry, setIndustry] = useState<string>();
  const [topic, setTopic] = useState<string>();
  const [evidenceType, setEvidenceType] = useState<string>();
  const [reviewStatus, setReviewStatus] = useState<string>();
  const [sourceType, setSourceType] = useState<string>();
  const [activeFilters, setActiveFilters] = useState<AssetFilters>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await request.get('/knowledge-assets', {
        params: {
          query: activeFilters.query || undefined,
          industry: activeFilters.industry,
          topic: activeFilters.topic,
          evidence_type: activeFilters.evidenceType,
          review_status: activeFilters.reviewStatus,
          source_type: activeFilters.sourceType,
          limit: pageSize,
          offset: (currentPage - 1) * pageSize,
        },
      }) as KnowledgeAssetListResponse;
      setAssets(res.items || []);
      setTotal(res.total || 0);
      setServerMetrics(res.metrics || {
        asset_total: res.total || 0,
        reviewed: 0,
        evidence_ready: 0,
        high_confidence: 0,
      });
      setTaxonomy({
        industry_tags: res.industry_tags || [],
        business_topic_tags: res.business_topic_tags || [],
        evidence_type_tags: res.evidence_type_tags || [],
      });
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, '获取知识资产失败，请稍后重试');
      setLoadError(errorMessage);
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [activeFilters, currentPage, message, pageSize]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const metrics = useMemo(() => {
    return [
      { label: '资产总量', value: serverMetrics.asset_total, hint: '当前筛选结果', icon: <DatabaseOutlined /> },
      { label: '已复核', value: serverMetrics.reviewed, hint: '可优先引用', icon: <AuditOutlined /> },
      { label: '强证据', value: serverMetrics.evidence_ready, hint: '证据评分不低于60', icon: <SafetyCertificateOutlined /> },
      { label: '高置信', value: serverMetrics.high_confidence, hint: '置信度不低于70', icon: <TagsOutlined /> },
    ];
  }, [serverMetrics]);

  const applyFilters = () => {
    const nextFilters = {
      query: query.trim() || undefined,
      industry,
      topic,
      evidenceType,
      reviewStatus,
      sourceType,
    };
    if (currentPage === 1 && JSON.stringify(nextFilters) === JSON.stringify(activeFilters)) {
      fetchAssets();
      return;
    }
    setCurrentPage(1);
    setActiveFilters(nextFilters);
  };

  const resetFilters = () => {
    setQuery('');
    setIndustry(undefined);
    setTopic(undefined);
    setEvidenceType(undefined);
    setReviewStatus(undefined);
    setSourceType(undefined);
    setCurrentPage(1);
    setActiveFilters({});
  };

  const selectedFilters = [
    activeFilters.query ? `关键词：${activeFilters.query}` : null,
    activeFilters.industry ? `行业：${activeFilters.industry}` : null,
    activeFilters.topic ? `主题：${activeFilters.topic}` : null,
    activeFilters.evidenceType ? `证据：${activeFilters.evidenceType}` : null,
    activeFilters.reviewStatus ? `复核：${reviewStatusMeta[activeFilters.reviewStatus as ReviewStatus]?.label || activeFilters.reviewStatus}` : null,
    activeFilters.sourceType ? `来源：${sourceTypeLabel[activeFilters.sourceType] || activeFilters.sourceType}` : null,
  ].filter(Boolean) as string[];

  const columns = [
    {
      title: '资产标题与来源',
      dataIndex: 'title',
      key: 'title',
      width: '32%',
      render: (text: string, record: KnowledgeAsset) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <a
            style={{ fontWeight: 600, fontSize: '14px', color: 'var(--primary-color, #1890ff)' }}
            onClick={(e) => {
              e.preventDefault();
              navigate(`/knowledge-assets/${record.id}`);
            }}
          >
            {text}
          </a>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Tag color="blue" style={{ margin: 0 }}>
              {sourceTypeLabel[record.source_type] || record.source_type}
            </Tag>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {getSourceLabel(record)}
            </Text>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              • 更新 {compactDate(record.updated_at || record.created_at)}
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: '行业与主题',
      key: 'tags',
      width: '24%',
      render: (_: any, record: KnowledgeAsset) => (
        <Space direction="vertical" size={2}>
          {record.industry_tags?.length ? (
            <div>
              <Text type="secondary" style={{ fontSize: '11px', marginRight: 4 }}>行业:</Text>
              {renderTags(record.industry_tags, 'blue', 2)}
            </div>
          ) : null}
          {record.business_topic_tags?.length ? (
            <div>
              <Text type="secondary" style={{ fontSize: '11px', marginRight: 4 }}>主题:</Text>
              {renderTags(record.business_topic_tags, 'geekblue', 2)}
            </div>
          ) : null}
        </Space>
      ),
    },
    {
      title: '能证明/核心证据',
      key: 'evidence',
      width: '22%',
      render: (_: any, record: KnowledgeAsset) => (
        <Space direction="vertical" size={2}>
          {record.proves?.length ? (
            <div>
              <Text type="secondary" style={{ fontSize: '11px', marginRight: 4 }}>证明:</Text>
              {renderTags(record.proves, 'green', 2)}
            </div>
          ) : null}
          {record.evidence_type_tags?.length ? (
            <div>
              <Text type="secondary" style={{ fontSize: '11px', marginRight: 4 }}>证据:</Text>
              {renderTags(record.evidence_type_tags, 'gold', 2)}
            </div>
          ) : null}
        </Space>
      ),
    },
    {
      title: '资产质效',
      key: 'scores',
      width: '12%',
      render: (_: any, record: KnowledgeAsset) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 90 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
            <Text type="secondary">强度</Text>
            <Text strong style={{ color: scoreColor(record.evidence_strength_score) }}>{record.evidence_strength_score}</Text>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
            <Text type="secondary">置信度</Text>
            <Text strong style={{ color: scoreColor(record.confidence_score) }}>{record.confidence_score}</Text>
          </div>
        </div>
      ),
    },
    {
      title: '复核状态',
      dataIndex: 'manual_review_status',
      key: 'manual_review_status',
      width: '90px',
      render: (status: ReviewStatus) => (
        <Tag color={reviewStatusMeta[status]?.color || 'default'} style={{ margin: 0 }}>
          {reviewStatusMeta[status]?.label || status}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: '80px',
      align: 'center' as const,
      render: (_: any, record: KnowledgeAsset) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/knowledge-assets/${record.id}`)}
        >
          查看
        </Button>
      ),
    },
  ];

  return (
    <div className="knowledge-assets-page workbench-page">
      <ModulePageHeader
        eyebrow={<><DatabaseOutlined /> 数据资产控制台</>}
        title="知识资产库"
        description="按来源、标签、证据边界和复核状态管理可被方案 Agent 引用的行业资料。"
        metrics={metrics}
        actions={<Button icon={<ReloadOutlined />} onClick={fetchAssets} loading={loading}>刷新</Button>}
      />

      <AsyncState loading={loading} error={loadError} onRetry={fetchAssets}>
        <Card className="consulting-table-card" title="知识资产检索与列表">
        <div className="knowledge-assets-toolbar" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
          <Space wrap size="small" style={{ flex: 1 }}>
            <Input
              allowClear
              prefix={<FileSearchOutlined />}
              placeholder="搜索标题、摘要或原文"
              value={query}
              onChange={event => setQuery(event.target.value)}
              onPressEnter={applyFilters}
              style={{ width: 220 }}
            />
            <Select
              allowClear
              showSearch
              placeholder="行业"
              value={industry}
              options={taxonomy.industry_tags.map(value => ({ value, label: value }))}
              onChange={setIndustry}
              style={{ width: 130 }}
            />
            <Select
              allowClear
              showSearch
              placeholder="业务主题"
              value={topic}
              options={taxonomy.business_topic_tags.map(value => ({ value, label: value }))}
              onChange={setTopic}
              style={{ width: 130 }}
            />
            <Select
              allowClear
              showSearch
              placeholder="证据类型"
              value={evidenceType}
              options={taxonomy.evidence_type_tags.map(value => ({ value, label: value }))}
              onChange={setEvidenceType}
              style={{ width: 130 }}
            />
            <Select
              allowClear
              placeholder="复核状态"
              value={reviewStatus}
              options={reviewStatusOptions}
              onChange={setReviewStatus}
              style={{ width: 110 }}
            />
            <Select
              allowClear
              placeholder="来源类型"
              value={sourceType}
              options={sourceTypeOptions}
              onChange={setSourceType}
              style={{ width: 120 }}
            />
            <Space>
              <Button type="primary" icon={<FileSearchOutlined />} onClick={applyFilters}>检索</Button>
              <Button onClick={resetFilters}>重置</Button>
            </Space>
          </Space>
          <Segmented
            value={viewMode}
            onChange={val => setViewMode(val as 'table' | 'cards')}
            options={[
              { label: '条状高密', value: 'table', icon: <UnorderedListOutlined /> },
              { label: '卡片平铺', value: 'cards', icon: <AppstoreOutlined /> },
            ]}
          />
        </div>

        {selectedFilters.length ? (
          <div className="knowledge-selected-filters" aria-label="当前筛选条件" style={{ marginTop: 12 }}>
            <Text type="secondary">已选条件</Text>
            <Space wrap size={[4, 4]}>{selectedFilters.map(item => <Tag key={item}>{item}</Tag>)}</Space>
          </div>
        ) : null}

        {assets.length ? (
          <>
            {viewMode === 'table' ? (
              <div style={{ marginTop: 16 }}>
                <Table
                  rowKey="id"
                  dataSource={assets}
                  columns={columns}
                  loading={loading}
                  pagination={{
                    current: currentPage,
                    pageSize: pageSize,
                    total: total,
                    showSizeChanger: true,
                    pageSizeOptions: ['10', '15', '20', '30'],
                    onChange: (page, size) => {
                      setCurrentPage(page);
                      setPageSize(size);
                    },
                  }}
                  scroll={{ x: 900 }}
                  size="middle"
                />
              </div>
            ) : (
              <>
                <div className="knowledge-asset-card-grid" aria-busy={loading} style={{ marginTop: 16 }}>
                  {assets.map(record => (
                    <button
                      type="button"
                      className="knowledge-asset-tile"
                      key={record.id}
                      onClick={() => navigate(`/knowledge-assets/${record.id}`)}
                    >
                      <div className="knowledge-asset-title-row">
                        <span className="knowledge-asset-source">
                          {sourceTypeLabel[record.source_type] || record.source_type}
                        </span>
                        <Tag color={reviewStatusMeta[record.manual_review_status]?.color || 'default'}>
                          {reviewStatusMeta[record.manual_review_status]?.label || record.manual_review_status}
                        </Tag>
                      </div>
                      <strong className="knowledge-asset-title">{record.title}</strong>
                      <Text type="secondary" className="knowledge-asset-summary">
                        {record.summary || '待补充摘要'}
                      </Text>

                      <div className="knowledge-asset-taxonomy">
                        <section>
                          <span>行业</span>
                          {renderTags(record.industry_tags, 'blue', 3)}
                        </section>
                        <section>
                          <span>主题</span>
                          {renderTags(record.business_topic_tags, 'geekblue', 3)}
                        </section>
                        <section>
                          <span>证据</span>
                          {renderTags(record.evidence_type_tags, 'gold', 3)}
                        </section>
                      </div>

                      <div className="knowledge-asset-proof-grid">
                        <section>
                          <span>能证明</span>
                          {renderTags(record.proves, 'green', 2)}
                        </section>
                        <section>
                          <span>来源</span>
                          <Text>{getSourceLabel(record)}</Text>
                        </section>
                      </div>

                      <div className="knowledge-asset-score-grid">
                        {[
                          ['证据强度', record.evidence_strength_score],
                          ['数据验证', record.data_verification_score],
                          ['商业价值', record.commercial_value_score],
                          ['置信度', record.confidence_score],
                        ].map(([label, value]) => (
                          <div key={label as string}>
                            <span>{label}</span>
                            <Progress
                              percent={Math.round(Number(value) || 0)}
                              size="small"
                              showInfo={false}
                              strokeColor={scoreColor(Number(value) || 0)}
                            />
                          </div>
                        ))}
                      </div>

                      <div className="knowledge-asset-meta-row">
                        <span>更新 {compactDate(record.updated_at || record.created_at)}</span>
                        <span><EyeOutlined /> 查看详情</span>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="knowledge-assets-pagination">
                  <Pagination
                    current={currentPage}
                    pageSize={pageSize}
                    total={total}
                    showSizeChanger
                    pageSizeOptions={['9', '12', '18']}
                    onChange={(page, size) => {
                      setCurrentPage(page);
                      setPageSize(size);
                    }}
                  />
                </div>
              </>
            )}
          </>
          ) : (
            <AsyncState empty emptyDescription="暂无符合条件的知识资产"><span /></AsyncState>
          )}
        </Card>
      </AsyncState>
    </div>
  );
};

export default KnowledgeAssetsPage;
