import React, { useState } from 'react';
import { App, Button, Card, Form, Input, Modal, Space, Tag, Typography } from 'antd';
import {
  BookOutlined,
  ClearOutlined,
  LinkOutlined,
  RobotOutlined,
  SendOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import request, { getApiErrorMessage } from '../../utils/request';
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

type AIEmployeeChatResponse = {
  conversation_id?: string;
  run_id?: string;
  assistant_message: string;
  solution: {
    title?: string;
    summary?: string;
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
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>();
  const [detailModalItem, setDetailModalItem] = useState<RetrievedEvidence | null>(null);

  const startNewChat = () => {
    setActiveConversationId(undefined);
    setMessages([]);
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
    <div
      className="ai-solution-assistant-page workbench-page"
      style={{
        height: 'calc(100vh - 72px)',
        display: 'flex',
        flexDirection: 'column',
        maxWidth: '860px',
        margin: '0 auto',
        padding: '12px 16px',
        boxSizing: 'border-box',
      }}
    >
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
            padding: '16px 20px',
            overflow: 'hidden',
          },
        }}
      >
        {/* 顶部标头 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingBottom: '12px',
            borderBottom: '1px solid var(--border-color, #f0f0f0)',
          }}
        >
          <span style={{ fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <RobotOutlined style={{ color: '#722ed1', fontSize: '18px' }} />
            AI 解决方案助手
          </span>
          {messages.length > 0 && (
            <Button icon={<ClearOutlined />} size="small" type="text" onClick={startNewChat}>
              新对话
            </Button>
          )}
        </div>

        {/* 消息历史或极简中间起始对话条 */}
        {messages.length === 0 ? (
          /* 空白状态：居中起始对话条 */
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
            <div style={{ fontSize: '32px', marginBottom: 6 }}>🤖</div>
            <Title level={4} style={{ marginBottom: 4 }}>AI 解决方案助手</Title>
            <Text type="secondary" style={{ fontSize: '13px', marginBottom: 20 }}>
              输入您的业务问题，智能体将检索人才档案与知识资产进行解答
            </Text>

            {/* 中间起始对话条 */}
            <div
              style={{
                width: '100%',
                maxWidth: '680px',
                background: 'var(--card-bg, #f7f9fc)',
                padding: '12px 14px',
                borderRadius: '14px',
                border: '1px solid var(--border-color, #e8e8e8)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
              }}
            >
              <Input.TextArea
                rows={2}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="在此输入您的业务或技术咨询问题..."
                variant="borderless"
                style={{ resize: 'none', fontSize: '14.5px' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSendPrompt(inputText);
                  }
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 4 }}>
                <Text type="secondary" style={{ fontSize: '11.5px' }}>
                  Cmd + Enter 快捷发送
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

            {/* 快捷问答 Pill 标签 */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 16 }}>
              {PRESET_QUICK_PROMPTS.map((item) => (
                <Tag
                  key={item.label}
                  style={{
                    cursor: 'pointer',
                    padding: '4px 12px',
                    borderRadius: '14px',
                    fontSize: '12px',
                    background: 'var(--card-bg, #ffffff)',
                    border: '1px solid var(--border-color, #d9d9d9)',
                  }}
                  onClick={() => handleSendPrompt(item.prompt)}
                >
                  {item.icon} {item.label}
                </Tag>
              ))}
            </div>
          </div>
        ) : (
          /* 已有对话状态：消息流 + 底部输入框 */
          <>
            <div
              className="chat-messages-container"
              style={{
                flex: 1,
                overflowY: 'auto',
                paddingRight: '6px',
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
                    marginBottom: 20,
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
                        width: 34,
                        height: 34,
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div
                        style={{
                          background: msg.role === 'user' ? 'rgba(24, 144, 255, 0.08)' : 'var(--card-bg, #f7f9fc)',
                          border: `1px solid ${msg.role === 'user' ? 'rgba(24, 144, 255, 0.2)' : 'var(--border-color, #e8e8e8)'}`,
                          padding: '12px 16px',
                          borderRadius: '12px',
                          fontSize: '14px',
                          lineHeight: '1.65',
                          color: 'var(--text-color, #262626)',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {msg.content}
                      </div>

                      {/* 对话结果末尾的引用标记 */}
                      {msg.role === 'assistant' && msg.evidence && msg.evidence.length > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            flexWrap: 'wrap',
                            paddingTop: 2,
                          }}
                        >
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
                                onClick={() => setDetailModalItem(item)}
                              >
                                <LinkOutlined style={{ marginRight: 3 }} />
                                {citeLabel}
                              </Tag>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {submitting && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#1890ff', margin: '16px 0 16px 46px' }}>
                  <RobotOutlined className="anticon-spin" style={{ fontSize: '18px' }} />
                  <Text type="secondary" style={{ fontSize: '13px' }}>
                    正在全量检索数据库并生成带依据的解决方案...
                  </Text>
                </div>
              )}
            </div>

            {/* 底部输入框 */}
            <div style={{ background: 'var(--card-bg, #f7f9fc)', padding: '10px 14px', borderRadius: '12px', border: '1px solid var(--border-color, #e8e8e8)', marginTop: 'auto' }}>
              <Input.TextArea
                rows={2}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="继续追问或输入新问题..."
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
                  Cmd + Enter 快捷发送
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
          </>
        )}
      </Card>

      {/* 点击引用标识时弹出的数据依据 Modal */}
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
              查看完整简历档案
            </Button>
          ),
        ]}
        title="📚 引用线索与数据依据详情"
      >
        {detailModalItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
            <div>
              <Text type="secondary" style={{ display: 'block', fontSize: '12px', marginBottom: 2 }}>来源实体名称</Text>
              <Text strong style={{ fontSize: '15.5px' }}>
                {detailModalItem.candidate_name
                  ? `${detailModalItem.candidate_name} - ${detailModalItem.company || ''} ${detailModalItem.role || ''}`
                  : detailModalItem.project_name || detailModalItem.title || '知识记录'}
              </Text>
            </div>
            {detailModalItem.solution && (
              <div>
                <Text type="secondary" style={{ display: 'block', fontSize: '12px', marginBottom: 2 }}>解决方案 / 核心经历打法</Text>
                <Paragraph style={{ margin: 0, background: 'var(--card-bg, #f5f5f5)', padding: 10, borderRadius: 6, fontSize: '13.5px' }}>
                  {detailModalItem.solution}
                </Paragraph>
              </div>
            )}
            {detailModalItem.summary && (
              <div>
                <Text type="secondary" style={{ display: 'block', fontSize: '12px', marginBottom: 2 }}>概要与核心摘要</Text>
                <Paragraph style={{ margin: 0, fontSize: '13.5px' }}>{detailModalItem.summary}</Paragraph>
              </div>
            )}
            {detailModalItem.match_reason && (
              <div>
                <Text type="secondary" style={{ display: 'block', fontSize: '12px', marginBottom: 2 }}>相关度匹配理由</Text>
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
