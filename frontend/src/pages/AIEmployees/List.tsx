import React, { useState } from 'react';
import { App, Button, Card, Form, Input, Modal, Row, Col, Space, Tag, Typography } from 'antd';
import {
  BookOutlined,
  ClearOutlined,
  FileTextOutlined,
  LinkOutlined,
  RobotOutlined,
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
    <div className="ai-solution-assistant-page workbench-page" style={{ maxWidth: '960px', margin: '0 auto' }}>
      <ModulePageHeader
        eyebrow={<><RobotOutlined /> RAG 智能助手</>}
        title="AI 解决方案助手"
        description="与智能体对话，基于数据库中的人才能力样本、项目打法与知识资产进行 RAG 检索问答，点击对话结果末尾的引用标识即可查看数据来源。"
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

      {/* ChatGPT 式极简居中主交互窗口 */}
      <Card
        className="chat-main-card consulting-table-card"
        style={{ marginTop: 16, borderRadius: '12px' }}
        styles={{ body: { padding: '24px 28px' } }}
      >
        {/* 空白页推荐问答场景 */}
        {messages.length === 0 && (
          <div className="chat-preset-section" style={{ marginBottom: 28, textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: 8 }}>🤖</div>
            <Title level={4} style={{ marginBottom: 4 }}>我是您的 AI 解决方案助手</Title>
            <Text type="secondary" style={{ fontSize: '13px', display: 'block', marginBottom: 24 }}>
              我可以检索私有人才样本、项目打法与知识资产，为您分析模式并生成带有数据依据的解决方案。
            </Text>

            <Row gutter={[12, 12]}>
              {PRESET_QUICK_PROMPTS.map((item) => (
                <Col xs={24} sm={12} key={item.label}>
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
                    <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: 4, color: 'var(--text-color, #262626)' }}>
                      {item.icon} {item.label}
                    </div>
                    <Text type="secondary" style={{ fontSize: '12px' }} ellipsis>
                      {item.prompt}
                    </Text>
                  </div>
                </Col>
              ))}
            </Row>
          </div>
        )}

        {/* 聊天对话消息流 */}
        <div
          className="chat-messages-container"
          style={{
            minHeight: messages.length ? '360px' : 'auto',
            maxHeight: '600px',
            overflowY: 'auto',
            paddingRight: '6px',
            marginBottom: 20,
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
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: msg.role === 'user' ? 'var(--primary-color, #1890ff)' : '#722ed1',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: '16px',
                    flexShrink: 0,
                  }}
                >
                  {msg.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div
                    style={{
                      background: msg.role === 'user' ? 'rgba(24, 144, 255, 0.08)' : 'var(--card-bg, #f7f9fc)',
                      border: `1px solid ${msg.role === 'user' ? 'rgba(24, 144, 255, 0.2)' : 'var(--border-color, #e8e8e8)'}`,
                      padding: '14px 18px',
                      borderRadius: '12px',
                      fontSize: '14.5px',
                      lineHeight: '1.65',
                      color: 'var(--text-color, #262626)',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {msg.content}
                  </div>

                  {/* 对话结果末尾的交互式引用 Source 标记 (只在点击时弹出Modal) */}
                  {msg.role === 'assistant' && msg.evidence && msg.evidence.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        flexWrap: 'wrap',
                        paddingTop: 4,
                      }}
                    >
                      <Text type="secondary" style={{ fontSize: '12px', marginRight: 2 }}>
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
                            style={{ cursor: 'pointer', borderRadius: '12px', padding: '1px 10px', fontSize: '12px', margin: 0 }}
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
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#1890ff', margin: '16px 0 16px 48px' }}>
              <RobotOutlined className="anticon-spin" style={{ fontSize: '18px' }} />
              <Text type="secondary" style={{ fontSize: '13.5px' }}>
                正在全量检索数据库并生成带依据的解决方案...
              </Text>
            </div>
          )}
        </div>

        {/* ChatGPT 风格底部沉浸式输入框 */}
        <div style={{ background: 'var(--card-bg, #f7f9fc)', padding: '12px 14px', borderRadius: '14px', border: '1px solid var(--border-color, #e8e8e8)' }}>
          <Input.TextArea
            rows={3}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="问点什么吧... 例如：分析 985/211 院校履历专家在大厂的核心经验，或针对具体行业输出解决方案。"
            variant="borderless"
            style={{ resize: 'none', fontSize: '14.5px' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSendPrompt(inputText);
              }
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--border-color, #f0f0f0)' }}>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              按 Cmd + Enter 或 Ctrl + Enter 快捷发送
            </Text>
            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={submitting}
              disabled={!inputText.trim()}
              onClick={() => handleSendPrompt(inputText)}
              style={{ borderRadius: '8px', padding: '0 20px' }}
            >
              发送
            </Button>
          </div>
        </div>
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
