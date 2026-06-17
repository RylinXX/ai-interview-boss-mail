import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Col, Form, Input, Progress, Row, Space, Steps, Tag, Typography } from 'antd';
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

const cleanNumberedText = (value: string) => value.replace(/^\s*(?:[-*]\s*)?(?:\d+\s*[.、)]|[（(]\s*\d+\s*[）)]|[一二三四五六七八九十]+[、.])\s*/, '').trim();

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type AIEmployeeChatForm = {
  requirement: string;
  company_profile?: string;
  project_materials?: string;
  constraints?: string;
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
  id?: string;
  citation_id?: string;
  title?: string;
  source_type?: string;
  source_name?: string;
  source_locator?: string;
  source_excerpt?: string;
  compressed_context?: string;
  source_payload?: {
    citation_id?: string;
    source_name?: string;
    source_locator?: string;
    excerpt?: string;
    chunk_index?: number;
    chunk_total?: number;
  };
  match_score?: number;
  match_reason?: string;
  business_topic_tags?: string[];
  evidence_type_tags?: string[];
  project_name?: string;
  company?: string;
  role?: string;
  candidate_name?: string;
  solution?: string;
  summary?: string;
  capabilities?: string[];
  score?: number;
};

type AgentTraceItem = {
  stage: string;
  agent_role?: string;
  status: string;
  summary: string;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
};

type EvidenceCoverage = {
  score?: number;
  level?: string;
  covered?: string[];
  missing?: string[];
  requires_more_evidence?: boolean;
};

type RetrievalLog = {
  retrieval_mode?: string;
  returned_count?: number;
  context_compression?: {
    total_chars?: number;
  };
  route_counts?: Record<string, number>;
  rrf?: Record<string, unknown>;
  rerank?: Record<string, unknown>;
  [key: string]: unknown;
};

type AIEmployeeChatResponse = {
  conversation_id?: string;
  run_id?: string;
  assistant_message: string;
  solution: {
    title?: string;
    summary?: string;
    recommended_solutions?: SolutionDirection[];
    needed_capabilities?: string[];
    risks?: string[];
    next_questions?: string[];
    knowledge_context?: {
      asset_count?: number;
    };
    dynamic_workers?: DynamicWorker[];
  };
  retrieved_evidence: RetrievedEvidence[];
  dynamic_workers: DynamicWorker[];
  human_decision_points: string[];
  evidence_self_check?: {
    status?: string;
    total_solution_count?: number;
    cited_solution_count?: number;
    uncited_solution_count?: number;
  };
  unsupported_claims?: Array<{
    name?: string;
    reason?: string;
    scenario?: string;
    value?: string;
  }>;
  agent_trace?: AgentTraceItem[];
  crew_trace?: AgentTraceItem[];
  retrieval_log?: RetrievalLog;
  evidence_coverage?: EvidenceCoverage;
  clarifying_questions?: string[];
  next_actions?: string[];
  model_used: boolean;
  fallback_used: boolean;
};

type ConversationSummary = {
  id: string;
  title: string;
  message_count?: number;
  last_active_at?: string;
};

type ConversationMessage = {
  role: ChatRole;
  content: string;
  run_id?: string | null;
};

type ConversationMessagesResponse = {
  items?: ConversationMessage[];
};

type SolutionAgentRunResponse = {
  response_payload?: AIEmployeeChatResponse;
};

const splitToList = (value?: string) => {
  return (value || '')
    .split(/[\n。；;,，]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 6);
};

const agentStageLabel: Record<string, string> = {
  understand_requirement: '理解需求',
  retrieve_evidence: '检索证据',
  assess_coverage: '评估覆盖',
  generate_solution: '生成方案',
  assign_dynamic_workers: '拆解员工',
};

const agentRoleLabel: Record<string, string> = {
  requirement_analyst: '需求分析 Agent',
  evidence_researcher: '证据检索 Agent',
  evidence_critic: '证据批评 Agent',
  solution_writer: '方案撰写 Agent',
  delivery_task_designer: '交付拆解 Agent',
};

const agentStepStatus = (status: string): 'wait' | 'process' | 'finish' | 'error' => {
  if (status === 'completed') return 'finish';
  if (status === 'blocked') return 'error';
  if (status === 'skipped') return 'wait';
  return 'process';
};

const coverageColor = (level?: string) => {
  if (level === 'strong') return '#389e0d';
  if (level === 'partial') return '#d48806';
  return '#cf1322';
};

const apiBaseUrl = import.meta.env.VITE_API_URL || '/api';

const streamSolutionAgent = async (
  payload: Record<string, unknown>,
  onTrace: (trace: AgentTraceItem) => void
) => {
  const token = localStorage.getItem('token');
  const response = await fetch(`${apiBaseUrl}/solution-agent/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Stream request failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult: AIEmployeeChatResponse | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';
    for (const rawEvent of events) {
      const lines = rawEvent.split('\n');
      const eventName = lines.find(line => line.startsWith('event:'))?.replace('event:', '').trim();
      const dataText = lines
        .filter(line => line.startsWith('data:'))
        .map(line => line.replace('data:', '').trim())
        .join('\n');
      if (!eventName || !dataText) continue;
      const data = JSON.parse(dataText);
      if (eventName === 'trace') {
        onTrace(data as AgentTraceItem);
      }
      if (eventName === 'done') {
        finalResult = data as AIEmployeeChatResponse;
      }
    }
  }

  if (!finalResult) {
    throw new Error('Stream finished without final result');
  }
  return finalResult;
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
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>();
  const [streamTrace, setStreamTrace] = useState<AgentTraceItem[]>([]);

  const solutionDirections = useMemo(
    () => chatResult?.solution?.recommended_solutions || [],
    [chatResult]
  );
  const dynamicWorkers = chatResult?.dynamic_workers || chatResult?.solution?.dynamic_workers || [];
  const context = chatResult?.solution?.knowledge_context || {};
  const coverage = chatResult?.evidence_coverage || {};
  const visibleTrace = chatResult?.crew_trace?.length ? chatResult.crew_trace : (streamTrace.length ? streamTrace : chatResult?.agent_trace || []);

  const fetchConversations = async () => {
    try {
      const result = await request.get('/solution-agent/conversations');
      setConversations((result.items || []) as ConversationSummary[]);
    } catch {
      setConversations([]);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, []);

  const startNewConversation = () => {
    setActiveConversationId(undefined);
    setMessages([]);
    setChatResult(null);
    setLastInput(null);
    setStreamTrace([]);
  };

  const openConversation = async (conversationId: string) => {
    try {
      const history = await request.get(`/solution-agent/conversations/${conversationId}/messages`) as ConversationMessagesResponse;
      const items = history.items || [];
      setActiveConversationId(conversationId);
      setMessages(items.map(item => ({ role: item.role, content: item.content })));
      const assistant = [...items].reverse().find(item => item.role === 'assistant' && item.run_id);
      if (assistant?.run_id) {
        const run = await request.get(`/solution-agent/runs/${assistant.run_id}`) as SolutionAgentRunResponse;
        if (run.response_payload) {
          setChatResult(run.response_payload);
        }
        setStreamTrace([]);
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, '加载对话失败'));
    }
  };

  const submitChat = async (values: AIEmployeeChatForm) => {
    const userMessage: ChatMessage = {
      role: 'user',
      content: values.requirement,
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setSubmitting(true);
    setLastInput(values);
    setChatResult(null);
    setStreamTrace([]);
    try {
      const result = await streamSolutionAgent({
        conversation_id: activeConversationId,
        requirement: values.requirement,
        company_profile: values.company_profile,
        project_materials: values.project_materials,
        constraints: values.constraints,
        confirmed_context: { messages: nextMessages },
        limit: 8,
      }, trace => {
        setStreamTrace(previous => [...previous, trace]);
      });
      setChatResult(result as AIEmployeeChatResponse);
      setActiveConversationId(result.conversation_id);
      setMessages([...nextMessages, { role: 'assistant', content: result.assistant_message }]);
      setStreamTrace([]);
      fetchConversations();
    } catch (error) {
      toast.error(getApiErrorMessage(error, '方案 Agent 分析失败'));
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
        business_type: chatResult.solution.title || '方案 Agent 解决方案',
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
          <span className="dossier-code">Solution Agent</span>
          <Title level={1}>方案 Agent</Title>
          <Text>
            输入客户真实需求，系统会从知识资产库检索报告、案例、样本和客户资料，生成带证据边界的方案，再拆出本次交付需要的 AI 执行员工和人工决策点。
          </Text>
        </div>
        <Space className="consulting-hero-actions">
          <Button icon={<FileTextOutlined />} onClick={() => navigate('/customer-projects')}>
            客户案卷
          </Button>
          <Button type="primary" icon={<ArrowRightOutlined />} onClick={() => navigate('/knowledge-assets/intake')}>
            资料入库
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
          <strong>{context.asset_count ?? '-'}</strong>
          <span>来自知识资产、外部资料和邮箱样本</span>
        </Card>
        <Card className="consulting-metric-card">
          <span className="metric-icon"><SafetyCertificateOutlined /></span>
          <Text type="secondary">证据覆盖</Text>
          <strong>{typeof coverage.score === 'number' ? `${coverage.score}%` : '-'}</strong>
          <span>{coverage.level === 'strong' ? '证据较完整' : coverage.level === 'partial' ? '可生成草案，需人工复核' : '先补资料再生成'}</span>
        </Card>
        <Card className="consulting-metric-card">
          <span className="metric-icon"><AuditOutlined /></span>
          <Text type="secondary">阶段二</Text>
          <strong>执行</strong>
          <span>按方案动态生成 AI 执行员工和任务入口</span>
        </Card>
      </div>

      <Row gutter={[16, 16]} className="ai-employee-workbench">
        <Col xs={24} xl={14}>
          <Card
            className="agent-chat-card ai-chat-card"
            title={
              <Space>
                <RobotOutlined />
                <span>方案 Agent 对话</span>
              </Space>
            }
          >
            <div className="agent-history-strip">
              <Space wrap>
                <Button size="small" type={!activeConversationId ? 'primary' : 'default'} onClick={startNewConversation}>
                  New
                </Button>
                {conversations.slice(0, 6).map(item => (
                  <Button
                    size="small"
                    key={item.id}
                    type={activeConversationId === item.id ? 'primary' : 'default'}
                    onClick={() => openConversation(item.id)}
                  >
                    {item.title || 'Conversation'}
                  </Button>
                ))}
              </Space>
            </div>

            <Form
              form={form}
              layout="vertical"
              onFinish={submitChat}
              initialValues={{
                requirement: '客户要做处置方案治理方案，官方有模板，需要自动填写公司资质和项目基础信息。',
                company_profile: '公司具备多项施工、治理或服务资质，需要把资质、人员、项目履历统一沉淀成可复用资料库。',
                project_materials: '已有项目名称、地址、负责人、治理范围、预算信息和部分官方模板，希望先生成一份可交付方案。',
                constraints: 'AI 只负责资料整理和方案初稿，关键事实、客户承诺和最终交付必须人工复核。',
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
              <Form.Item name="constraints" label="约束条件">
                <Input.TextArea rows={3} placeholder="数据权限、人工复核、交付周期、预算、不可承诺事项" />
              </Form.Item>
              <Space wrap>
                <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={submitting}>
                  让方案 Agent 分析
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
                  <Text strong>方案 Agent</Text>
                  <Paragraph>
                    我会先检索知识资产库，把外部资料、内部案例、邮箱样本和客户材料转成可引用证据，再输出方案、动态执行员工和人工审核点。
                  </Paragraph>
                </div>
              </div>
              {messages.map((item, index) => (
                <div className={`ai-chat-message ai-chat-message-${item.role}`} key={`${item.role}-${index}`}>
                  {item.role === 'assistant' ? <RobotOutlined /> : <AuditOutlined />}
                  <div>
                    <Text strong>{item.role === 'assistant' ? '方案 Agent' : '你'}</Text>
                    <Paragraph>{item.content}</Paragraph>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </Col>

        <Col xs={24} xl={10}>
          <div className="ai-side-stack">
            <Card className="agent-trace-card ai-side-card" title="Agent 运行链路">
              {visibleTrace.length ? (
                <Steps
                  direction="vertical"
                  size="small"
                  items={visibleTrace.map(item => ({
                    title: item.agent_role
                      ? `${agentRoleLabel[item.agent_role] || item.agent_role} · ${agentStageLabel[item.stage] || item.stage}`
                      : agentStageLabel[item.stage] || item.stage,
                    description: item.summary,
                    status: agentStepStatus(item.status),
                  }))}
                />
              ) : (
                <Text type="secondary">提交需求后，这里会显示理解、检索、评估、生成和拆解的执行轨迹。</Text>
              )}
            </Card>

            <Card className="agent-knowledge-card ai-side-card" title="检索到的证据资产">
              {chatResult ? (
                <>
                  <div className="ai-context-counts">
                    <span><strong>{context.asset_count || chatResult.retrieved_evidence?.length || 0}</strong>证据资产</span>
                    <span><strong>{chatResult.retrieved_evidence?.filter(item => item.source_type === 'company_case').length || 0}</strong>案例资料</span>
                    <span><strong>{chatResult.retrieved_evidence?.filter(item => item.source_type?.includes('document')).length || 0}</strong>报告资料</span>
                  </div>
                  <div className="ai-evidence-list">
                    {(chatResult.retrieved_evidence || []).slice(0, 5).map((item, index) => (
                      <section key={`${item.id || item.title || index}`}>
                        <Text strong>{item.title || item.project_name || item.company || `证据资产 ${index + 1}`}</Text>
                        <Paragraph>
                          {item.summary || item.solution || item.capabilities?.join('、') || item.match_reason || '已命中客户需求相关资料。'}
                        </Paragraph>
                        <Space wrap>
                          <Tag color="blue">{item.citation_id || item.source_payload?.citation_id || `K${index + 1}`}</Tag>
                          {(item.source_locator || item.source_payload?.source_locator) ? <Tag>{item.source_locator || item.source_payload?.source_locator}</Tag> : null}
                          <Tag>{item.source_name || item.source_type || item.role || item.candidate_name || '证据依据'}</Tag>
                          {typeof item.match_score === 'number' ? <Tag color="processing">{Math.round(item.match_score)} 分</Tag> : null}
                        </Space>
                      </section>
                    ))}
                  </div>
                </>
              ) : (
                <Text type="secondary">提交一次客户需求后，这里会展示系统从知识资产库检索到的证据资料。</Text>
              )}
            </Card>

            <Card className="agent-coverage-card ai-side-card" title="证据覆盖与缺口">
              {chatResult ? (
                <div className="agent-coverage-content">
                  <Progress
                    percent={coverage.score || 0}
                    strokeColor={coverageColor(coverage.level)}
                    status={coverage.level === 'insufficient' ? 'exception' : 'normal'}
                  />
                  <div className="agent-coverage-columns">
                    <section>
                      <Text type="secondary">已覆盖</Text>
                      <Space wrap>
                        {(coverage.covered || []).map(item => <Tag color="green" key={item}>{item}</Tag>)}
                      </Space>
                    </section>
                    <section>
                      <Text type="secondary">待补充</Text>
                      <Space wrap>
                        {(coverage.missing || []).map(item => <Tag color="orange" key={item}>{item}</Tag>)}
                      </Space>
                    </section>
                  </div>
                </div>
              ) : (
                <Text type="secondary">系统会根据资料命中、客户背景、项目材料和约束条件评估是否足够生成方案。</Text>
              )}
            </Card>

            <Card className="agent-self-check-card ai-side-card" title="Evidence self-check">
              {chatResult?.evidence_self_check ? (
                <div className="agent-self-check">
                  <Space wrap>
                    <Tag color={chatResult.evidence_self_check.status === 'passed' ? 'green' : 'orange'}>
                      {chatResult.evidence_self_check.status || 'needs_review'}
                    </Tag>
                    <Tag>{chatResult.evidence_self_check.cited_solution_count ?? 0} cited</Tag>
                    <Tag>{chatResult.evidence_self_check.uncited_solution_count ?? 0} uncited</Tag>
                  </Space>
                  {(chatResult.unsupported_claims || []).length ? (
                    <div className="unsupported-claim-list">
                      {(chatResult.unsupported_claims || []).map((claim, index) => (
                        <section key={`${claim.name || index}`}>
                          <Text strong>{claim.name || `Claim ${index + 1}`}</Text>
                          <Paragraph>{claim.reason || claim.value || claim.scenario}</Paragraph>
                        </section>
                      ))}
                    </div>
                  ) : (
                    <Text type="secondary">All solution directions are linked to retrieved evidence.</Text>
                  )}
                </div>
              ) : (
                <Text type="secondary">After generation, uncited solution claims will be listed here for review.</Text>
              )}
            </Card>

            <Card className="agent-retrieval-card ai-side-card" title="RAG retrieval log">
              {chatResult?.retrieval_log ? (
                <div className="agent-retrieval-log">
                  <Space wrap>
                    <Tag color="purple">{chatResult.retrieval_log.retrieval_mode || 'retrieval'}</Tag>
                    <Tag>returned {chatResult.retrieval_log.returned_count ?? 0}</Tag>
                    <Tag>compressed {chatResult.retrieval_log.context_compression?.total_chars ?? 0} chars</Tag>
                  </Space>
                  <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'auto', marginTop: 12 }}>
                    {JSON.stringify({
                      route_counts: chatResult.retrieval_log.route_counts,
                      rrf: chatResult.retrieval_log.rrf,
                      rerank: chatResult.retrieval_log.rerank,
                    }, null, 2)}
                  </pre>
                </div>
              ) : (
                <Text type="secondary">提交需求后，这里会显示检索模式、多路召回、RRF、rerank 和上下文压缩信息。</Text>
              )}
            </Card>

            <Card className="agent-solution-card ai-side-card" title="动态 AI 执行员工">
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
                <Text type="secondary">AI 执行员工不会被预先固定，系统会按客户需求动态生成资料解析、方案设计、交付拆解等执行角色。</Text>
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
              <Title level={3}>{chatResult.solution.title || '方案 Agent 解决方案'}</Title>
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
                    {(item.implementation_steps || []).map((step, stepIndex) => (
                      <li key={`${step}-${stepIndex}`}>{cleanNumberedText(step)}</li>
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

          <div className="agent-followup-grid">
            <section>
              <Text strong>继续追问</Text>
              <ul>
                {(chatResult.clarifying_questions || []).map(item => <li key={item}>{item}</li>)}
              </ul>
            </section>
            <section>
              <Text strong>下一步动作</Text>
              <ul>
                {(chatResult.next_actions || []).map(item => <li key={item}>{item}</li>)}
              </ul>
            </section>
          </div>
        </Card>
      )}
    </div>
  );
};

export default AIEmployeesList;
