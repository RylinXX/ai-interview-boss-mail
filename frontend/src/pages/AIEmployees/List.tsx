import React, { useMemo, useState } from 'react';
import { App, Button, Card, Col, Form, Input, Row, Space, Tag, Typography } from 'antd';
import {
  ArrowRightOutlined,
  AuditOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import request, { getApiErrorMessage } from '../../utils/request';
import '../BusinessWorkbench.css';

const { Title, Text, Paragraph } = Typography;

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type AIEmployeeChatForm = {
  requirement: string;
  company_profile?: string;
  project_materials?: string;
};

type SolutionDirection = {
  name?: string;
  scenario?: string;
  value?: string;
  related_cases?: string[];
  implementation_steps?: string[];
};

type DynamicWorker = {
  name?: string;
  responsibility?: string;
  human_review?: string;
};

type RetrievedEvidence = {
  project_name?: string;
  company?: string;
  role?: string;
  candidate_name?: string;
  solution?: string;
  summary?: string;
  capabilities?: string[];
  score?: number;
};

type AIEmployeeChatResponse = {
  assistant_message: string;
  solution: {
    title?: string;
    summary?: string;
    recommended_solutions?: SolutionDirection[];
    needed_capabilities?: string[];
    risks?: string[];
    next_questions?: string[];
    knowledge_context?: {
      project_count?: number;
      work_count?: number;
      candidate_count?: number;
    };
    dynamic_workers?: DynamicWorker[];
  };
  retrieved_evidence: RetrievedEvidence[];
  dynamic_workers: DynamicWorker[];
  human_decision_points: string[];
  model_used: boolean;
  fallback_used: boolean;
};

const splitToList = (value?: string) => {
  return (value || '')
    .split(/[\n。；;,，]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 6);
};

const AIEmployeesList: React.FC = () => {
  const { message: toast } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm<AIEmployeeChatForm>();
  const [submitting, setSubmitting] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatResult, setChatResult] = useState<AIEmployeeChatResponse | null>(null);
  const [lastInput, setLastInput] = useState<AIEmployeeChatForm | null>(null);

  const solutionDirections = useMemo(
    () => chatResult?.solution?.recommended_solutions || [],
    [chatResult]
  );
  const dynamicWorkers = chatResult?.dynamic_workers || chatResult?.solution?.dynamic_workers || [];
  const context = chatResult?.solution?.knowledge_context || {};

  const submitChat = async (values: AIEmployeeChatForm) => {
    const userMessage: ChatMessage = {
      role: 'user',
      content: values.requirement,
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setSubmitting(true);
    setLastInput(values);
    try {
      const result = await request.post('/ai-employees/chat', {
        ...values,
        messages: nextMessages,
      }, { timeout: 60000 });
      setChatResult(result as AIEmployeeChatResponse);
      setMessages([...nextMessages, { role: 'assistant', content: result.assistant_message }]);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'AI 员工分析失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const createCustomerProject = async () => {
    if (!chatResult || !lastInput) {
      return;
    }
    setCreatingProject(true);
    try {
      const goals = solutionDirections.length
        ? solutionDirections.map(item => item.name || item.value || '方案方向').slice(0, 4)
        : splitToList(chatResult.solution.summary);
      const project = await request.post('/customer-projects/from-agent-solution', {
        industry: '客户业务优化',
        business_type: chatResult.solution.title || 'AI 员工解决方案',
        current_process: lastInput.project_materials || lastInput.company_profile || lastInput.requirement,
        pain_points: splitToList(lastInput.requirement),
        goals,
        solution: chatResult.solution,
      });
      toast.success('已生成客户项目与方案文档');
      navigate(`/customer-projects/${project.id}`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, '生成客户项目失败'));
    } finally {
      setCreatingProject(false);
    }
  };

  return (
    <div className="ai-employees-page workbench-page">
      <section className="consulting-hero employee-hero ai-chat-hero">
        <div className="consulting-hero-copy">
          <span className="dossier-code">AI Product Manager</span>
          <Title level={1}>AI 员工解决方案工作台</Title>
          <Text>
            输入客户真实需求，系统会基于已上传的简历、项目经验和能力样本检索证据，先生成解决方案，再动态定义本次交付需要的 AI 员工和人工决策点。
          </Text>
        </div>
        <Space className="consulting-hero-actions">
          <Button icon={<FileTextOutlined />} onClick={() => navigate('/customer-projects')}>
            客户项目
          </Button>
          <Button type="primary" icon={<ArrowRightOutlined />} onClick={() => navigate('/resumes')}>
            能力样本库
          </Button>
        </Space>
      </section>

      <div className="consulting-metric-grid employee-metric-grid">
        <Card className="consulting-metric-card">
          <span className="metric-icon"><RobotOutlined /></span>
          <Text type="secondary">阶段一</Text>
          <strong>方案</strong>
          <span>聊天、检索、分析、输出客户解决方案</span>
        </Card>
        <Card className="consulting-metric-card">
          <span className="metric-icon"><DatabaseOutlined /></span>
          <Text type="secondary">数据依据</Text>
          <strong>{context.candidate_count ?? '-'}</strong>
          <span>来自已上传的人才经历和项目样本</span>
        </Card>
        <Card className="consulting-metric-card">
          <span className="metric-icon"><AuditOutlined /></span>
          <Text type="secondary">阶段二</Text>
          <strong>执行</strong>
          <span>按方案动态生成 AI 员工和任务入口</span>
        </Card>
        <Card className="consulting-metric-card">
          <span className="metric-icon"><SafetyCertificateOutlined /></span>
          <Text type="secondary">人工介入</Text>
          <strong>30%</strong>
          <span>关键判断、客户承诺、最终交付由人工确认</span>
        </Card>
      </div>

      <Row gutter={[16, 16]} className="ai-employee-workbench">
        <Col xs={24} xl={14}>
          <Card
            className="agent-chat-card ai-chat-card"
            title={
              <Space>
                <RobotOutlined />
                <span>AI 员工对话</span>
              </Space>
            }
          >
            <Form
              form={form}
              layout="vertical"
              onFinish={submitChat}
              initialValues={{
                requirement: '客户要做处置方案治理方案，官方有模板，需要自动填写公司资质和项目基础信息。',
                company_profile: '公司具备多项施工、治理或服务资质，需要把资质、人员、项目履历统一沉淀成可复用资料库。',
                project_materials: '已有项目名称、地址、负责人、治理范围、预算信息和部分官方模板，希望先生成一份可交付方案。',
              }}
            >
              <Form.Item
                name="requirement"
                label="客户需求"
                rules={[{ required: true, message: '请输入客户需求' }]}
              >
                <Input.TextArea rows={4} placeholder="描述客户现在要解决的问题、目标交付物和约束" />
              </Form.Item>
              <Form.Item name="company_profile" label="公司资料">
                <Input.TextArea rows={3} placeholder="客户公司资质、业务背景、产品或服务情况" />
              </Form.Item>
              <Form.Item name="project_materials" label="项目资料 / 模板资料">
                <Input.TextArea rows={3} placeholder="项目基础信息、已有模板、历史材料、数据口径" />
              </Form.Item>
              <Space wrap>
                <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={submitting}>
                  让 AI 员工分析
                </Button>
                <Button onClick={() => form.resetFields()} disabled={submitting}>
                  重置样例
                </Button>
              </Space>
            </Form>

            <div className="ai-chat-thread">
              <div className="ai-chat-message ai-chat-message-assistant">
                <RobotOutlined />
                <div>
                  <Text strong>AI 员工</Text>
                  <Paragraph>
                    我会先检索你上传的候选人经历、项目案例和能力样本，把它们转成客户方案依据。当前 MVP 会先输出方案、动态 AI 员工和人工审核点。
                  </Paragraph>
                </div>
              </div>
              {messages.map((item, index) => (
                <div className={`ai-chat-message ai-chat-message-${item.role}`} key={`${item.role}-${index}`}>
                  {item.role === 'assistant' ? <RobotOutlined /> : <AuditOutlined />}
                  <div>
                    <Text strong>{item.role === 'assistant' ? 'AI 员工' : '你'}</Text>
                    <Paragraph>{item.content}</Paragraph>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </Col>

        <Col xs={24} xl={10}>
          <div className="ai-side-stack">
            <Card className="agent-knowledge-card ai-side-card" title="检索到的能力依据">
              {chatResult ? (
                <>
                  <div className="ai-context-counts">
                    <span><strong>{context.project_count || 0}</strong>项目经验</span>
                    <span><strong>{context.work_count || 0}</strong>公司经历</span>
                    <span><strong>{context.candidate_count || 0}</strong>候选人样本</span>
                  </div>
                  <div className="ai-evidence-list">
                    {(chatResult.retrieved_evidence || []).slice(0, 5).map((item, index) => (
                      <section key={`${item.project_name || item.company}-${index}`}>
                        <Text strong>{item.project_name || item.company || `能力样本 ${index + 1}`}</Text>
                        <Paragraph>
                          {item.solution || item.summary || item.capabilities?.join('、') || '已命中客户需求相关能力。'}
                        </Paragraph>
                        <Tag>{item.role || item.candidate_name || '经验依据'}</Tag>
                      </section>
                    ))}
                  </div>
                </>
              ) : (
                <Text type="secondary">提交一次客户需求后，这里会展示系统从上传数据里检索到的项目和公司经验。</Text>
              )}
            </Card>

            <Card className="agent-solution-card ai-side-card" title="动态 AI 员工">
              {dynamicWorkers.length ? (
                <div className="ai-worker-list">
                  {dynamicWorkers.map((worker, index) => (
                    <section key={`${worker.name}-${index}`}>
                      <span className="employee-role-badge"><RobotOutlined /></span>
                      <div>
                        <Text strong>{worker.name || `AI 执行员工 ${index + 1}`}</Text>
                        <Paragraph>{worker.responsibility || '根据方案承担具体执行任务。'}</Paragraph>
                        <Tag color="gold">{worker.human_review || '人工审核关键结论'}</Tag>
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <Text type="secondary">AI 员工不会被预先固定，系统会按客户需求动态生成模板解析、资料抽取、增长策略等执行角色。</Text>
              )}
            </Card>
          </div>
        </Col>
      </Row>

      {chatResult && (
        <Card className="ai-solution-panel" title="客户解决方案草案">
          <div className="ai-solution-head">
            <div>
              <Tag color={chatResult.model_used ? 'green' : 'orange'}>
                {chatResult.model_used ? '已接入大语言模型' : '规则兜底生成'}
              </Tag>
              <Title level={3}>{chatResult.solution.title || 'AI 员工解决方案'}</Title>
              <Paragraph>{chatResult.solution.summary}</Paragraph>
            </div>
            <Button
              type="primary"
              icon={<FileTextOutlined />}
              loading={creatingProject}
              onClick={createCustomerProject}
            >
              生成客户案卷
            </Button>
          </div>

          <Row gutter={[16, 16]}>
            {solutionDirections.map((item, index) => (
              <Col xs={24} lg={12} key={`${item.name}-${index}`}>
                <section className="ai-solution-direction">
                  <Text strong>{index + 1}. {item.name || '方案方向'}</Text>
                  <Paragraph>{item.scenario}</Paragraph>
                  <div className="ai-solution-value">{item.value}</div>
                  <div className="formal-tag-row">
                    {(item.related_cases || []).map(caseName => (
                      <Tag key={caseName}>{caseName}</Tag>
                    ))}
                  </div>
                  <ol>
                    {(item.implementation_steps || []).map(step => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </section>
              </Col>
            ))}
          </Row>

          <div className="human-decision-list">
            <Text strong>人工决策点</Text>
            <ul>
              {(chatResult.human_decision_points || []).map(point => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
        </Card>
      )}
    </div>
  );
};

export default AIEmployeesList;
