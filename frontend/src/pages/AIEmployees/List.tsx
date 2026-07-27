import React, { useEffect, useState } from 'react';
import { App, Button, Card, Col, Collapse, Drawer, Empty, Input, Popconfirm, Row, Select, Space, Tag, Typography } from 'antd';
import {
  BookOutlined,
  ClearOutlined,
  CopyOutlined,
  DeleteOutlined,
  ExportOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  FilterOutlined,
  GlobalOutlined,
  HistoryOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  LoadingOutlined,
  PlusOutlined,
  ReadOutlined,
  RobotOutlined,
  SaveOutlined,
  SendOutlined,
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
  search_scope?: string;
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

const scopeOptions = [
  {
    value: 'all',
    label: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '12px' }}>
        <GlobalOutlined style={{ color: '#1890ff' }} />
        全量知识与人才库
      </span>
    ),
  },
  {
    value: 'resumes_only',
    label: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '12px' }}>
        <ReadOutlined style={{ color: '#722ed1' }} />
        仅人才能力档案
      </span>
    ),
  },
  {
    value: 'cases_only',
    label: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '12px' }}>
        <SolutionOutlined style={{ color: '#52c41a' }} />
        仅案例打法与项目
      </span>
    ),
  },
  {
    value: 'assets_only',
    label: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '12px' }}>
        <FileTextOutlined style={{ color: '#fa8c16' }} />
        仅强证据知识资产
      </span>
    ),
  },
];

const getScopeLabel = (scopeKey: string) => {
  switch (scopeKey) {
    case 'resumes_only':
      return '仅人才能力档案';
    case 'cases_only':
      return '仅案例打法与项目';
    case 'assets_only':
      return '仅强证据知识资产';
    default:
      return '全量知识与人才库';
  }
};

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

  const handleScopeChange = (val: string) => {
    setSearchScope(val);
    toast.info('切换数据源后，仅对新发起提问生效，不修改历史对话的检索范围');
  };

  const startNewChat = () => {
    setActiveConversationId(undefined);
    setMessages([]);
    setLastSolution(null);
    setInputText('');
    toast.success('已开启新一轮解决方案对话');
  };

  const openConversation = async (conversationId: string, itemSearchScope?: string) => {
    try {
      const history = await request.get(`/solution-agent/conversations/${conversationId}/messages`) as any;
      const items = history.items || [];
      const convScope = history.conversation?.search_scope || itemSearchScope || 'all';
      setActiveConversationId(conversationId);
      setSearchScope(convScope);
      setMessages(
        items.map((item: any) => ({
          role: item.role,
          content: item.content,
          evidence: item.sources || [],
        }))
      );
      const assistant = [...items].reverse().find((item: any) => item.role === 'assistant' && item.run_id);
      if (assistant?.run_id) {
        const run = await request.get(`/solution-agent/runs/${assistant.run_id}`) as any;
        if (run.response_payload) {
          setLastSolution(run.response_payload.solution);
          const retrieved = run.response_payload.retrieved_evidence || [];
          if (items.length) {
            setMessages(previous =>
              previous.map((msg, i) =>
                i === previous.length - 1 && msg.role === 'assistant' ? { ...msg, evidence: retrieved } : msg
              )
            );
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
      toast.success('已成功删除历史对话');
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

  const saveDraftSolution = () => {
    toast.success('当前解决方案已作为业务草稿保存');
  };

  const exportSolutionDoc = () => {
    toast.info('功能预留：即将支持导出 PDF / Markdown 规范文档');
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
      {/* 左侧：整合为单一整体容器（统一圆角/背景/边框，内部分组） */}
      <div className="solution-sidebar-unified">
        {/* 顶部操作区：通栏主按钮 */}
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={startNewChat}
          block
          style={{ height: '40px', borderRadius: '8px', fontWeight: 600, fontSize: '13.5px' }}
        >
          + 新建解决方案对话
        </Button>

        {/* 检索范围配置分组（带标题分割线） */}
        <div className="solution-sidebar-section-title">
          <FilterOutlined style={{ color: '#1890ff' }} /> 检索知识库范围
        </div>
        <div style={{ marginBottom: 4 }}>
          <Select
            value={searchScope}
            onChange={handleScopeChange}
            style={{ width: '100%' }}
            size="small"
            options={scopeOptions}
          />
          <Text type="secondary" style={{ fontSize: '11px', marginTop: 4, display: 'block', color: '#8c8c8c' }}>
            💡 控制本次问答 RAG 检索数据源边界。
          </Text>
        </div>

        {/* 历史会话分组（带标题分割线） */}
        <div className="solution-sidebar-section-title" style={{ marginTop: 12 }}>
          <HistoryOutlined style={{ color: '#722ed1' }} /> 历史对话记录
        </div>

        {/* 列表承载所有会话条目 */}
        <div className="solution-history-list">
          {conversations.length ? (
            conversations.map((item) => (
              <div
                key={item.id}
                onClick={() => openConversation(item.id, item.search_scope)}
                className={`solution-history-item ${activeConversationId === item.id ? 'active' : ''}`}
                title={item.title || '新对话'}
              >
                <span
                  className="solution-history-title"
                  style={{
                    color: activeConversationId === item.id ? '#1890ff' : 'var(--text-color, #333)',
                    fontWeight: activeConversationId === item.id ? 600 : 400,
                  }}
                >
                  {item.title || '新对话'}
                </span>

                <Popconfirm
                  title="确认删除该历史对话及其记录吗？"
                  onConfirm={(e) => e && deleteConversation(item.id, e as any)}
                  okText="删除"
                  cancelText="取消"
                >
                  <button
                    className="delete-btn"
                    onClick={(e) => e.stopPropagation()}
                    title="删除对话"
                  >
                    <DeleteOutlined style={{ fontSize: '13px' }} />
                  </button>
                </Popconfirm>
              </div>
            ))
          ) : (
            <div style={{ padding: '24px 0', textAlign: 'center' }}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <Text type="secondary" style={{ fontSize: '11.5px' }}>
                    暂无历史对话<br />点击上方按钮新建对话
                  </Text>
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* 右侧：主聊天窗口 UI 视觉优化 */}
      <Card
        className="chat-main-card consulting-table-card"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.04)',
          border: '1px solid var(--border-color, #e8e8e8)',
        }}
        styles={{
          body: {
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            padding: '20px 24px',
            overflow: 'hidden',
          },
        }}
      >
        {/* 顶部标头与操作按键 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingBottom: '14px',
            borderBottom: '1px solid var(--border-color, #f0f0f0)',
          }}
        >
          <span style={{ fontSize: '15.5px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <RobotOutlined style={{ color: '#722ed1', fontSize: '18px' }} />
            {lastSolution?.title || 'AI 解决方案助手'}
          </span>
          <Space>
            {lastSolution && (
              <>
                <Button
                  type="primary"
                  size="small"
                  icon={<ExportOutlined />}
                  loading={creatingProject}
                  onClick={createCustomerProject}
                >
                  转换为客户项目卷宗
                </Button>
                <Button size="small" icon={<SaveOutlined />} onClick={saveDraftSolution}>
                  保存方案
                </Button>
                <Button size="small" icon={<ExportOutlined />} onClick={exportSolutionDoc}>
                  导出文档
                </Button>
              </>
            )}
            {messages.length > 0 && (
              <Popconfirm
                title="确认清空当前对话及其历史记录吗？"
                onConfirm={startNewChat}
                okText="清空"
                cancelText="取消"
              >
                <Button icon={<ClearOutlined />} size="small" danger>
                  清空对话
                </Button>
              </Popconfirm>
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
                      background: msg.role === 'user' ? '#1890ff' : '#722ed1',
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

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
                    {/* 消息气泡规范：用户靠右浅色底，AI靠左白色底 */}
                    <div
                      style={{
                        background: msg.role === 'user' ? 'rgba(24, 144, 255, 0.09)' : 'var(--card-bg, #ffffff)',
                        border: `1px solid ${msg.role === 'user' ? 'rgba(24, 144, 255, 0.25)' : 'var(--border-color, #e8e8e8)'}`,
                        padding: '14px 18px',
                        borderRadius: msg.role === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                        fontSize: '14px',
                        lineHeight: '1.7',
                        color: 'var(--text-color, #262626)',
                        boxShadow: msg.role === 'assistant' ? '0 2px 8px rgba(0, 0, 0, 0.03)' : 'none',
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

                    {/* 【重点：RAG 检索溯源信息规范（折叠面板强制落地）】 */}
                    {msg.role === 'assistant' && (
                      <div>
                        <Collapse
                          ghost
                          className="rag-trace-collapse"
                          items={[
                            {
                              key: '1',
                              label: (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '12px', fontWeight: 600, color: '#1890ff' }}>
                                  <FileSearchOutlined /> 📄 检索来源明细 (已命中 {msg.evidence?.length || 0} 项数据素材)
                                </span>
                              ),
                              children: (
                                <div className="rag-trace-content">
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 6, borderBottom: '1px solid var(--border-color, #f0f0f0)' }}>
                                    <Tag color="blue" style={{ margin: 0, fontSize: '11.5px' }}>
                                      ① 当前生效检索范围：【数据源：{getScopeLabel(searchScope)}】
                                    </Tag>
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <Text type="secondary" style={{ fontSize: '11.5px', fontWeight: 600 }}>
                                      ② 命中条目清单 ({msg.evidence?.length || 0} 条):
                                    </Text>
                                    {msg.evidence && msg.evidence.length > 0 ? (
                                      msg.evidence.map((item, idx) => {
                                        const titleStr = item.candidate_name
                                          ? `${item.candidate_name} (${item.company || ''} ${item.role || ''})`
                                          : item.project_name || item.title || '知识记录';
                                        const labelType = item.candidate_name ? '人才履历' : item.project_name ? '项目经验' : '强证据资产';
                                        return (
                                          <div
                                            key={idx}
                                            className="rag-trace-evidence-item"
                                            onClick={() => setDetailDrawerItem(item)}
                                          >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                                              <Tag color={item.candidate_name ? 'purple' : 'cyan'} style={{ margin: 0, fontSize: '10.5px' }}>
                                                {labelType}
                                              </Tag>
                                              <Text ellipsis style={{ fontSize: '12px', fontWeight: 500 }}>
                                                [{idx + 1}] {titleStr}
                                              </Text>
                                            </div>
                                            <Tag color="green" style={{ margin: 0, fontSize: '10.5px' }}>
                                              <LinkOutlined /> 查看详情
                                            </Tag>
                                          </div>
                                        );
                                      })
                                    ) : (
                                      <Text type="secondary" style={{ fontSize: '11.5px' }}>
                                        未检出直接命中的私有知识库文档
                                      </Text>
                                    )}
                                  </div>
                                  <div style={{ paddingTop: 6, borderTop: '1px solid var(--border-color, #f0f0f0)', color: '#8c8c8c', fontSize: '11px', lineHeight: '1.5' }}>
                                    💡 标注：本次结论基于以上素材生成，无检索素材部分为模型通用推理。
                                  </div>
                                </div>
                              ),
                            },
                          ]}
                        />

                        {/* 消息底栏复制按钮 */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
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
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* 动态加载状态优化：轻量化 Spin 图标 + 自定义提示文案 */}
            {submitting && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '16px 0 16px 48px' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#1890ff' }}>
                  <LoadingOutlined style={{ fontSize: '18px' }} />
                  <Text strong style={{ fontSize: '13.5px', color: '#1890ff' }}>
                    智能体正在检索全库参数并撰写解决方案…
                  </Text>
                </div>
                <Text type="secondary" style={{ fontSize: '11.5px', marginLeft: 28 }}>
                  💡 提示：回答生成耗时取决于知识库检索体量与多路 RAG 融合计算量。
                </Text>
              </div>
            )}
          </div>
        )}

        {/* 底部 ChatGPT 风格输入框区域（加高高度，辅助文案内嵌，发送固定右下侧） */}
        <div className="solution-chat-input-wrapper">
          <Input.TextArea
            rows={3}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="输入您的业务诉求，例如：分析大厂工程专家的核心打法，或针对传统零售企业输出私域流量数字化方案..."
            variant="borderless"
            style={{ resize: 'none', fontSize: '14px', minHeight: '72px' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSendPrompt(inputText);
              }
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border-color, #f0f0f0)' }}>
            <Text type="secondary" style={{ fontSize: '11.5px', color: '#8c8c8c' }}>
              按 Cmd + Enter 或 Ctrl + Enter 快捷发送
            </Text>
            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={submitting}
              disabled={!inputText.trim()}
              onClick={() => handleSendPrompt(inputText)}
              style={{ borderRadius: '6px', padding: '0 20px', height: '34px', fontWeight: 600 }}
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
