import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Empty, Input, Progress, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import {
  AuditOutlined,
  DatabaseOutlined,
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

const renderTags = (values: string[] = [], color?: string) => (
  <Space wrap size={[4, 4]}>
    {values.slice(0, 4).map(item => <Tag color={color} key={item}>{item}</Tag>)}
    {values.length > 4 ? <Tag>+{values.length - 4}</Tag> : null}
  </Space>
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

  const resetFilters = () => {
    setQuery('');
    setIndustry(undefined);
    setTopic(undefined);
    setEvidenceType(undefined);
    setReviewStatus(undefined);
    setSourceType(undefined);
  };

  return (
    <div className="knowledge-assets-page workbench-page">
      <section className="page-header">
        <div>
          <Title level={2}>行业知识资产库</Title>
          <Text type="secondary">资料、标签、证据评分与复核状态</Text>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={fetchAssets} loading={loading}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/knowledge-assets/intake')}>
            新增资料
          </Button>
        </Space>
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

        <Table
          rowKey="id"
          loading={loading}
          dataSource={assets}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无知识资产" /> }}
          columns={[
            {
              title: '资产',
              dataIndex: 'title',
              width: 280,
              render: (value: string, record: KnowledgeAsset) => (
                <Space direction="vertical" size={4}>
                  <Space wrap size={[6, 4]}>
                    <Text strong>{value}</Text>
                    <Tag>{sourceTypeLabel[record.source_type] || record.source_type}</Tag>
                  </Space>
                  <Text type="secondary" ellipsis={{ tooltip: record.summary || record.raw_text }}>
                    {record.summary || record.raw_text || '待补充摘要'}
                  </Text>
                </Space>
              ),
            },
            {
              title: '标签',
              key: 'tags',
              width: 300,
              render: (_: unknown, record: KnowledgeAsset) => (
                <Space direction="vertical" size={4}>
                  {renderTags(record.industry_tags, 'blue')}
                  {renderTags(record.business_topic_tags, 'geekblue')}
                  {renderTags(record.evidence_type_tags, 'gold')}
                </Space>
              ),
            },
            {
              title: '证据评分',
              key: 'scores',
              width: 190,
              render: (_: unknown, record: KnowledgeAsset) => (
                <div className="asset-score-stack">
                  <Tooltip title="证据强度">
                    <Progress percent={Math.round(record.evidence_strength_score || 0)} size="small" strokeColor={scoreColor(record.evidence_strength_score || 0)} />
                  </Tooltip>
                  <Tooltip title="数据验证">
                    <Progress percent={Math.round(record.data_verification_score || 0)} size="small" strokeColor={scoreColor(record.data_verification_score || 0)} />
                  </Tooltip>
                  <Tooltip title="商业价值">
                    <Progress percent={Math.round(record.commercial_value_score || 0)} size="small" strokeColor={scoreColor(record.commercial_value_score || 0)} />
                  </Tooltip>
                </div>
              ),
            },
            {
              title: '可证明',
              dataIndex: 'proves',
              render: (values: string[]) => renderTags(values, 'green'),
            },
            {
              title: '来源',
              key: 'source',
              width: 170,
              render: (_: unknown, record: KnowledgeAsset) => (
                <Space direction="vertical" size={4}>
                  <Text>{record.source_name || sourceTypeLabel[record.source_type] || record.source_type}</Text>
                  <Text type="secondary">{record.source_confidentiality}</Text>
                </Space>
              ),
            },
            {
              title: '状态',
              dataIndex: 'manual_review_status',
              width: 120,
              render: (value: ReviewStatus) => (
                <Tag color={reviewStatusMeta[value]?.color || 'default'}>
                  {reviewStatusMeta[value]?.label || value}
                </Tag>
              ),
            },
            {
              title: '更新',
              dataIndex: 'updated_at',
              width: 110,
              render: (value: string | null, record: KnowledgeAsset) => compactDate(value || record.created_at),
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default KnowledgeAssetsPage;
