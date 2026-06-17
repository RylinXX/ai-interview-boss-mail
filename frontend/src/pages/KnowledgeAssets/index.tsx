import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Empty, Input, Pagination, Progress, Select, Space, Tag, Typography } from 'antd';
import {
  AuditOutlined,
  DatabaseOutlined,
  EyeOutlined,
  FileSearchOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import request, { getApiErrorMessage } from '../../utils/request';
import '../BusinessWorkbench.css';

const { Title, Text } = Typography;

type ReviewStatus = 'unreviewed' | 'reviewed' | 'needs_revision';

type KnowledgeAsset = {
  id: string;
  title: string;
  source_type: string;
  source_name?: string | null;
  source_url?: string | null;
  source_confidentiality: string;
  raw_text?: string | null;
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

const KnowledgeAssetsPage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<KnowledgeAsset[]>([]);
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
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(9);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request.get('/knowledge-assets', {
        params: {
          query: query || undefined,
          industry,
          topic,
          evidence_type: evidenceType,
          review_status: reviewStatus,
          source_type: sourceType,
          limit: 200,
        },
      }) as KnowledgeAssetListResponse;
      setAssets(res.items || []);
      setTaxonomy({
        industry_tags: res.industry_tags || [],
        business_topic_tags: res.business_topic_tags || [],
        evidence_type_tags: res.evidence_type_tags || [],
      });
      setCurrentPage(1);
    } catch (error) {
      message.error(getApiErrorMessage(error, '获取知识资产失败'));
    } finally {
      setLoading(false);
    }
  }, [evidenceType, industry, message, query, reviewStatus, sourceType, topic]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const metrics = useMemo(() => {
    const reviewed = assets.filter(item => item.manual_review_status === 'reviewed').length;
    const highConfidence = assets.filter(item => (item.confidence_score || 0) >= 70).length;
    const evidenceReady = assets.filter(item => (item.evidence_strength_score || 0) >= 60).length;
    return [
      { label: '资产总量', value: assets.length, hint: '当前筛选结果', icon: <DatabaseOutlined /> },
      { label: '已复核', value: reviewed, hint: '可优先引用', icon: <AuditOutlined /> },
      { label: '强证据', value: evidenceReady, hint: '证据评分不低于60', icon: <SafetyCertificateOutlined /> },
      { label: '高置信', value: highConfidence, hint: '置信度不低于70', icon: <TagsOutlined /> },
    ];
  }, [assets]);

  const visibleAssets = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return assets.slice(start, start + pageSize);
  }, [assets, currentPage, pageSize]);

  const resetFilters = () => {
    setQuery('');
    setIndustry(undefined);
    setTopic(undefined);
    setEvidenceType(undefined);
    setReviewStatus(undefined);
    setSourceType(undefined);
    setCurrentPage(1);
  };

  return (
    <div className="knowledge-assets-page workbench-page">
      <section className="workbench-module-hero">
        <div className="workbench-module-copy">
          <span className="module-eyebrow"><DatabaseOutlined /> 数据资产控制台</span>
          <Title level={2}>知识资产库</Title>
          <Text type="secondary">按来源、标签、证据边界和复核状态管理可被方案 Agent 引用的行业资料。</Text>
        </div>
        <Space wrap className="workbench-module-actions">
          <Button icon={<ReloadOutlined />} onClick={fetchAssets} loading={loading}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/knowledge-assets/intake')}>
            新增资料
          </Button>
        </Space>
        <div className="workbench-module-steps" aria-label="行业知识资产库工作步骤">
          <span><strong>01</strong> 来源归档</span>
          <span><strong>02</strong> 标签分层</span>
          <span><strong>03</strong> 证据评分</span>
          <span><strong>04</strong> 方案引用</span>
        </div>
      </section>

      <div className="consulting-metric-grid knowledge-metric-grid">
        {metrics.map(metric => (
          <Card className="consulting-metric-card" key={metric.label}>
            <span className="metric-icon">{metric.icon}</span>
            <Text type="secondary">{metric.label}</Text>
            <strong>{metric.value}</strong>
            <span>{metric.hint}</span>
          </Card>
        ))}
      </div>

      <Card className="consulting-table-card" title="资产检索">
        <div className="knowledge-assets-toolbar">
          <Input
            allowClear
            prefix={<FileSearchOutlined />}
            placeholder="搜索标题、摘要或原文"
            value={query}
            onChange={event => setQuery(event.target.value)}
            onPressEnter={fetchAssets}
          />
          <Select
            allowClear
            showSearch
            placeholder="行业"
            value={industry}
            options={taxonomy.industry_tags.map(value => ({ value, label: value }))}
            onChange={setIndustry}
          />
          <Select
            allowClear
            showSearch
            placeholder="业务主题"
            value={topic}
            options={taxonomy.business_topic_tags.map(value => ({ value, label: value }))}
            onChange={setTopic}
          />
          <Select
            allowClear
            showSearch
            placeholder="证据类型"
            value={evidenceType}
            options={taxonomy.evidence_type_tags.map(value => ({ value, label: value }))}
            onChange={setEvidenceType}
          />
          <Select
            allowClear
            placeholder="复核状态"
            value={reviewStatus}
            options={reviewStatusOptions}
            onChange={setReviewStatus}
          />
          <Select
            allowClear
            placeholder="来源类型"
            value={sourceType}
            options={sourceTypeOptions}
            onChange={setSourceType}
          />
          <Space>
            <Button type="primary" icon={<FileSearchOutlined />} onClick={fetchAssets}>检索</Button>
            <Button onClick={resetFilters}>重置</Button>
          </Space>
        </div>

        {assets.length ? (
          <>
            <div className="knowledge-asset-card-grid" aria-busy={loading}>
              {visibleAssets.map(record => (
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
                    {record.summary || record.raw_text || '待补充摘要'}
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
                      <Text>{record.source_name || record.source_confidentiality || '内部资料'}</Text>
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
                total={assets.length}
                showSizeChanger
                pageSizeOptions={[6, 9, 12, 18]}
                onChange={(page, size) => {
                  setCurrentPage(page);
                  setPageSize(size);
                }}
              />
            </div>
          </>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={loading ? '正在加载知识资产' : '暂无知识资产'} />
        )}
      </Card>
    </div>
  );
};

export default KnowledgeAssetsPage;
