import React, { useEffect, useState } from 'react';
import {
  App,
  Button,
  Card,
  Checkbox,
  Col,
  Collapse,
  Drawer,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Popover,
  Row,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  BookOutlined,
  BulbOutlined,
  CheckOutlined,
  ClearOutlined,
  CopyOutlined,
  DeleteOutlined,
  DislikeOutlined,
  EditOutlined,
  ExportOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  FilterOutlined,
  GlobalOutlined,
  HistoryOutlined,
  InfoCircleOutlined,
  LikeOutlined,
  LinkOutlined,
  LoadingOutlined,
  PaperClipOutlined,
  PlusOutlined,
  PushpinOutlined,
  ReadOutlined,
  RobotOutlined,
  SaveOutlined,
  SearchOutlined,
  SendOutlined,
  SolutionOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  retrieved_project_count?: number;
  retrieved_resume_count?: number;
  feedback?: 'useful' | 'not_useful';
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
  is_pinned?: boolean;
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
    knowledge_context?: any;
  };
  retrieved_evidence: RetrievedEvidence[];
  retrieved_project_count?: number;
  retrieved_resume_count?: number;
  model_used: boolean;
  fallback_used: boolean;
};

const PRESET_SCENARIOS = [
  {
    icon: '🎓',
    title: '985/211专家打法拆解',
    subtitle: '提取高学历与大厂履历专家的工程落地与系统设计打法',
    prompt: '请分析数据库中 985/211 院校与大厂履历专家在 AI 与大数据中台项目的核心落地经验与技术打法。',
    tag: '人才履历',
    color: 'blue',
  },
  {
    icon: '💼',
    title: '金融风控商业模式盘点',
    subtitle: '梳理金融与信贷领域的商业模式、核心风控及强证据案例',
    prompt: '请盘点数据库里关于金融服务与风控领域的关键商业模式、落地案例及强证据知识资产。',
    tag: '商业打法',
    color: 'purple',
  },
  {
    icon: '🚀',
    title: '零售私域与电商系统方案',
    subtitle: '基于已有知识资产与成功经验输出可交付的系统方案',
    prompt: '针对零售企业私域流量增长与电商自动化需求，请基于现有知识资产输出包含执行路径的可交付系统方案。',
    tag: '系统交付',
    color: 'green',
  },
  {
    icon: '📊',
    title: '商业证据链缺口查验',
    subtitle: '检索已沉淀项目中缺失的验证维度与待补充资料',
    prompt: '请查验当前已沉淀的项目经验打法中，存在哪些尚待补齐的结构化商业证据链缺口？',
    tag: '证据审查',
    color: 'cyan',
  },
];

const KNOWLEDGE_TYPE_OPTIONS = [
  { label: '人才能力档案 (履历与专家库)', value: 'work_cases' },
  { label: '项目实战案例 (经验与打法)', value: 'project_cases' },
  { label: '强证据知识资产 (行业报告/文档)', value: 'knowledge_assets' },
];

const INDUSTRY_OPTIONS = [
  '计算机/AI',
  '金融服务',
  '零售电商',
  '工程建设/运维',
  '人力资源/企业管理',
  '教育培训',
];

const PROMPT_TEMPLATES = [
  '请诊断以下客户痛点，并基于团队经验推荐合适的技术架构与专家干系人：',
  '请为某传统零售品牌输出一份私域与会员精准运营的 AI 落地方案：',
  '针对国央企数字化项目，请整理一份可用于售前提案的优势线索与案例清单：',
];

const AISolutionAssistantPage: React.FC = () => {
  const { message: toast } = App.useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [historySearchKeyword, setHistorySearchKeyword] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [lastSolution, setLastSolution] = useState<any>(null);
  const [creatingProject, setCreatingProject] = useState<boolean>(false);
  const [savingAsset, setSavingAsset] = useState<boolean>(false);
  const [detailDrawerItem, setDetailDrawerItem] = useState<RetrievedEvidence | null>(null);

  // 高级知识库筛选面板状态
  const [scopeFilterVisible, setScopeFilterVisible] = useState<boolean>(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['work_cases', 'project_cases', 'knowledge_assets']);
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

  // 重命名对话 Modal 状态
  const [renameModalVisible, setRenameModalVisible] = useState<boolean>(false);
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editingTitleText, setEditingTitleText] = useState<string>('');

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    const resumeId = searchParams.get('resume_id');
    const candidateName = searchParams.get('candidate_name');
    if (candidateName || resumeId) {
      const promptText = `请结合候选人【${candidateName || '专家'}】的项目履历与能力样本，分析其最适用的行业解决方案方向与团队配置建议。`;
      setInputText(promptText);
    }
  }, [searchParams]);

  const fetchConversations = async () => {
    try {
      const res = (await request.get('/solution-agent/conversations')) as any;
      const list = Array.isArray(res) ? res : res?.items || [];
      setConversations(list || []);
    } catch {
      setConversations([]);
    }
  };

  const startNewChat = () => {
    setActiveConversationId(null);
    setMessages([]);
    setLastSolution(null);
    setInputText('');
  };

  const openConversation = async (id: string) => {
    setActiveConversationId(id);
    try {
      const res = (await request.get(`/solution-agent/conversations/${id}/messages`)) as any;
      const rawMsgs = Array.isArray(res) ? res : res?.items || res?.messages || [];
      const formattedMsgs: ChatMessage[] = rawMsgs.map((m: any) => ({
        role: m.role,
        content: m.content,
        evidence: m.sources || m.evidence || m.payload?.retrieved_evidence || [],
        solution: m.payload?.solution || m.solution,
      }));
      setMessages(formattedMsgs);
      const lastAsst = [...formattedMsgs].reverse().find((m) => m.role === 'assistant' && m.solution);
      if (lastAsst) {
        setLastSolution(lastAsst.solution);
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, '加载对话历史失败'));
    }
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await request.delete(`/solution-agent/conversations/${id}`);
      toast.success('已删除该历史对话');
      if (activeConversationId === id) {
        startNewChat();
      }
      fetchConversations();
    } catch (error) {
      toast.error(getApiErrorMessage(error, '删除历史对话失败'));
    }
  };

  const togglePinConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, is_pinned: !c.is_pinned } : c))
    );
    toast.success('会话置顶状态已更新');
  };

  const openRenameModal = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingConvId(id);
    setEditingTitleText(currentTitle || '新对话');
    setRenameModalVisible(true);
  };

  const saveRenamedTitle = () => {
    if (!editingConvId) return;
    setConversations((prev) =>
      prev.map((c) => (c.id === editingConvId ? { ...c, title: editingTitleText.trim() || '新对话' } : c))
    );
    setRenameModalVisible(false);
    toast.success('对话标题已更新');
  };

  const handleSendPrompt = async (requirementText?: string) => {
    const query = (requirementText || inputText).trim();
    if (!query) return;

    const userMsg: ChatMessage = { role: 'user', content: query };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputText('');
    setSubmitting(true);

    try {
      const res = (await request.post('/ai-employees/chat', {
        requirement: query,
        messages: updatedMessages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
        limit: 300,
        knowledge_types: selectedTypes,
        industries: selectedIndustries,
        roles: selectedRoles,
      })) as AIEmployeeChatResponse;

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: res.assistant_message,
        evidence: res.retrieved_evidence || [],
        solution: res.solution,
        retrieved_project_count: res.retrieved_project_count ?? res.solution?.knowledge_context?.project_count ?? 0,
        retrieved_resume_count: res.retrieved_resume_count ?? res.solution?.knowledge_context?.candidate_count ?? 0,
      };

      setMessages([...updatedMessages, assistantMsg]);
      setLastSolution(res.solution);
      if (res.conversation_id) {
        setActiveConversationId(res.conversation_id);
      }
      fetchConversations();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'AI 解决方案助手回答失败，请稍后重试'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleFeedback = async (msgIndex: number, type: 'useful' | 'not_useful') => {
    setMessages((prev) =>
      prev.map((m, idx) => (idx === msgIndex ? { ...m, feedback: type } : m))
    );
    try {
      await request.post('/ai-employees/feedback', {
        chat_id: String(msgIndex),
        feedback_type: type,
      });
      toast.success(type === 'useful' ? '感谢您的好评反馈！' : '感谢您的反馈，我们将持续优化生成策略');
    } catch {
      toast.success('反馈提交成功');
    }
  };

  const saveSolutionToKnowledgeAssets = async () => {
    if (!lastSolution) {
      toast.warning('暂无生成的解决方案可沉淀');
      return;
    }
    setSavingAsset(true);
    try {
      await request.post('/ai-employees/save-to-knowledge-asset', {
        title: lastSolution.title || 'AI 业务解决方案',
        summary: lastSolution.summary || '基于 AI 解决方案助手提炼生成的打法',
        solution_data: lastSolution,
        industry_tag: selectedIndustries[0] || '通用业务',
        evidence_tags: ['解决方案', '方法论沉淀'],
      });
      toast.success('已成功沉淀至【知识资产库】！');
    } catch (error) {
      toast.error(getApiErrorMessage(error, '沉淀至知识资产库失败'));
    } finally {
      setSavingAsset(false);
    }
  };

  const exportSolutionDoc = () => {
    if (!messages.length) {
      toast.warning('暂无对话内容可导出');
      return;
    }
    const lastAsst = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!lastAsst) return;

    const blob = new Blob([lastAsst.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${lastSolution?.title || 'AI解决方案'}_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('已导出 Markdown 方案文档');
  };

  const createCustomerProject = async () => {
    if (!lastSolution) {
      toast.warning('暂无生成的解决方案可转换为客户项目');
      return;
    }
    setCreatingProject(true);
    try {
      const project = (await request.post('/customer-projects/from-agent-solution', {
        industry: selectedIndustries[0] || '客户业务优化',
        business_type: lastSolution.title || 'AI 解决方案项目',
        current_process: lastSolution.summary || '基于 AI 解决方案助手生成',
        pain_points: lastSolution.risks || [],
        goals: lastSolution.needed_capabilities || [],
        solution: lastSolution,
      })) as any;
      toast.success('已成功转换为客户项目卷宗');
      navigate(`/customer-projects/${project.id}`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, '转换客户项目失败'));
    } finally {
      setCreatingProject(false);
    }
  };

  const filteredConversations = conversations.filter((c) =>
    (c.title || '').toLowerCase().includes(historySearchKeyword.toLowerCase())
  );
  const sortedConversations = [...filteredConversations].sort((a, b) =>
    (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0)
  );

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
      {/* 左侧：精简规范侧边栏 */}
      <div className="solution-sidebar-unified">
        {/* 新建对话次级按钮 */}
        <Button
          type="default"
          icon={<PlusOutlined />}
          onClick={startNewChat}
          block
          style={{
            height: '38px',
            borderRadius: '8px',
            fontWeight: 500,
            fontSize: '13px',
            borderColor: '#cbd5e1',
          }}
        >
          新建解决方案对话
        </Button>

        {/* 知识库范围可感知、可控面板入口 */}
        <div className="solution-sidebar-section-title">
          <FilterOutlined style={{ color: '#2563eb' }} /> 知识库检索范围
        </div>
        <div style={{ marginBottom: 6 }}>
          <Button
            block
            size="small"
            onClick={() => setScopeFilterVisible(true)}
            style={{
              textAlign: 'left',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderRadius: '6px',
              height: '32px',
              fontSize: '12px',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedTypes.length === 3 && !selectedIndustries.length
                ? '全量知识与人才档案'
                : `已精筛 ${selectedTypes.length} 类, ${selectedIndustries.length} 行业`}
            </span>
            <Tag color="blue" style={{ margin: 0, fontSize: '10.5px' }}>配置</Tag>
          </Button>
        </div>

        {/* 历史对话检索与清单 */}
        <div className="solution-sidebar-section-title" style={{ marginTop: 10 }}>
          <HistoryOutlined style={{ color: '#7c3aed' }} /> 历史对话记录
        </div>
        <Input
          placeholder="搜索历史对话..."
          prefix={<SearchOutlined style={{ color: '#94a3b8', fontSize: '12px' }} />}
          size="small"
          value={historySearchKeyword}
          onChange={(e) => setHistorySearchKeyword(e.target.value)}
          allowClear
          style={{ marginBottom: 8, borderRadius: '6px', fontSize: '12px' }}
        />

        <div className="solution-history-list">
          {sortedConversations.length ? (
            sortedConversations.map((item) => (
              <div
                key={item.id}
                onClick={() => openConversation(item.id)}
                className={`solution-history-item ${activeConversationId === item.id ? 'active' : ''}`}
                title={item.title || '新对话'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                  {item.is_pinned && <PushpinOutlined style={{ color: '#2563eb', fontSize: '11px' }} />}
                  <span className="solution-history-title">{item.title || '新对话'}</span>
                </div>

                <div className="item-actions">
                  <Tooltip title={item.is_pinned ? '取消置顶' : '置顶对话'}>
                    <PushpinOutlined
                      className="action-icon"
                      style={{ color: item.is_pinned ? '#2563eb' : undefined }}
                      onClick={(e) => togglePinConversation(item.id, e)}
                    />
                  </Tooltip>
                  <Tooltip title="重命名">
                    <EditOutlined
                      className="action-icon"
                      onClick={(e) => openRenameModal(item.id, item.title, e)}
                    />
                  </Tooltip>
                  <Popconfirm
                    title="确认删除该历史对话吗？"
                    onConfirm={(e) => e && deleteConversation(item.id, e as any)}
                    okText="删除"
                    cancelText="取消"
                  >
                    <DeleteOutlined className="action-icon delete" onClick={(e) => e.stopPropagation()} />
                  </Popconfirm>
                </div>
              </div>
            ))
          ) : (
            <div style={{ padding: '24px 0', textAlign: 'center' }}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <Text type="secondary" style={{ fontSize: '11.5px' }}>
                    暂无历史对话记录
                  </Text>
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* 右侧：主对话卡片 */}
      <Card
        className="chat-main-card consulting-table-card"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
          border: '1px solid #e2e8f0',
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
        {/* 顶部标题与操作 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingBottom: '12px',
            borderBottom: '1px solid #f1f5f9',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                background: '#2563eb',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <RobotOutlined style={{ fontSize: '16px' }} />
            </div>
            <div>
              <Text strong style={{ fontSize: '15px', display: 'block', lineHeight: 1.2 }}>
                {lastSolution?.title || 'AI 解决方案助手'}
              </Text>
              <Text type="secondary" style={{ fontSize: '11.5px', color: '#64748b' }}>
                面向行业场景与人才履历的智能化方案咨询平台
              </Text>
            </div>
          </div>

          <Space size="small">
            {lastSolution && (
              <>
                <Button
                  type="primary"
                  size="small"
                  icon={<ExportOutlined />}
                  loading={creatingProject}
                  onClick={createCustomerProject}
                  style={{ borderRadius: '6px', background: '#2563eb' }}
                >
                  转为客户项目
                </Button>
                <Button
                  size="small"
                  icon={<SaveOutlined />}
                  loading={savingAsset}
                  onClick={saveSolutionToKnowledgeAssets}
                  style={{ borderRadius: '6px' }}
                >
                  沉淀至知识库
                </Button>
                <Button size="small" icon={<FileTextOutlined />} onClick={exportSolutionDoc} style={{ borderRadius: '6px' }}>
                  导出文档
                </Button>
              </>
            )}
            {messages.length > 0 && (
              <Popconfirm title="确认清空当前对话吗？" onConfirm={startNewChat} okText="清空" cancelText="取消">
                <Button icon={<ClearOutlined />} size="small" danger style={{ borderRadius: '6px' }}>
                  清空
                </Button>
              </Popconfirm>
            )}
          </Space>
        </div>

        {/* 问答主视图区 */}
        {messages.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '10px 0',
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '12px',
                background: '#eff6ff',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <RobotOutlined style={{ fontSize: '26px' }} />
            </div>
            <Title level={4} style={{ marginBottom: 4, fontWeight: 600 }}>
              AI 解决方案助手
            </Title>
            <Text type="secondary" style={{ fontSize: '13px', marginBottom: 20, color: '#64748b' }}>
              输入您的业务需求，调取私有人才库档案与强证据知识资产，生成结构化可落地方案
            </Text>

            {/* 规整 2×2 网格场景预设卡片 */}
            <Row gutter={[12, 12]} style={{ width: '100%', maxWidth: '720px', marginBottom: 12 }}>
              {PRESET_SCENARIOS.map((item) => (
                <Col xs={24} sm={12} key={item.title}>
                  <div className="preset-prompt-card" onClick={() => handleSendPrompt(item.prompt)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: '13.5px', color: '#1e293b' }}>
                        {item.icon} {item.title}
                      </span>
                      <Tag className={`tag-semantic-${item.color === 'blue' ? 'talent' : item.color === 'purple' ? 'solution' : item.color === 'green' ? 'evidence' : 'position'}`} style={{ margin: 0, fontSize: '10.5px' }}>
                        {item.tag}
                      </Tag>
                    </div>
                    <Text type="secondary" style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5, display: 'block' }}>
                      {item.subtitle}
                    </Text>
                  </div>
                </Col>
              ))}
            </Row>
          </div>
        ) : (
          /* 消息流模式 */
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
                      borderRadius: '8px',
                      background: msg.role === 'user' ? '#2563eb' : '#7c3aed',
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

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
                    {/* 检索实时提示（在助手气泡上方） */}
                    {msg.role === 'assistant' && (
                      <div className="rag-scope-badge">
                        <FileSearchOutlined /> 本次已检索 {msg.retrieved_project_count ?? 0} 份项目经验、{msg.retrieved_resume_count ?? 0} 份人才履历档案
                      </div>
                    )}

                    <div className={`chat-bubble chat-bubble-${msg.role}`}>
                      {msg.role === 'assistant' ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      ) : (
                        msg.content
                      )}
                    </div>

                    {/* 检索溯源折叠卡片 */}
                    {msg.role === 'assistant' && (
                      <div>
                        <Collapse
                          ghost
                          className="rag-trace-collapse"
                          items={[
                            {
                              key: '1',
                              label: (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '12px', fontWeight: 600, color: '#2563eb' }}>
                                  <FileSearchOutlined /> 检索引用线索 ({msg.evidence?.length || 0} 项素材)
                                </span>
                              ),
                              children: (
                                <div className="rag-trace-content">
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                                            style={{
                                              padding: '8px 12px',
                                              background: '#f8fafc',
                                              borderRadius: '6px',
                                              border: '1px solid #e2e8f0',
                                              cursor: 'pointer',
                                              display: 'flex',
                                              justifyContent: 'space-between',
                                              alignItems: 'center',
                                            }}
                                          >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                                              <Tag color={item.candidate_name ? 'blue' : 'purple'} style={{ margin: 0, fontSize: '10.5px' }}>
                                                {labelType}
                                              </Tag>
                                              <Text ellipsis style={{ fontSize: '12px', fontWeight: 500 }}>
                                                [{idx + 1}] {titleStr}
                                              </Text>
                                            </div>
                                            <Tag color="green" style={{ margin: 0, fontSize: '10.5px' }}>
                                              <LinkOutlined /> 查看依据
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
                                </div>
                              ),
                            },
                          ]}
                        />

                        {/* 回答底部反馈与复制按钮栏 */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                          <Space size="small">
                            <Tooltip title="方案有用">
                              <Button
                                type="text"
                                size="small"
                                icon={<LikeOutlined style={{ color: msg.feedback === 'useful' ? '#2563eb' : undefined }} />}
                                onClick={() => handleFeedback(index, 'useful')}
                                style={{ fontSize: '11.5px', color: '#64748b' }}
                              >
                                有用
                              </Button>
                            </Tooltip>
                            <Tooltip title="方案不够精准/太泛">
                              <Button
                                type="text"
                                size="small"
                                icon={<DislikeOutlined style={{ color: msg.feedback === 'not_useful' ? '#ef4444' : undefined }} />}
                                onClick={() => handleFeedback(index, 'not_useful')}
                                style={{ fontSize: '11.5px', color: '#64748b' }}
                              >
                                反馈
                              </Button>
                            </Tooltip>
                          </Space>
                          <Button
                            type="text"
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={() => {
                              navigator.clipboard.writeText(msg.content);
                              toast.success('已复制回复文本到剪贴板');
                            }}
                            style={{ fontSize: '11.5px', color: '#64748b' }}
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

            {submitting && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '16px 0 16px 48px' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#2563eb' }}>
                  <LoadingOutlined style={{ fontSize: '18px' }} />
                  <Text strong style={{ fontSize: '13.5px', color: '#2563eb' }}>
                    智能体正在检索多维资产并推演解决方案…
                  </Text>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 底部输入框区域 */}
        <div className="solution-chat-input-wrapper" style={{ marginTop: 10 }}>
          <Input.TextArea
            rows={3}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="输入您的业务咨询，如：分析大厂工程专家的打法，或针对传统零售企业输出私域流量数字化方案..."
            variant="borderless"
            style={{ resize: 'none', fontSize: '13.5px', minHeight: '68px' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSendPrompt(inputText);
              }
            }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 6,
              paddingTop: 6,
              borderTop: '1px solid #f1f5f9',
            }}
          >
            <Space size="small">
              <Tooltip title="上传关联文档/标书">
                <Button type="text" size="small" icon={<PaperClipOutlined />} style={{ color: '#64748b' }}>
                  附件
                </Button>
              </Tooltip>
              <Popover
                trigger="click"
                placement="topLeft"
                content={
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: '280px' }}>
                    <Text strong style={{ fontSize: '12px' }}>快捷 Prompt 模版</Text>
                    {PROMPT_TEMPLATES.map((tmpl, idx) => (
                      <div
                        key={idx}
                        onClick={() => setInputText(tmpl)}
                        style={{
                          padding: '6px 8px',
                          background: '#f8fafc',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        {tmpl}
                      </div>
                    ))}
                  </div>
                }
              >
                <Button type="text" size="small" icon={<BulbOutlined />} style={{ color: '#64748b' }}>
                  模版
                </Button>
              </Popover>
            </Space>

            <Space size="small">
              <Text type="secondary" style={{ fontSize: '11px', color: '#94a3b8' }}>
                Cmd / Ctrl + Enter 发送
              </Text>
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={submitting}
                disabled={!inputText.trim()}
                onClick={() => handleSendPrompt(inputText)}
                style={{ borderRadius: '6px', padding: '0 20px', height: '34px', fontWeight: 600, background: '#2563eb' }}
              >
                发送
              </Button>
            </Space>
          </div>
        </div>
      </Card>

      {/* 知识库高级检索面板 Modal */}
      <Modal
        open={scopeFilterVisible}
        onCancel={() => setScopeFilterVisible(false)}
        onOk={() => setScopeFilterVisible(false)}
        title="🔍 知识库检索范围精准配置"
        okText="保存配置"
        cancelText="关闭"
        width={500}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
          <div>
            <Text strong style={{ fontSize: '13px', display: 'block', marginBottom: 8 }}>
              1. 检索知识资产类型 (多选)
            </Text>
            <Checkbox.Group
              options={KNOWLEDGE_TYPE_OPTIONS}
              value={selectedTypes}
              onChange={(vals) => setSelectedTypes(vals as string[])}
              style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
            />
          </div>

          <div>
            <Text strong style={{ fontSize: '13px', display: 'block', marginBottom: 8 }}>
              2. 限制目标行业领域 (可选)
            </Text>
            <Select
              mode="multiple"
              placeholder="默认检索全行业，可指定特定行业"
              value={selectedIndustries}
              onChange={(vals) => setSelectedIndustries(vals)}
              style={{ width: '100%' }}
              options={INDUSTRY_OPTIONS.map((i) => ({ label: i, value: i }))}
            />
          </div>
        </div>
      </Modal>

      {/* 重命名对话 Modal */}
      <Modal
        open={renameModalVisible}
        onCancel={() => setRenameModalVisible(false)}
        onOk={saveRenamedTitle}
        title="修改对话标题"
        okText="保存"
        cancelText="取消"
        width={400}
      >
        <Input
          value={editingTitleText}
          onChange={(e) => setEditingTitleText(e.target.value)}
          placeholder="请输入新的对话标题..."
        />
      </Modal>

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
              <Text type="secondary" style={{ display: 'block', fontSize: '12px', marginBottom: 4 }}>
                来源实体名称
              </Text>
              <Text strong style={{ fontSize: '15px' }}>
                {detailDrawerItem.candidate_name
                  ? `${detailDrawerItem.candidate_name} - ${detailDrawerItem.company || ''} ${detailDrawerItem.role || ''}`
                  : detailDrawerItem.project_name || detailDrawerItem.title || '知识记录'}
              </Text>
            </div>

            {detailDrawerItem.solution && (
              <div>
                <Text type="secondary" style={{ display: 'block', fontSize: '12px', marginBottom: 4 }}>
                  解决方案 / 核心项目打法
                </Text>
                <Paragraph style={{ margin: 0, background: '#f8fafc', padding: 12, borderRadius: 6, fontSize: '13px', lineHeight: '1.6' }}>
                  {detailDrawerItem.solution}
                </Paragraph>
              </div>
            )}

            {detailDrawerItem.summary && (
              <div>
                <Text type="secondary" style={{ display: 'block', fontSize: '12px', marginBottom: 4 }}>
                  概要与核心摘要
                </Text>
                <Paragraph style={{ margin: 0, fontSize: '13px' }}>{detailDrawerItem.summary}</Paragraph>
              </div>
            )}

            {detailDrawerItem.resume_id && (
              <div style={{ marginTop: 16 }}>
                <Button
                  type="primary"
                  block
                  icon={<LinkOutlined />}
                  onClick={() => {
                    const id = detailDrawerItem.resume_id;
                    setDetailDrawerItem(null);
                    navigate(`/resumes/${id}`);
                  }}
                  style={{ background: '#2563eb' }}
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
