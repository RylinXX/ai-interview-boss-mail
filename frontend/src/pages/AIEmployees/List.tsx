import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Col, Drawer, Form, Input, Modal, Popconfirm, Row, Select, Space, Tag, Typography } from 'antd';
import {
  AppstoreOutlined,
  AuditOutlined,
  BookOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  ClearOutlined,
  CopyOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  ExportOutlined,
  FileTextOutlined,
  GlobalOutlined,
  LinkOutlined,
  PlusOutlined,
  ReadOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  SettingOutlined,
  SolutionOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import request, { getApiErrorMessage } from '../../utils/request';
import '../BusinessWorkbench.css';

const { Title, Text, Paragraph } = Typography;

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  id?: string;
  role: ChatRole;
  content: string;
  evidence?: RetrievedEvidence[];
  solution?: any;
};

type RetrievedEvidence = {
  id?: string;
  citation_id?: string;
  title?: string;
  source_type?: string;
  source_name?: string;
  source_locator?: string;
  source_excerpt?: string;
  match_score?: number;
  match_reason?: string;
  project_name?: string;
  company?: string;
  role?: string;
  candidate_name?: string;
  solution?: string;
  summary?: string;
  resume_id?: string;
  capabilities?: string[];
  score?: number;
};

type ConversationSummary = {
  id: string;
  title: string;
  message_count?: number;
  last_active_at?: string;
};

type AIEmployeeChatResponse = {
  conversation_id?: string;
  run_id?: string;
  assistant_message: string;
  solution: {
    title?: string;
    summary?: string;
    recommended_solutions?: Array<{
      name?: string;
      scenario?: string;
      value?: string;
    }>;
    needed_capabilities?: string[];
    risks?: string[];
    next_questions?: string[];
  };
  retrieved_evidence: RetrievedEvidence[];
  model_used: boolean;
  fallback_used: boolean;
};

const PRESET_SCENARIOS = [
  {
    icon: '🎓',
    title: '985/211专家打法分析',
    subtitle: '提取高学历与大厂履历专家的工程落地打法',
    prompt: '请分析数据库中 985/211 院校履历专家在 AI 与大数据中台项目的核心落地经验与技术线索。',
    tag: '人才履历',
  },
  {
    icon: '💼',
    title: '金融风控商业模式盘点',
    subtitle: '梳理金融领域的核心商业模式与真实强证据案例',
    prompt: '请盘点数据库里关于金融服务与风控领域的关键商业模式、落地案例及强证据知识资产。',
    tag: '商业打法',
  },
  {
    icon: '🚀',
    title: '零售私域与电商系统方案',
    subtitle: '基于已有知识资产输出可交付的系统方案',
    prompt: '针对零售企业私域流量增长与电商自动化需求，请基于现有知识资产输出可交付的系统方案。',
    tag: '系统交付',
  },
  {
    icon: '📊',
    title: '商业证据链缺口查验',
    subtitle: '检索已沉淀项目中缺失的证据与验证维度',
    prompt: '请查验当前已沉淀的项目经验打法中，存在哪些尚待补齐的结构化商业证据链缺口？',
    tag: '证据审查',
  },
];

const apiBaseUrl = import.meta.env.VITE_API_URL || '/api';

const streamSolutionAgent = async (
  payload: Record<string, unknown>,
  onTrace?: (trace: any) => void
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
      if (eventName === 'trace' && onTrace) {
        onTrace(data);
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

const AISolutionAssistantPage: React.FC = () => {
  const { message: toast } = App.useApp();
  const navigate = useNavigate();
  const [inputText, setInputText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>();
  const [searchScope, setSearchScope] = useState<string>('all');
  const [detailDrawerItem, setDetailDrawerItem] = useState<RetrievedEvidence | null>(null);
  const [lastSolution, setLastSolution] = useState<any>(null);

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

  const startNewChat = () => {
    setActiveConversationId(undefined);
    setMessages([]);
    setLastSolution(null);
    setInputText('');
    toast.success('已开启新一轮解决方案对话');
  };

  const openConversation = async (conversationId: string) => {
    try {
      const history = await request.get(`/solution-agent/conversations/${conversationId}/messages`) as any;
      const items = history.items || [];
      setActiveConversationId(conversationId);
      setMessages(items.map((item: any) => ({
        role: item.role,
        content: item.content,
      })));
      const assistant = [...items].reverse().find((item: any) => item.role === 'assistant' && item.run_id);
      if (assistant?.run_id) {
        const run = await request.get(`/solution-agent/runs/${assistant.run_id}`) as any;
        if (run.response_payload) {
          setLastSolution(run.response_payload.solution);
          const retrieved = run.response_payload.retrieved_evidence || [];
          if (items.length) {
            setMessages(previous => previous.map((msg, i) => i === previous.length - 1 && msg.role === 'assistant' ? { ...msg, evidence: retrieved } : msg));
          }
        }
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, '加载历史对话失败'));
    }
  };

  const deleteConversation = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await request.delete(`/solution-agent/conversations/${conversationId}`);
      toast.success('已删除历史对话');
      if (activeConversationId === conversationId) {
        startNewChat();
      }
      fetchConversations();
    } catch (error) {
      toast.error(getApiErrorMessage(error, '删除历史对话失败'));
    }
  };

  const handleSendPrompt = async (promptText: string) => {
    const textToSend = promptText.trim();
    if (!textToSend || submitting) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: textToSend,
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInputText('');
    setSubmitting(true);

    try {
      const result = await streamSolutionAgent({
        conversation_id: activeConversationId,
        requirement: textToSend,
        search_scope: searchScope,
        confirmed_context: { messages: nextMessages },
        limit: 8,
      });

      const retrieved = result.retrieved_evidence || [];
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: result.assistant_message,
        evidence: retrieved,
        solution: result.solution,
      };

      setMessages([...nextMessages, assistantMsg]);
      setLastSolution(result.solution);
      if (result.conversation_id) {
        setActiveConversationId(result.conversation_id);
      }
      fetchConversations();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'AI 解决方案助手回答失败，请稍后重试'));
    } finally {
      setSubmitting(false);
    }
  };

  const copyMessageText = (content: string) => {
    navigator.clipboard.writeText(content);
    toast.success('已复制回复文本到剪贴板');
  };

  const createCustomerProject = async () => {
    if (!lastSolution) {
      toast.warning('暂无生成的解决方案可转换为客户项目');
      return;
    }
    setCreatingProject(true);
    try {
      const project = await request.post('/customer-projects/from-agent-solution', {
        industry: '客户业务优化',
        business_type: lastSolution.title || 'AI 解决方案项目',
        current_process: lastSolution.summary || '基于 AI 解决方案助手生成',
        pain_points: lastSolution.risks || [],
        goals: lastSolution.needed_capabilities || [],
        solution: lastSolution,
      });
      toast.success('已成功转换为客户项目卷宗');
      navigate(`/customer-projects/${project.id}`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, '转换客户项目失败'));
    } finally {
      setCreatingProject(false);
    }
  };

  const scopeOptions = [
    {
      value: 'all',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px' }}>
          <GlobalOutlined style={{ color: '#1890ff' }} />
          全量知识与人才库
        </span>
      ),
    },
    {
      value: 'resumes_only',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px' }}>
          <ReadOutlined style={{ color: '#722ed1' }} />
          仅人才能力档案
        </span>
      ),
    },
    {
      value: 'cases_only',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px' }}>
          <SolutionOutlined style={{ color: '#52c41a' }} />
          仅案例打法与项目
        </span>
      ),
    },
    {
      value: 'assets_only',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px' }}>
          <FileTextOutlined style={{ color: '#fa8c16' }} />
          仅强证据知识资产
        </span>
      ),
    },
  ];

  return (
    <div
      className="ai-solution-assistant-page workbench-page"
      style={{
        height: 'calc(100vh - 72px)',
        display: 'flex',
        gap: 16,
        padding: '12px 16px',
        boxSizing: 'border-box',
      }}
    >
      {/* 左侧：历史对话与检索配置面板 */}
      <div
        style={{
          width: '260px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          flexShrink: 0,
        }}
      >
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={startNewChat}
          style={{ height: '40px', borderRadius: '8px', fontWeight: 600 }}
        >
          新建解决方案对话
        </Button>

        {/* 检索范围设置（精美图标样式） */}
        <Card size="small" style={{ borderRadius: '8px' }} title={<span style={{ fontSize: '12px' }}><SettingOutlined /> RAG 检索范围选择</span>}>
          <Select
            value={searchScope}
            onChange={setSearchScope}
            style={{ width: '100%' }}
            size="small"
            options={scopeOptions}
          />
        </Card>

        {/* 历史对话列表（含鼠标悬浮删除按键与确认框） */}
        <Card
          size="small"
          style={{ flex: 1, borderRadius: '8px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          styles={{ body: { flex: 1, overflowY: 'auto', padding: '8px' } }}
          title={<span style={{ fontSize: '12px' }}>💬 历史会话记录</span>}
        >
          {conversations.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {conversations.map((item) => (
                <div
                  key={item.id}
                  onClick={() => openConversation(item.id)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    background: activeConversationId === item.id ? 'rgba(24, 144, 255, 0.1)' : 'transparent',
                    border: activeConversationId === item.id ? '1px solid rgba(24, 144, 255, 0.3)' : '1px solid transparent',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text
                    ellipsis
                    style={{
                      fontSize: '12.5px',
                      color: activeConversationId === item.id ? '#1890ff' : 'var(--text-color, #333)',
                      fontWeight: activeConversationId === item.id ? 600 : 400,
                      flex: 1,
                    }}
                  >
                    {item.title || '新对话'}
                  </Text>

                  <Popconfirm
                    title="确认删除该历史对话吗？"
                    onConfirm={(e) => e && deleteConversation(item.id, e as any)}
                    okText="删除"
                    cancelText="取消"
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={<DeleteOutlined style={{ color: '#ff4d4f', fontSize: '12px' }} />}
                      onClick={(e) => e.stopPropagation()}
                      style={{ padding: '0 4px', height: '22px', marginLeft: 4 }}
                    />
                  </Popconfirm>
                </div>
              ))}
            </div>
          ) : (
            <Text type="secondary" style={{ fontSize: '11.5px', display: 'block', textAlign: 'center', marginTop: 20 }}>
              暂无历史对话
            </Text>
          )}
        </Card>
      </div>

      {/* 右侧：ChatGPT 风格沉浸式 Chat 工作台 */}
      <Card
        className="chat-main-card consulting-table-card"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.04)',
        }}
        styles={{
          body: {
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            padding: '16px 24px',
            overflow: 'hidden',
          },
        }}
      >
        {/* 顶部标头与方案转交付操作 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingBottom: '12px',
            borderBottom: '1px solid var(--border-color, #f0f0f0)',
          }}
        >
          <span style={{ fontSize: '15.5px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <RobotOutlined style={{ color: '#722ed1', fontSize: '18px' }} />
            {lastSolution?.title || 'AI 解决方案助手'}
          </span>
          <Space>
            {lastSolution && (
              <Button
                type="primary"
                size="small"
                icon={<ExportOutlined />}
                loading={creatingProject}
                onClick={createCustomerProject}
              >
                转换为客户项目卷宗
              </Button>
            )}
            {messages.length > 0 && (
              <Button icon={<ClearOutlined />} size="small" onClick={startNewChat}>
                清空对话
              </Button>
            )}
          </Space>
        </div>

        {/* 消息历史或居中极简初始问答条 */}
        {messages.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '0 10px',
            }}
          >
            <div style={{ fontSize: '38px', marginBottom: 6 }}>🤖</div>
            <Title level={4} style={{ marginBottom: 4 }}>我是您的 AI 解决方案助手</Title>
            <Text type="secondary" style={{ fontSize: '13px', marginBottom: 24 }}>
              输入您的业务诉求，智能体将调取人才库档案与知识资产，生成带线索依据的方案
            </Text>

            {/* 4 大场景预设卡片 */}
            <Row gutter={[12, 12]} style={{ width: '100%', maxWidth: '760px', marginBottom: 20 }}>
              {PRESET_SCENARIOS.map((item) => (
                <Col xs={24} sm={12} key={item.title}>
                  <div
                    className="preset-prompt-card"
                    onClick={() => handleSendPrompt(item.prompt)}
                    style={{
                      padding: '14px 16px',
                      background: 'var(--card-bg, #fafafa)',
                      borderRadius: '10px',
                      border: '1px solid var(--border-color, #e8e8e8)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text-color, #262626)' }}>
                        {item.icon} {item.title}
                      </span>
                      <Tag color="blue" style={{ margin: 0, fontSize: '10.5px' }}>{item.tag}</Tag>
                    </div>
                    <Text type="secondary" style={{ fontSize: '11.5px' }}>
                      {item.subtitle}
                    </Text>
                  </div>
                </Col>
              ))}
            </Row>
          </div>
        ) : (
          /* 已有对话状态：消息流 */
          <div
            className="chat-messages-container"
            style={{
              flex: 1,
              overflowY: 'auto',
              paddingRight: '8px',
              display: 'flex',
              flexDirection: 'column',
              marginTop: 12,
            }}
          >
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`chat-message-row ${msg.role}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    gap: 12,
                    maxWidth: '92%',
                    flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: msg.role === 'user' ? 'var(--primary-color, #1890ff)' : '#722ed1',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      fontSize: '15px',
                      flexShrink: 0,
                    }}
                  >
                    {msg.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                    <div
                      style={{
                        background: msg.role === 'user' ? 'rgba(24, 144, 255, 0.08)' : 'var(--card-bg, #f7f9fc)',
                        border: `1px solid ${msg.role === 'user' ? 'rgba(24, 144, 255, 0.2)' : 'var(--border-color, #e8e8e8)'}`,
                        padding: '14px 18px',
                        borderRadius: '12px',
                        fontSize: '14px',
                        lineHeight: '1.7',
                        color: 'var(--text-color, #262626)',
                      }}
                    >
                      {msg.role === 'assistant' ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      ) : (
                        msg.content
                      )}
                    </div>

                    {/* 消息底部工具栏：复制 / 引用数据来源脚标 */}
                    {msg.role === 'assistant' && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingTop: 4,
                        }}
                      >
                        {/* 交互式引用脚标 (点击弹出 Drawer) */}
                        {msg.evidence && msg.evidence.length > 0 ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text type="secondary" style={{ fontSize: '11.5px', marginRight: 2 }}>
                              <BookOutlined /> 来源依据:
                            </Text>
                            {msg.evidence.map((item, idx) => {
                              const citeLabel = item.candidate_name
                                ? `[${idx + 1}] ${item.candidate_name}`
                                : item.project_name
                                ? `[${idx + 1}] ${item.project_name}`
                                : `[${idx + 1}] ${item.title || item.source_name || '资料'}`;
                              return (
                                <Tag
                                  color="green"
                                  key={idx}
                                  style={{ cursor: 'pointer', borderRadius: '12px', padding: '1px 10px', fontSize: '11.5px', margin: 0 }}
                                  onClick={() => setDetailDrawerItem(item)}
                                >
                                  <LinkOutlined style={{ marginRight: 3 }} />
                                  {citeLabel}
                                </Tag>
                              );
                            })}
                          </div>
                        ) : <div />}

                        <Button
                          type="text"
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => copyMessageText(msg.content)}
                          style={{ fontSize: '11.5px', color: '#8c8c8c' }}
                        >
                          复制回复
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {submitting && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#1890ff', margin: '16px 0 16px 48px' }}>
                <RobotOutlined className="anticon-spin" style={{ fontSize: '18px' }} />
                <Text type="secondary" style={{ fontSize: '13px' }}>
                  智能体正在检索全库参数并撰写解决方案...
                </Text>
              </div>
            )}
          </div>
        )}

        {/* 底部 ChatGPT 风格输入框 */}
        <div style={{ background: 'var(--card-bg, #f7f9fc)', padding: '10px 14px', borderRadius: '12px', border: '1px solid var(--border-color, #e8e8e8)', marginTop: 'auto' }}>
          <Input.TextArea
            rows={2}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="输入业务问题，例如：分析大厂工程专家的核心经验，或针对传统行业输出数字化方案..."
            variant="borderless"
            style={{ resize: 'none', fontSize: '14px' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSendPrompt(inputText);
              }
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingTop: 4, borderTop: '1px solid var(--border-color, #f0f0f0)' }}>
            <Text type="secondary" style={{ fontSize: '11.5px' }}>
              按 Cmd + Enter 或 Ctrl + Enter 快捷发送
            </Text>
            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={submitting}
              disabled={!inputText.trim()}
              onClick={() => handleSendPrompt(inputText)}
              style={{ borderRadius: '6px', padding: '0 18px', height: '32px' }}
            >
              发送
            </Button>
          </div>
        </div>
      </Card>

      {/* 点击引用标识时弹出的数据依据 Drawer */}
      <Drawer
        open={Boolean(detailDrawerItem)}
        onClose={() => setDetailDrawerItem(null)}
        width={420}
        title="📚 引用线索与数据依据详情"
      >
        {detailDrawerItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <Text type="secondary" style={{ display: 'block', fontSize: '12px', marginBottom: 4 }}>来源实体名称</Text>
              <Text strong style={{ fontSize: '16px' }}>
                {detailDrawerItem.candidate_name
                  ? `${detailDrawerItem.candidate_name} - ${detailDrawerItem.company || ''} ${detailDrawerItem.role || ''}`
                  : detailDrawerItem.project_name || detailDrawerItem.title || '知识记录'}
              </Text>
            </div>

            {detailDrawerItem.solution && (
              <div>
                <Text type="secondary" style={{ display: 'block', fontSize: '12px', marginBottom: 4 }}>解决方案 / 核心项目打法</Text>
                <Paragraph style={{ margin: 0, background: 'var(--card-bg, #f5f5f5)', padding: 12, borderRadius: 6, fontSize: '13.5px', lineHeight: '1.6' }}>
                  {detailDrawerItem.solution}
                </Paragraph>
              </div>
            )}

            {detailDrawerItem.summary && (
              <div>
                <Text type="secondary" style={{ display: 'block', fontSize: '12px', marginBottom: 4 }}>概要与核心摘要</Text>
                <Paragraph style={{ margin: 0, fontSize: '13.5px' }}>{detailDrawerItem.summary}</Paragraph>
              </div>
            )}

            {detailDrawerItem.match_reason && (
              <div>
                <Text type="secondary" style={{ display: 'block', fontSize: '12px', marginBottom: 4 }}>相关度匹配理由</Text>
                <Tag color="green" style={{ fontSize: '12px' }}>{detailDrawerItem.match_reason}</Tag>
              </div>
            )}

            {detailDrawerItem.resume_id && (
              <div style={{ marginTop: 20 }}>
                <Button
                  type="primary"
                  block
                  icon={<LinkOutlined />}
                  onClick={() => {
                    const id = detailDrawerItem.resume_id;
                    setDetailDrawerItem(null);
                    navigate(`/resumes/${id}`);
                  }}
                >
                  查看完整简历能力档案
                </Button>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default AISolutionAssistantPage;
