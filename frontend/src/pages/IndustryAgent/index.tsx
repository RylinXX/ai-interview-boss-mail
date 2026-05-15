import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Card, Col, Empty, Form, Input, Row, Select, Space, Spin, Tag, Typography } from 'antd';
import {
  ApartmentOutlined,
  BulbOutlined,
  DownloadOutlined,
  FileTextOutlined,
  MessageOutlined,
  ProjectOutlined,
  SendOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import request, { getApiErrorMessage } from '../../utils/request';
import '../BusinessWorkbench.css';

const { Title, Text, Paragraph } = Typography;

type IndustryAgentData = {
  resume_count: number;
  industry_count: number;
  industries: any[];
};

type AgentSolution = {
  title: string;
  summary: string;
  recommended_solutions: any[];
  needed_capabilities: string[];
  risks: string[];
  next_questions: string[];
  knowledge_context: any;
};

type IndustryAgentFormValues = {
  industry?: string;
  business_type?: string;
  current_process?: string;
  pain_points?: string;
  goals?: string;
};

type AgentSolutionDraft = {
  id: string;
  status: 'processing' | 'completed' | 'failed';
  request_payload: Record<string, any>;
  result?: AgentSolution | null;
  error?: string | null;
  created_at: string;
  updated_at?: string | null;
  completed_at?: string | null;
};

const SOLUTION_GENERATION_TIMEOUT_MS = 120000;

const splitLines = (value?: string) => {
  return String(value || '')
    .split(/\n|,|，|;|；/)
    .map(item => item.trim())
    .filter(Boolean);
};

const safeFileName = (value: string) => value.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);

const draftPayloadToFormValues = (payload: Record<string, any> = {}): IndustryAgentFormValues => ({
  industry: payload.industry,
  business_type: payload.business_type,
  current_process: payload.current_process,
  pain_points: Array.isArray(payload.pain_points) ? payload.pain_points.join('\n') : payload.pain_points,
  goals: Array.isArray(payload.goals) ? payload.goals.join('\n') : payload.goals,
});

const IndustryAgent: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm<IndustryAgentFormValues>();
  const [data, setData] = useState<IndustryAgentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [restoringDraft, setRestoringDraft] = useState(false);
  const [draft, setDraft] = useState<AgentSolutionDraft | null>(null);
  const [solution, setSolution] = useState<AgentSolution | null>(null);

  const applyDraft = useCallback((nextDraft: AgentSolutionDraft | null, restoreForm = false) => {
    setDraft(nextDraft);
    if (!nextDraft) return;
    if (restoreForm) {
      form.setFieldsValue(draftPayloadToFormValues(nextDraft.request_payload));
    }
    if (nextDraft.result) {
      setSolution(nextDraft.result);
    }
  }, [form]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await request.get('/resumes/industry-agent');
        setData(response as IndustryAgentData);
      } catch (error) {
        message.error('获取业务优化方案智能体失败');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [message]);

  useEffect(() => {
    const fetchLatestDraft = async () => {
      setRestoringDraft(true);
      try {
        const latest = await request.get('/resumes/industry-agent/solution-drafts/latest') as AgentSolutionDraft | null;
        applyDraft(latest, true);
      } catch (error) {
        message.error(getApiErrorMessage(error, '恢复最近方案草稿失败'));
      } finally {
        setRestoringDraft(false);
      }
    };
    fetchLatestDraft();
  }, [applyDraft, message]);

  useEffect(() => {
    if (!draft || draft.status !== 'processing') return;
    const timer = window.setInterval(async () => {
      try {
        const nextDraft = await request.get(`/resumes/industry-agent/solution-drafts/${draft.id}`) as AgentSolutionDraft;
        applyDraft(nextDraft);
      } catch (error) {
        window.clearInterval(timer);
        message.error(getApiErrorMessage(error, '同步方案草稿状态失败'));
      }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [applyDraft, draft, message]);

  const industries = data?.industries || [];
  const selectedIndustry = Form.useWatch('industry', form);
  const currentIndustry = useMemo(() => {
    return industries.find(item => item.name === selectedIndustry || item.key === selectedIndustry) || industries[0];
  }, [industries, selectedIndustry]);

  useEffect(() => {
    if (!selectedIndustry && industries.length) {
      form.setFieldValue('industry', industries[0].name);
    }
  }, [form, industries, selectedIndustry]);

  const quickQuestions = [
    '你是做什么行业的？',
    '现在最核心的业务流程是哪几步？',
    '哪些环节最耗人、最容易错、最难沉淀？',
    '你想先做内部提效工具，还是对外销售的平台？',
  ];

  const generateSolution = async () => {
    const values = await form.validateFields();
    setGenerating(true);
    try {
      setSolution(null);
      const response = await request.post('/resumes/industry-agent/solution-drafts', {
        industry: values.industry,
        business_type: values.business_type,
        current_process: values.current_process,
        pain_points: splitLines(values.pain_points),
        goals: splitLines(values.goals),
        conversation: [
          {
            role: 'user',
            content: [
              values.business_type,
              values.current_process,
              values.pain_points,
              values.goals,
          ].filter(Boolean).join('\n'),
          },
        ],
      }, {
        timeout: SOLUTION_GENERATION_TIMEOUT_MS,
      }) as AgentSolutionDraft;
      applyDraft(response);
      if (response.result) {
        message.success('方案已生成并保存');
      } else {
        message.success('已开始后台生成，切换页面后会自动恢复');
      }
    } catch (error) {
      message.error(getApiErrorMessage(error, '生成方案失败'));
    } finally {
      setGenerating(false);
    }
  };

  const exportSolutionPdf = async () => {
    if (!solution) return;
    const element = document.getElementById('industry-solution-report-content');
    if (!element) return;

    const opt = {
      margin: [14, 14, 14, 14],
      filename: `${safeFileName(solution.title || '业务优化方案')}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    } as any;

    try {
      // @ts-ignore html2pdf does not ship TypeScript declarations.
      const { default: html2pdf } = await import('html2pdf.js');
      await html2pdf().from(element).set(opt).save();
      message.success('导出 PDF 成功');
    } catch (error) {
      message.error('导出 PDF 失败');
    }
  };

  const createProjectFromSolution = async () => {
    if (!solution) return;
    const values = await form.validateFields();
    setCreatingProject(true);
    try {
      const project = await request.post('/customer-projects/from-agent-solution', {
        industry: values.industry,
        business_type: values.business_type,
        current_process: values.current_process,
        pain_points: splitLines(values.pain_points),
        goals: splitLines(values.goals),
        solution,
      });
      message.success('客户项目案卷已生成，诊断与任务板已同步创建');
      navigate(`/customer-projects/${project.id}`);
    } catch (error) {
      message.error(getApiErrorMessage(error, '生成客户项目案卷失败'));
    } finally {
      setCreatingProject(false);
    }
  };

  const isDraftProcessing = draft?.status === 'processing';
  const isGeneratingSolution = generating || isDraftProcessing;

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '70vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="industry-agent-page agent-workspace-page workbench-page">
      <section className="consulting-hero">
        <div className="consulting-hero-copy">
          <span className="dossier-code">Solution Agent</span>
          <Title level={1}>业务优化方案智能体</Title>
          <Text>把高级人才样本中的项目、公司经历和能力标签作为知识库，补充客户业务信息后生成可落地方案。</Text>
        </div>
        <Space className="consulting-hero-actions">
          <Button type="primary" icon={<SendOutlined />} loading={isGeneratingSolution} onClick={generateSolution}>
            {isDraftProcessing ? '后台生成中' : '生成方案'}
          </Button>
        </Space>
      </section>

      <Row gutter={[16, 16]} className="agent-builder-row">
        <Col span={15}>
          <Card className="agent-chat-card consulting-table-card" title="方案输入">
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                industry: currentIndustry?.name,
                business_type: '工程管理',
                current_process: '项目现场靠人工登记车辆和材料，投标文件靠人工复制模板。',
                pain_points: '车辆进出难追踪\n招投标文件制作慢',
                goals: '车辆识别管理平台\n招投标文件制作平台',
              }}
            >
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item label="行业方向" name="industry" rules={[{ required: true, message: '请选择行业方向' }]}>
                    <Select
                      options={industries.map(industry => ({ label: industry.name, value: industry.name }))}
                      popupMatchSelectWidth={false}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="业务类型" name="business_type" rules={[{ required: true, message: '请输入业务类型' }]}>
                    <Input placeholder="例如：工程管理、银行服务、旅游运营" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item label="当前业务流程" name="current_process" rules={[{ required: true, message: '请描述当前流程' }]}>
                <Input.TextArea rows={3} placeholder="描述现在业务从输入到交付的关键步骤" />
              </Form.Item>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item label="主要痛点" name="pain_points" rules={[{ required: true, message: '请至少写一个痛点' }]}>
                    <Input.TextArea rows={3} placeholder="每行一个痛点，例如：车辆进出难追踪" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="想生成的方向" name="goals">
                    <Input.TextArea rows={3} placeholder="每行一个方向，例如：招投标文件制作平台" />
                  </Form.Item>
                </Col>
              </Row>
              <div className="agent-form-actions">
                <div className="agent-question-strip">
                  {quickQuestions.map(item => (
                    <Tag icon={<MessageOutlined />} key={item}>{item}</Tag>
                  ))}
                </div>
                <Button icon={<SendOutlined />} loading={isGeneratingSolution} onClick={generateSolution}>
                  {isDraftProcessing ? '后台生成中' : '生成方案'}
                </Button>
              </div>
            </Form>
          </Card>
        </Col>

        <Col span={9}>
          <Card className="agent-knowledge-card consulting-table-card" title="知识库上下文">
            <Space orientation="vertical" size={16} style={{ width: '100%' }}>
              <div className="agent-kpi-grid">
                <div>
                  <TeamOutlined />
                  <strong>{data?.resume_count || 0}</strong>
                  <span>人才</span>
                </div>
                <div>
                  <ApartmentOutlined />
                  <strong>{data?.industry_count || 0}</strong>
                  <span>行业</span>
                </div>
                <div>
                  <ProjectOutlined />
                  <strong>{industries.reduce((sum, item) => sum + item.project_count, 0)}</strong>
                  <span>项目</span>
                </div>
              </div>

              <Select
                value={currentIndustry?.name}
                onChange={(value) => form.setFieldValue('industry', value)}
                options={industries.map(industry => ({
                  label: `${industry.name}（${industry.project_count} 项目 / ${industry.candidate_count} 人）`,
                  value: industry.name,
                }))}
                popupMatchSelectWidth={false}
                style={{ width: '100%' }}
              />

              {currentIndustry ? (
                <div className="agent-context-panel">
                  <Text type="secondary">方案方向</Text>
                  <Paragraph>{currentIndustry.offer_template}</Paragraph>
                  <div className="project-tag-row">
                    {(currentIndustry.solution_focus || []).map((item: string) => <Tag color="processing" key={item}>{item}</Tag>)}
                  </div>
                  <Text type="secondary">可引用经验</Text>
                  <Space orientation="vertical" size={8}>
                    {(currentIndustry.project_cases || []).slice(0, 4).map((item: any) => (
                      <div className="agent-case-line" key={`${item.resume_id}-${item.project_name}`}>
                        <Text strong>{item.project_name || '未命名项目'}</Text>
                        <Text type="secondary">{item.candidate_name || '未识别'} · {item.solution || item.business_model || '待沉淀方案'}</Text>
                      </div>
                    ))}
                  </Space>
                </div>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无知识库数据" />
              )}
            </Space>
          </Card>
        </Col>
      </Row>

      <Card
        className="agent-solution-card consulting-table-card"
        title={
          <Space>
            <FileTextOutlined />
            <span>方案报告</span>
          </Space>
        }
        extra={
          solution ? (
            <Space>
              <Button
                icon={<ProjectOutlined />}
                loading={creatingProject}
                onClick={createProjectFromSolution}
              >
                生成客户案卷
              </Button>
              <Button icon={<DownloadOutlined />} onClick={exportSolutionPdf}>
                导出 PDF
              </Button>
            </Space>
          ) : null
        }
      >
        {solution ? (
          <div className="agent-report-content" id="industry-solution-report-content">
            <div className="agent-report-header">
              <Text type="secondary">行业智能体方案</Text>
              <Title level={3}>{solution.title}</Title>
              <Paragraph>{solution.summary}</Paragraph>
              <div className="agent-report-metrics">
                <span>引用项目 {solution.knowledge_context?.project_count || 0}</span>
                <span>公司经历 {solution.knowledge_context?.work_count || 0}</span>
                <span>人才样本 {solution.knowledge_context?.candidate_count || 0}</span>
              </div>
            </div>

            <div className="agent-report-section">
              <Title level={4}>推荐方案</Title>
              <div className="agent-solution-list">
                {(solution.recommended_solutions || []).map((item, index) => (
                  <section className="agent-solution-item" key={`${item.name}-${index}`}>
                    <div className="agent-solution-index">{index + 1}</div>
                    <div>
                      <Title level={5}>{item.name || `方案 ${index + 1}`}</Title>
                      <Paragraph><Text type="secondary">应用场景：</Text>{item.scenario || '待补充'}</Paragraph>
                      <Paragraph><Text type="secondary">业务价值：</Text>{item.value || '待补充'}</Paragraph>
                      {(item.related_cases || []).length > 0 && (
                        <div className="project-tag-row">
                          {(item.related_cases || []).map((caseName: string) => <Tag color="blue" key={caseName}>{caseName}</Tag>)}
                        </div>
                      )}
                      {Array.isArray(item.implementation_steps) && item.implementation_steps.length > 0 && (
                        <ol className="agent-step-list">
                          {item.implementation_steps.map((step: string) => <li key={step}>{step}</li>)}
                        </ol>
                      )}
                    </div>
                  </section>
                ))}
              </div>
            </div>

            <div className="agent-report-grid">
              <div className="agent-report-section">
                <Title level={4}>风险与前提</Title>
                <Space orientation="vertical" size={8}>
                  {(solution.risks || []).map(item => <Text key={item}>• {item}</Text>)}
                  {(!solution.risks || solution.risks.length === 0) && <Text type="secondary">暂无明确风险。</Text>}
                </Space>
              </div>
              <div className="agent-report-section">
                <Title level={4}>客户沟通引导</Title>
                <Space orientation="vertical" size={8}>
                  {(solution.next_questions || []).map(item => <Text key={item}><BulbOutlined /> {item}</Text>)}
                  {(!solution.next_questions || solution.next_questions.length === 0) && <Text type="secondary">暂无补充问题。</Text>}
                </Space>
              </div>
            </div>

            {(solution.needed_capabilities || []).length > 0 && (
              <div className="agent-report-section">
                <Title level={4}>交付能力参考</Title>
                <div className="project-tag-row">
                  {(solution.needed_capabilities || []).map(item => <Tag color="success" key={item}>{item}</Tag>)}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="agent-solution-empty">
            {restoringDraft ? (
              <Space orientation="vertical" align="center" size={12}>
                <Spin />
                <Text type="secondary">正在恢复最近一次方案草稿</Text>
              </Space>
            ) : draft?.status === 'processing' ? (
              <Space orientation="vertical" align="center" size={12}>
                <Spin />
                <Text strong>方案正在后台生成</Text>
                <Text type="secondary">可以切换到其他入口，回来后会自动读取这条草稿。</Text>
              </Space>
            ) : draft?.status === 'failed' ? (
              <Alert
                type="error"
                showIcon
                message="方案生成失败"
                description={draft.error || '请检查模型配置或稍后重新生成。'}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="补充业务信息后生成可导出的方案报告" />
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default IndustryAgent;
