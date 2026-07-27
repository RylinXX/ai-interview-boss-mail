import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Col, Drawer, Form, Input, Modal, Progress, Row, Space, Tag, Typography } from 'antd';
import {
  AuditOutlined,
  BookOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  ClearOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  LinkOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import request, { getApiErrorMessage } from '../../utils/request';
import { ModulePageHeader } from '../../components/Workbench';
import '../BusinessWorkbench.css';

const { Title, Text, Paragraph } = Typography;

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  role: ChatRole;
  content: string;
  evidence?: RetrievedEvidence[];
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

type SolutionAgentRunResponse = {
  response_payload?: AIEmployeeChatResponse;
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

const PRESET_QUICK_PROMPTS = [
  {
    icon: '🎓',
    label: '985/211专家打法分析',
    prompt: '请分析数据库中 985/211 院校履历专家在 AI 与大数据中台项目的核心落地经验与技术线索。',
  },
  {
    icon: '💼',
    label: '金融与风控模式盘点',
    prompt: '请盘点数据库里关于金融服务与风控领域的关键商业模式、落地案例及强证据知识资产。',
  },
  {
    icon: '🚀',
    label: '零售私域与电商系统方案',
    prompt: '针对零售企业私域流量增长与电商自动化需求，请基于现有知识资产输出可交付的系统方案。',
  },
  {
    icon: '📊',
    label: '商业证据链缺口查验',
    prompt: '请查验当前已沉淀的项目经验打法中，存在哪些尚待补齐的结构化商业证据链缺口？',
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeEvidence, setActiveEvidence] = useState<RetrievedEvidence[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>();
  const [detailModalItem, setDetailModalItem] = useState<RetrievedEvidence | null>(null);

  const startNewChat = () => {
    setActiveConversationId(undefined);
    setMessages([]);
    setActiveEvidence([]);
    setInputText('');
    toast.success('已开启新一轮智能对话');
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
        confirmed_context: { messages: nextMessages },
        limit: 8,
      });

      const retrieved = result.retrieved_evidence || [];
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: result.assistant_message,
        evidence: retrieved,
      };

      setMessages([...nextMessages, assistantMsg]);
      setActiveEvidence(retrieved);
      if (result.conversation_id) {
        setActiveConversationId(result.conversation_id);
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'AI 解决方案助手回答失败，请检查网络后重试'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ai-solution-assistant-page workbench-page">
      <ModulePageHeader
        eyebrow={<><RobotOutlined /> RAG 智能助手</>}
        title="AI 解决方案助手"
        description="与智能体对话，基于数据库中的人才能力样本、项目打法与知识资产进行 RAG 检索问答，自动标注线索来源与引用编号。"
        actions={
          <Space>
            <Button icon={<ClearOutlined />} onClick={startNewChat}>
              开启新对话
            </Button>
            <Button icon={<FileTextOutlined />} onClick={() => navigate('/customer-projects')}>
              客户案卷
            </Button>
          </Space>
        }
      />

      <Row gutter={[20, 20]} style={{ marginTop: 16 }}>
        {/* 左侧：RAG Chat 交互主界面 */}
        <Col xs={24} lg={16}>
          <Card
            className="chat-main-card consulting-table-card"
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <RobotOutlined style={{ color: 'var(--primary-color, #1890ff)' }} />
                  智能体问答工作台
                </span>
                <Tag color="blue" style={{ margin: 0 }}>RAG 模式（数据库线索实时联动）</Tag>
              </div>
            }
            styles={{ body: { padding: '16px 20px' } }}
          >
            {/* 预设推荐场景提示卡片 */}
            {messages.length === 0 && (
              <div className="chat-preset-section" style={{ marginBottom: 20 }}>
                <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: 10 }}>
                  💡 推荐预设业务问答场景（点击快捷发送）：
                </Text>
                <Row gutter={[10, 10]}>
                  {PRESET_QUICK_PROMPTS.map((item) => (
                    <Col span={12} key={item.label}>
                      <div
                        className="preset-prompt-card"
                        onClick={() => handleSendPrompt(item.prompt)}
                        style={{
                          padding: '12px 14px',
                          background: 'var(--card-bg, #fafafa)',
                          borderRadius: '8px',
                          border: '1px solid var(--border-color, #e8e8e8)',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: 4, color: 'var(--text-color, #262626)' }}>
                          {item.icon} {item.label}
                        </div>
                        <Text type="secondary" style={{ fontSize: '11px' }} ellipsis>
                          {item.prompt}
                        </Text>
                      </div>
                    </Col>
                  ))}
                </Row>
              </div>
            )}

            {/* 对话消息流 */}
            <div
              className="chat-messages-container"
              style={{
                minHeight: '380px',
                maxHeight: '520px',
                overflowY: 'auto',
                paddingRight: '6px',
                marginBottom: 16,
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
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      maxWidth: '88%',
                      flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: msg.role === 'user' ? '#1890ff' : '#722ed1',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        fontSize: '14px',
                        flexShrink: 0,
                      }}
                    >
                      {msg.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                    </div>
                    <div
                      style={{
                        background: msg.role === 'user' ? 'rgba(24, 144, 255, 0.08)' : 'var(--card-bg, #f5f7fa)',
                        border: `1px solid ${msg.role === 'user' ? 'rgba(24, 144, 255, 0.2)' : 'var(--border-color, #e8e8e8)'}`,
                        padding: '12px 16px',
                        borderRadius: '10px',
                        fontSize: '14px',
                        lineHeight: '1.6',
                        color: 'var(--text-color, #262626)',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>

                  {/* 如果包含引用证明依据 */}
                  {msg.role === 'assistant' && msg.evidence && msg.evidence.length > 0 && (
                    <div
                      className="chat-evidence-references"
                      style={{
                        marginTop: 10,
                        marginLeft: 40,
                        padding: '12px 14px',
                        background: '#f6ffed',
                        border: '1px solid #b7eb8f',
                        borderRadius: '8px',
                        maxWidth: '85%',
                      }}
                    >
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#389e0d', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <BookOutlined /> 📚 调用的数据库参数与引用依据 (References & Source Proofs)：
                      </div>
                      <Space wrap size={[6, 6]}>
                        {msg.evidence.map((item, idx) => {
                          const citeLabel = item.candidate_name
                            ? `[引用 ${idx + 1}] 人才: ${item.candidate_name}`
                            : item.project_name
                            ? `[引用 ${idx + 1}] 项目: ${item.project_name}`
                            : `[引用 ${idx + 1}] 资产: ${item.title || item.source_name || '数据库条目'}`;
                          return (
                            <Tag
                              color="green"
                              key={idx}
                              style={{ cursor: 'pointer', padding: '2px 8px', fontSize: '12px' }}
                              onClick={() => setDetailModalItem(item)}
                            >
                              <LinkOutlined style={{ marginRight: 4 }} />
                              {citeLabel}
                            </Tag>
                          );
                        })}
                      </Space>
                    </div>
                  )}
                </div>
              ))}

              {submitting && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#1890ff', marginLeft: 40 }}>
                  <RobotOutlined className="anticon-spin" />
                  <Text type="secondary" style={{ fontSize: '13px' }}>
                    智能体正在全量检索数据库并推演最佳解决方案...
                  </Text>
                </div>
              )}
            </div>

            {/* 输入框区 */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <Input.TextArea
                rows={3}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="请输入您的业务或技术咨询问题，例如：分析大厂背景高管的落地打法，或针对特定行业提出系统方案..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSendPrompt(inputText);
                  }
                }}
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={submitting}
                onClick={() => handleSendPrompt(inputText)}
                style={{ height: '76px', padding: '0 24px', borderRadius: '8px' }}
              >
                发送
              </Button>
            </div>
            <Text type="secondary" style={{ fontSize: '11px', marginTop: 6, display: 'block' }}>
              提示: 按 Ctrl + Enter 或 Cmd + Enter 可快速提交发送。
            </Text>
          </Card>
        </Col>

        {/* 右侧：数据库检索参数线索探索面板 */}
        <Col xs={24} lg={8}>
          <Card
            className="consulting-table-card"
            title={
              <span style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <DatabaseOutlined style={{ color: '#52c41a' }} />
                数据库线索与依据
              </span>
            }
            styles={{ body: { padding: '16px' } }}
          >
            {activeEvidence.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  本次问答中提取到的线索数: <strong>{activeEvidence.length}</strong> 项
                </Text>

                {activeEvidence.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => setDetailModalItem(item)}
                    style={{
                      padding: '10px 12px',
                      background: 'var(--card-bg, #fafafa)',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color, #e8e8e8)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Tag color="blue" style={{ margin: 0 }}>
                        [引用 {idx + 1}]
                      </Tag>
                      {item.match_score && (
                        <Text type="secondary" style={{ fontSize: '11px' }}>
                          相关度: {Math.round(item.match_score * 100)}%
                        </Text>
                      )}
                    </div>
                    <Text strong style={{ fontSize: '13px', display: 'block', color: 'var(--text-color, #262626)' }}>
                      {item.candidate_name
                        ? `候选人: ${item.candidate_name} (${item.role || '专家'})`
                        : item.project_name
                        ? `项目: ${item.project_name}`
                        : item.title || item.source_name || '数据库知识记录'}
                    </Text>
                    {item.summary || item.solution ? (
                      <Paragraph ellipsis={{ rows: 2 } as any} style={{ fontSize: '12px', margin: '4px 0 0 0', color: '#666' }}>
                        {item.summary || item.solution}
                      </Paragraph>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '30px 10px', color: '#999' }}>
                <DatabaseOutlined style={{ fontSize: '28px', marginBottom: 8, opacity: 0.5 }} />
                <div style={{ fontSize: '13px' }}>暂无检索线索</div>
                <Text type="secondary" style={{ fontSize: '11px', display: 'block', marginTop: 4 }}>
                  发送提问后，智能体将在此实时展示检索到的数据库依据。
                </Text>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* 引用依据详情 Modal */}
      <Modal
        open={Boolean(detailModalItem)}
        onCancel={() => setDetailModalItem(null)}
        footer={[
          <Button key="close" onClick={() => setDetailModalItem(null)}>
            关闭
          </Button>,
          detailModalItem?.resume_id && (
            <Button
              key="resume"
              type="primary"
              onClick={() => {
                const id = detailModalItem.resume_id;
                setDetailModalItem(null);
                navigate(`/resumes/${id}`);
              }}
            >
              查看完整简历样本
            </Button>
          ),
        ]}
        title="📚 数据库线索依据详情"
      >
        {detailModalItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <Text type="secondary" style={{ display: 'block', fontSize: '12px' }}>依据名称 / 实体</Text>
              <Text strong style={{ fontSize: '15px' }}>
                {detailModalItem.candidate_name
                  ? `${detailModalItem.candidate_name} - ${detailModalItem.company || ''} ${detailModalItem.role || ''}`
                  : detailModalItem.project_name || detailModalItem.title || '知识记录'}
              </Text>
            </div>
            {detailModalItem.solution && (
              <div>
                <Text type="secondary" style={{ display: 'block', fontSize: '12px' }}>解决方案 / 项目内容</Text>
                <Paragraph style={{ margin: 0, background: '#f5f5f5', padding: 8, borderRadius: 4 }}>
                  {detailModalItem.solution}
                </Paragraph>
              </div>
            )}
            {detailModalItem.summary && (
              <div>
                <Text type="secondary" style={{ display: 'block', fontSize: '12px' }}>概要摘要</Text>
                <Paragraph style={{ margin: 0 }}>{detailModalItem.summary}</Paragraph>
              </div>
            )}
            {detailModalItem.match_reason && (
              <div>
                <Text type="secondary" style={{ display: 'block', fontSize: '12px' }}>匹配理由</Text>
                <Tag color="green">{detailModalItem.match_reason}</Tag>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AISolutionAssistantPage;
