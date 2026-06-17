import React, { useState } from 'react';
import { App, Button, Card, Empty, Form, Input, List, Progress, Space, Tag, Typography } from 'antd';
import {
  AuditOutlined,
  BulbOutlined,
  DatabaseOutlined,
  FileSearchOutlined,
  ProfileOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import request, { getApiErrorMessage } from '../../utils/request';
import '../BusinessWorkbench.css';

const { Title, Text, Paragraph } = Typography;

type KnowledgeAsset = {
  id: string;
  title: string;
  source_type: string;
  summary?: string | null;
  raw_text?: string | null;
  industry_tags: string[];
  business_topic_tags: string[];
  evidence_type_tags: string[];
  confidence_score: number;
};

type RetrievedKnowledgeAsset = {
  asset: KnowledgeAsset;
  match_score: number;
  match_reason: string;
};

type DraftResponse = {
  demand_understanding: string;
  evidence_summary: string[];
  solution_hypotheses: Array<{
    name?: string;
    why_it_may_work?: string;
    required_data?: string[];
    suggested_workflow?: string[];
    cited_asset_ids?: string[];
  }>;
  missing_questions: string[];
  human_confirmation_points: string[];
  next_workflow: string[];
  cited_assets: RetrievedKnowledgeAsset[];
  model_used: boolean;
  fallback_used: boolean;
};

type ProductManagerForm = {
  demand: string;
  company_profile?: string;
  constraints?: string;
  confirmed_context?: string;
};

const splitLines = (value?: string) => (
  String(value || '')
    .split(/\\r\\n|\\n|\\r|\r\n|\n|\r|,|，|;|；/)
    .map(item => item.trim())
    .filter(Boolean)
);

const renderTags = (values: string[] = [], color?: string) => (
  <Space wrap size={[4, 4]}>
    {values.slice(0, 4).map(item => <Tag color={color} key={item}>{item}</Tag>)}
  </Space>
);

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

const AIProductManagerPage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm<ProductManagerForm>();
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<DraftResponse | null>(null);

  const generateDraft = async () => {
    const values = await form.validateFields();
    setGenerating(true);
    try {
      const confirmedNotes = splitLines(values.confirmed_context);
      const res = await request.post('/ai-product-manager/draft', {
        demand: values.demand,
        company_profile: values.company_profile,
        constraints: values.constraints,
        confirmed_context: confirmedNotes.length ? { notes: confirmedNotes } : {},
        limit: 8,
      }, { timeout: 120000 }) as DraftResponse;
      setDraft(res);
      message.success('方案草稿已生成');
    } catch (error) {
      message.error(getApiErrorMessage(error, '生成方案草稿失败'));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="ai-product-manager-page workbench-page">
      <section className="workbench-module-hero">
        <div className="workbench-module-copy">
          <span className="module-eyebrow"><BulbOutlined /> AI 产品经理工作流</span>
          <Title level={2}>AI 产品经理</Title>
          <Text type="secondary">从客户自然需求出发，检索受控资产，生成可复核的证据化方案草稿。</Text>
        </div>
        <Space wrap className="workbench-module-actions">
          <Button icon={<DatabaseOutlined />} onClick={() => navigate('/knowledge-assets')}>知识资产库</Button>
          <Button type="primary" icon={<SendOutlined />} loading={generating} onClick={generateDraft}>
            生成草稿
          </Button>
        </Space>
        <div className="workbench-module-steps" aria-label="AI 产品经理工作步骤">
          <span><strong>01</strong> 需求澄清</span>
          <span><strong>02</strong> 证据检索</span>
          <span><strong>03</strong> 方案假设</span>
          <span><strong>04</strong> 人工复核</span>
        </div>
      </section>

      <div className="ai-product-manager-grid">
        <Card className="consulting-table-card" title={<Space><BulbOutlined />需求输入</Space>}>
          <Form
            form={form}
            layout="vertical"
            initialValues={{
              demand: '我们是一家工程咨询公司，想做招投标相关优化。',
              company_profile: '公司有历史投标文件、人员资质、项目业绩和模板资料，希望先内部提效。',
              constraints: '先内部使用，不追求全自动，需要人工复核。',
            }}
          >
            <Form.Item label="需求" name="demand" rules={[{ required: true, message: '请输入需求' }]}>
              <Input.TextArea rows={4} placeholder="例如：我们需要招投标相关优化，先内部使用" />
            </Form.Item>
            <Form.Item label="公司背景" name="company_profile">
              <Input.TextArea rows={4} placeholder="行业、规模、已有资料、当前业务流程" />
            </Form.Item>
            <Form.Item label="约束条件" name="constraints">
              <Input.TextArea rows={3} placeholder="预算、周期、人工复核、数据权限、交付方式" />
            </Form.Item>
            <Form.Item label="已确认信息" name="confirmed_context">
              <Input.TextArea rows={3} placeholder="每行一条，例如：已有人员资质表、已有投标模板" />
            </Form.Item>
            <Space wrap>
              <Button type="primary" icon={<SendOutlined />} loading={generating} onClick={generateDraft}>
                生成草稿
              </Button>
              <Button onClick={() => form.resetFields()} disabled={generating}>重置样例</Button>
            </Space>
          </Form>
        </Card>

        <div className="ai-product-manager-result">
          {draft ? (
            <>
              <Card
                className="consulting-table-card"
                title={<Space><ProfileOutlined />方案草稿</Space>}
                extra={
                  <Space>
                    <Tag color={draft.model_used ? 'green' : 'gold'}>
                      {draft.model_used ? '模型生成' : '规则草稿'}
                    </Tag>
                    {draft.fallback_used ? <Tag color="orange">兜底</Tag> : null}
                  </Space>
                }
              >
                <Paragraph>{draft.demand_understanding}</Paragraph>
                <div className="pm-section-grid">
                  <section>
                    <Text type="secondary">证据摘要</Text>
                    <List
                      size="small"
                      dataSource={draft.evidence_summary}
                      renderItem={item => <List.Item>{item}</List.Item>}
                    />
                  </section>
                  <section>
                    <Text type="secondary">继续追问</Text>
                    <List
                      size="small"
                      dataSource={draft.missing_questions}
                      renderItem={item => <List.Item>{item}</List.Item>}
                    />
                  </section>
                  <section>
                    <Text type="secondary">人工确认</Text>
                    <List
                      size="small"
                      dataSource={draft.human_confirmation_points}
                      renderItem={item => <List.Item>{item}</List.Item>}
                    />
                  </section>
                  <section>
                    <Text type="secondary">下一步工作流</Text>
                    <List
                      size="small"
                      dataSource={draft.next_workflow}
                      renderItem={item => <List.Item>{item}</List.Item>}
                    />
                  </section>
                </div>
              </Card>

              <Card className="consulting-table-card" title={<Space><BulbOutlined />方案假设</Space>}>
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  {draft.solution_hypotheses.map((item, index) => (
                    <div className="pm-hypothesis-card" key={`${item.name || 'hypothesis'}-${index}`}>
                      <Space wrap>
                        <Tag color="processing">方向 {index + 1}</Tag>
                        <Text strong>{item.name || '方案假设'}</Text>
                      </Space>
                      <Paragraph>{item.why_it_may_work || '待补充证据说明'}</Paragraph>
                      <div className="pm-hypothesis-columns">
                        <section>
                          <Text type="secondary">所需数据</Text>
                          <List size="small" dataSource={item.required_data || []} renderItem={row => <List.Item>{row}</List.Item>} />
                        </section>
                        <section>
                          <Text type="secondary">建议流程</Text>
                          <List size="small" dataSource={item.suggested_workflow || []} renderItem={row => <List.Item>{row}</List.Item>} />
                        </section>
                      </div>
                    </div>
                  ))}
                </Space>
              </Card>

              <Card className="consulting-table-card" title={<Space><FileSearchOutlined />引用资产</Space>}>
                {draft.cited_assets.length ? (
                  <div className="pm-evidence-list">
                    {draft.cited_assets.map(item => (
                      <button type="button" key={item.asset.id} onClick={() => navigate(`/knowledge-assets/${item.asset.id}`)}>
                        <div>
                          <Space wrap>
                            <Text strong>{item.asset.title}</Text>
                            <Tag>{sourceTypeLabel[item.asset.source_type] || item.asset.source_type}</Tag>
                          </Space>
                          <Text type="secondary">{item.match_reason}</Text>
                        </div>
                        <Progress
                          type="circle"
                          percent={Math.round(item.match_score || 0)}
                          size={52}
                          strokeColor={item.match_score >= 70 ? '#389e0d' : '#d48806'}
                        />
                        <div className="pm-evidence-tags">
                          {renderTags(item.asset.industry_tags, 'blue')}
                          {renderTags(item.asset.business_topic_tags, 'geekblue')}
                          {renderTags(item.asset.evidence_type_tags, 'gold')}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无匹配资产" />
                )}
              </Card>
            </>
          ) : (
            <Card className="consulting-table-card pm-empty-state">
              <AuditOutlined />
              <Text type="secondary">输入需求后生成第一版证据化方案草稿</Text>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default AIProductManagerPage;
