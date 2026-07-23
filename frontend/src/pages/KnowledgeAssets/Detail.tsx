import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Descriptions, Drawer, Empty, Form, Input, InputNumber, Progress, Select, Space, Tag, Typography } from 'antd';
import { ArrowLeftOutlined, FileTextOutlined, ReloadOutlined, SaveOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import request, { getApiErrorMessage } from '../../utils/request';
import { AsyncState, ModulePageHeader } from '../../components/Workbench';
import '../BusinessWorkbench.css';

const { Text, Paragraph, Link } = Typography;
const { TextArea } = Input;

type ReviewStatus = 'unreviewed' | 'reviewed' | 'needs_revision';

type KnowledgeAsset = {
  id: string;
  title: string;
  source_type: string;
  source_name?: string | null;
  source_url?: string | null;
  source_file_path?: string | null;
  source_resume_id?: string | null;
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
  applicable_conditions: string[];
  migration_risks: string[];
  evidence_strength_score: number;
  data_verification_score: number;
  commercial_value_score: number;
  relevance_score: number;
  confidence_score: number;
  confidence_reason?: string | null;
  manual_review_status: ReviewStatus;
  created_at: string;
  updated_at?: string | null;
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

const tagFieldProps = {
  mode: 'tags' as const,
  tokenSeparators: [',', '，', ';', '；', '、'],
  allowClear: true,
};

const normalizeList = (value?: string[]) => (Array.isArray(value) ? value.filter(Boolean) : []);
const compactDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

const scoreColor = (value: number) => {
  if (value >= 75) return '#389e0d';
  if (value >= 50) return '#d48806';
  return '#cf1322';
};

const tagList = (values: string[] = [], color?: string) => (
  values.length ? (
    <Space wrap size={[4, 4]}>
      {values.map(item => <Tag color={color} key={item}>{item}</Tag>)}
    </Space>
  ) : <Text type="secondary">-</Text>
);

const ScoreItem = ({ label, value }: { label: string; value: number }) => (
  <div className="knowledge-detail-score">
    <Text type="secondary">{label}</Text>
    <Progress percent={Math.round(value || 0)} strokeColor={scoreColor(value || 0)} />
  </div>
);

const KnowledgeAssetDetailPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [asset, setAsset] = useState<KnowledgeAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const fetchAsset = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await request.get(`/knowledge-assets/${id}`) as KnowledgeAsset;
      setAsset(res);
      form.setFieldsValue(res);
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, '获取知识资产详情失败');
      setLoadError(errorMessage);
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [form, id, message]);

  useEffect(() => {
    fetchAsset();
  }, [fetchAsset]);

  const saveReview = async () => {
    if (!id) return;
    const values = await form.validateFields();
    setSaving(true);
    try {
      const payload = {
        ...values,
        industry_tags: normalizeList(values.industry_tags),
        business_topic_tags: normalizeList(values.business_topic_tags),
        scenario_tags: normalizeList(values.scenario_tags),
        evidence_type_tags: normalizeList(values.evidence_type_tags),
        capability_tags: normalizeList(values.capability_tags),
        methodology_tags: normalizeList(values.methodology_tags),
        customer_type_tags: normalizeList(values.customer_type_tags),
        value_tags: normalizeList(values.value_tags),
        proves: normalizeList(values.proves),
        does_not_prove: normalizeList(values.does_not_prove),
        applicable_conditions: normalizeList(values.applicable_conditions),
        migration_risks: normalizeList(values.migration_risks),
      };
      const res = await request.put(`/knowledge-assets/${id}/review`, payload) as KnowledgeAsset;
      setAsset(res);
      form.setFieldsValue(res);
      setReviewOpen(false);
      message.success('复核信息已保存');
    } catch (error) {
      message.error(getApiErrorMessage(error, '保存复核信息失败'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="knowledge-assets-page workbench-page">
        <ModulePageHeader eyebrow="知识资产复核" title="知识资产详情" description="正在读取资产正文、证据边界与来源信息。" />
        <AsyncState loading><span /></AsyncState>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="knowledge-assets-page workbench-page">
        <ModulePageHeader eyebrow="知识资产复核" title="知识资产详情" description="当前资产无法读取。" actions={<Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/knowledge-assets')}>返回资产库</Button>} />
        <AsyncState error={loadError} empty={!loadError} emptyDescription="知识资产不存在" onRetry={fetchAsset}><span /></AsyncState>
      </div>
    );
  }

  const hasEvidenceBoundaries = [
    asset.proves,
    asset.does_not_prove,
    asset.applicable_conditions,
    asset.migration_risks,
  ].some(values => normalizeList(values).length > 0) || Boolean(asset.confidence_reason);

  return (
    <div className="knowledge-assets-page workbench-page">
      <ModulePageHeader
        eyebrow={<><SafetyCertificateOutlined /> 知识资产复核</>}
        title={asset.title}
        description={<Space wrap><span>{sourceTypeLabel[asset.source_type] || asset.source_type}</span><Tag color={reviewStatusMeta[asset.manual_review_status]?.color || 'default'}>{reviewStatusMeta[asset.manual_review_status]?.label || asset.manual_review_status}</Tag></Space>}
        actions={<>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/knowledge-assets')}>返回资产库</Button>
          {asset.source_resume_id && asset.source_confidentiality !== 'anonymized' ? (
            <Button icon={<FileTextOutlined />} onClick={() => navigate(`/resumes/${asset.source_resume_id}`)}>
              来源样本
            </Button>
          ) : null}
          <Button icon={<ReloadOutlined />} onClick={fetchAsset} loading={loading}>刷新</Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={() => setReviewOpen(true)}>
            编辑复核
          </Button>
        </>}
      />

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

      <Drawer
        title="编辑资产复核"
        width={560}
        open={reviewOpen}
        onClose={() => {
          form.setFieldsValue(asset);
          setReviewOpen(false);
        }}
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
    </div>
  );
};

export default KnowledgeAssetDetailPage;
