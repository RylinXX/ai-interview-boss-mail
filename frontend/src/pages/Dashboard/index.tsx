import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Card, Col, Empty, Input, Pagination, Row, Segmented, Space, Spin, Table, Tag, Typography, Tabs, Drawer, Form } from 'antd';
import {
  ApartmentOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  DatabaseOutlined,
  EditOutlined,
  FileTextOutlined,
  ProjectOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  UserOutlined,
} from '@ant-design/icons';
import request, { getApiErrorMessage } from '../../utils/request';
import { AsyncState, ModulePageHeader, ResponsiveDataView, SensitiveField } from '../../components/Workbench';
import '../BusinessWorkbench.css';

const { Text, Paragraph } = Typography;

const ANT_COLOR_MAP: Record<string, string> = {
  blue: '#1890ff',
  gold: '#faad14',
  volcano: '#fa541c',
  purple: '#722ed1',
  cyan: '#13c2c2',
  green: '#52c41a',
  geekblue: '#2f54eb',
  lime: '#a0d911',
  magenta: '#eb2f96',
  red: '#f5222d',
  orange: '#fa8c16',
  default: '#8c8c8c',
};

const getValidCssColor = (colorName?: string, defaultFallback: string = '#1890ff') => {
  if (!colorName) return defaultFallback;
  if (colorName.startsWith('#') || colorName.startsWith('rgb') || colorName.startsWith('var(')) {
    return colorName;
  }
  return ANT_COLOR_MAP[colorName] || defaultFallback;
};

type ExperienceSummary = {
  resume_count: number;
  work_experiences: any[];
  project_experiences: any[];
  logic_analyses: any[];
  industry_summary?: IndustrySummary[];
};

type ProjectLibrary = {
  resume_count: number;
  project_count: number;
  projects: any[];
  industry_summary?: IndustrySummary[];
};

type IndustrySummary = {
  industry_key: string;
  industry_label: string;
  industry_color?: string;
  resume_count: number;
  project_count: number;
  work_count?: number;
  company_count?: number;
};

type ResumeMetrics = {
  total: number;
  success: number;
  processing: number;
  failed: number;
  pending: number;
};

const EMPTY_RESUME_METRICS: ResumeMetrics = {
  total: 0,
  success: 0,
  processing: 0,
  failed: 0,
  pending: 0,
};

const projectHasBusinessGap = (project: any) => {
  const missing = Array.isArray(project.missing_evidence) ? project.missing_evidence : [];
  return missing.length > 0 || !project.business_model;
};

const projectMatchesKeyword = (project: any, keyword: string) => {
  if (!keyword) return true;
  const values = [
    project.name,
    project.candidate_name,
    project.role,
    project.problem,
    project.solution,
    project.business_model,
    project.logic_analysis,
    ...(Array.isArray(project.missing_evidence) ? project.missing_evidence : []),
    ...(Array.isArray(project.landing_ideas) ? project.landing_ideas : []),
  ];
  return values.some(value => String(value || '').toLowerCase().includes(keyword));
};

const valuesMatchKeyword = (values: any[], keyword: string) => {
  if (!keyword) return true;
  return values.some(value => String(value || '').toLowerCase().includes(keyword));
};

const itemMatchesIndustry = (item: any, industryKey: string) => {
  return industryKey === 'all' || item.industry_key === industryKey;
};

const Dashboard: React.FC = () => {
  const { message } = App.useApp();
  const [resumeMetrics, setResumeMetrics] = useState<ResumeMetrics>(EMPTY_RESUME_METRICS);
  const [summary, setSummary] = useState<ExperienceSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const dashboardRequestIdRef = useRef(0);
  const [projectLibrary, setProjectLibrary] = useState<ProjectLibrary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [projectKeyword, setProjectKeyword] = useState('');
  const [projectScope, setProjectScope] = useState<'all' | 'gaps'>('all');
  const [industryScope, setIndustryScope] = useState('all');
  const [candidateKeyword, setCandidateKeyword] = useState('');
  const [workKeyword, setWorkKeyword] = useState('');
  const [activeTab, setActiveTab] = useState('projects');
  const [projectMobilePage, setProjectMobilePage] = useState(1);
  const [capabilityMobilePage, setCapabilityMobilePage] = useState(1);
  const [workMobilePage, setWorkMobilePage] = useState(1);

  // 人机协同微标注 State
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [editType, setEditType] = useState<'project' | 'capability' | 'work' | null>(null);
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);
  const [selectedResume, setSelectedResume] = useState<any | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [editingProjectIndex, setEditingProjectIndex] = useState<number>(-1);
  const [editingWorkIndex, setEditingWorkIndex] = useState<number>(-1);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [aiQuestion, setAiQuestion] = useState('');

  const [form] = Form.useForm();

  const fetchSummary = useCallback(async (requestId = ++dashboardRequestIdRef.current) => {
    if (requestId !== dashboardRequestIdRef.current) return;
    setSummaryLoading(true);
    setSummaryError(null);
    setSummary(null);
    try {
      const summaryRes = await request.get('/resumes/experience-summary', { timeout: 20000 });
      if (requestId === dashboardRequestIdRef.current) {
        setSummary(summaryRes as ExperienceSummary);
      }
    } catch (error) {
      if (requestId === dashboardRequestIdRef.current) {
        const errorMessage = getApiErrorMessage(error, '能力摘要加载失败，请重试');
        setSummaryError(errorMessage);
        message.warning(errorMessage);
      }
    } finally {
      if (requestId === dashboardRequestIdRef.current) {
        setSummaryLoading(false);
      }
    }
  }, [message]);

  const fetchData = useCallback(async (initialLoad = false) => {
    const requestId = ++dashboardRequestIdRef.current;
    setSummaryLoading(true);
    setSummaryError(null);
    setSummary(null);
    if (initialLoad) {
      setLoading(true);
      setLoadError(null);
    } else {
      setRefreshing(true);
    }
    try {
      const [resumeRes, projectRes] = await Promise.all([
        request.get('/resumes/metrics'),
        request.get('/resumes/project-library', { timeout: 20000 }),
      ]);
      if (requestId !== dashboardRequestIdRef.current) return;
      setResumeMetrics(resumeRes as ResumeMetrics);
      setProjectLibrary(projectRes as ProjectLibrary);
      setLoading(false);

      await fetchSummary(requestId);
    } catch (error) {
      if (requestId === dashboardRequestIdRef.current) {
        const errorMessage = getApiErrorMessage(error, '获取方案工作台失败，请稍后重试');
        setLoadError(errorMessage);
        message.error(errorMessage);
        setSummaryLoading(false);
      }
    } finally {
      if (requestId === dashboardRequestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [fetchSummary, message]);

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  const projects = useMemo(() => projectLibrary?.projects || [], [projectLibrary?.projects]);
  const industrySummary = summary?.industry_summary || projectLibrary?.industry_summary || [];
  const activeIndustry = industrySummary.find(item => item.industry_key === industryScope);
  const normalizedKeyword = projectKeyword.trim().toLowerCase();
  const normalizedCandidateKeyword = candidateKeyword.trim().toLowerCase();
  const normalizedWorkKeyword = workKeyword.trim().toLowerCase();
  const analyzed = resumeMetrics.success;
  const processing = resumeMetrics.processing;
  const failed = resumeMetrics.failed;
  const pending = resumeMetrics.pending || 0;
  const completionRate = resumeMetrics.total ? Math.round((analyzed / resumeMetrics.total) * 100) : 0;
  const missingBusinessCount = projects.filter(projectHasBusinessGap).length;

  const filteredProjects = useMemo(
    () => projects
      .filter(project => itemMatchesIndustry(project, industryScope))
      .filter(project => (projectScope === 'gaps' ? projectHasBusinessGap(project) : true))
      .filter(project => projectMatchesKeyword(project, normalizedKeyword))
      .map((project, index) => ({
        ...project,
        _rowKey: `${project.resume_id || 'resume'}-${project.name || 'project'}-${project.role || 'role'}-${index}`,
      })),
    [industryScope, normalizedKeyword, projectScope, projects],
  );

  const candidateRows = useMemo(
    () => (summary?.logic_analyses || [])
      .filter(item => itemMatchesIndustry(item, industryScope))
      .filter(item => valuesMatchKeyword([item.candidate_name, item.analysis], normalizedCandidateKeyword))
      .map((item, index) => ({ ...item, _rowKey: `${item.resume_id || 'candidate'}-${index}`, analysis: item.analysis || item.logic_analysis })),
    [industryScope, normalizedCandidateKeyword, summary?.logic_analyses],
  );

  const workRows = useMemo(
    () => (summary?.work_experiences || [])
      .filter(item => itemMatchesIndustry(item, industryScope))
      .filter(item => valuesMatchKeyword([
        item.candidate_name,
        item.company,
        item.role,
        item.summary,
        item.industry_label,
        ...(Array.isArray(item.capabilities) ? item.capabilities : []),
      ], normalizedWorkKeyword))
      .map((item, index) => ({ ...item, _rowKey: `${item.resume_id || 'work'}-${item.company || 'company'}-${index}` })),
    [industryScope, normalizedWorkKeyword, summary?.work_experiences],
  );

  const handleMetricCardClick = (tabKey: string, scope?: 'all' | 'gaps') => {
    setActiveTab(tabKey);
    if (scope) {
      setProjectScope(scope);
    }
  };

  // 触发微标注编辑
  const startEditProject = async (record: any) => {
    setSelectedResumeId(record.resume_id);
    setSelectedResume(null);
    setEditType('project');
    setAiResult('');
    setAiQuestion('');

    setDrawerVisible(true);
    setDrawerLoading(true);
    try {
      const candidateResume = await request.get(`/resumes/${record.resume_id}`) as any;
      setSelectedResume(candidateResume);
      const projs = candidateResume.parsed_data?.project_experiences || [];
      const idx = projs.findIndex((p: any) => p.name === record.name);
      setEditingProjectIndex(idx);

      form.setFieldsValue({
        name: record.name,
        business_model: record.business_model || '',
        landing_ideas: Array.isArray(record.landing_ideas) ? record.landing_ideas.join('\n') : '',
        missing_evidence: Array.isArray(record.missing_evidence) ? record.missing_evidence.join(', ') : '',
      });
    } catch (error) {
      message.error(getApiErrorMessage(error, '读取人才样本详情失败'));
      setDrawerVisible(false);
    } finally {
      setDrawerLoading(false);
    }
  };

  const startEditCapability = async (record: any) => {
    setSelectedResumeId(record.resume_id);
    setSelectedResume(null);
    setEditType('capability');
    setAiResult('');
    setAiQuestion('');
    form.setFieldsValue({
      logic_analysis: record.analysis || '',
    });
    setDrawerVisible(true);
    setDrawerLoading(true);
    try {
      setSelectedResume(await request.get(`/resumes/${record.resume_id}`));
    } catch (error) {
      message.error(getApiErrorMessage(error, '读取人才样本详情失败'));
      setDrawerVisible(false);
    } finally {
      setDrawerLoading(false);
    }
  };

  const startEditWork = async (record: any) => {
    setSelectedResumeId(record.resume_id);
    setSelectedResume(null);
    setEditType('work');
    setAiResult('');
    setAiQuestion('');

    setDrawerVisible(true);
    setDrawerLoading(true);
    try {
      const candidateResume = await request.get(`/resumes/${record.resume_id}`) as any;
      setSelectedResume(candidateResume);
      const works = candidateResume.parsed_data?.work_experiences || [];
      const idx = works.findIndex((w: any) => w.company === record.company && w.role === record.role);
      setEditingWorkIndex(idx);

      form.setFieldsValue({
        company: record.company,
        role: record.role,
        summary: record.summary || '',
        capabilities: Array.isArray(record.capabilities) ? record.capabilities.join(', ') : '',
      });
    } catch (error) {
      message.error(getApiErrorMessage(error, '读取人才样本详情失败'));
      setDrawerVisible(false);
    } finally {
      setDrawerLoading(false);
    }
  };

  // 调用 AI 智能增补
  const handleAIAugment = async () => {
    if (!aiQuestion.trim()) {
      message.warning('请输入追问补充问题描述');
      return;
    }
    if (!selectedResumeId) return;

    setAiLoading(true);
    try {
      const projectName = form.getFieldValue('name') || '人才底层能力分析';
      const currentValue = form.getFieldValue('business_model') || form.getFieldValue('logic_analysis') || form.getFieldValue('summary') || '';

      const res = await request.post(`/resumes/${selectedResumeId}/ai-augment`, {
        project_name: projectName,
        question: aiQuestion,
        current_value: currentValue,
      }) as any;

      if (res.status === 'success') {
        setAiResult(res.suggestion || '');
        message.success('AI 补充分析生成完成！');
      } else {
        message.error('AI 补充生成失败，请重试');
      }
    } catch {
      message.error('大语言模型接口调用失败');
    } finally {
      setAiLoading(false);
    }
  };

  // 采纳 AI 结果
  const handleAdoptAIResult = () => {
    if (!aiResult) return;

    if (editType === 'project') {
      const currentVal = form.getFieldValue('business_model') || '';
      form.setFieldsValue({
        business_model: currentVal ? `${currentVal}\n\n[AI增补]: ${aiResult}` : aiResult
      });
    } else if (editType === 'capability') {
      const currentVal = form.getFieldValue('logic_analysis') || '';
      form.setFieldsValue({
        logic_analysis: currentVal ? `${currentVal}\n\n[AI增补]: ${aiResult}` : aiResult
      });
    } else if (editType === 'work') {
      const currentVal = form.getFieldValue('summary') || '';
      form.setFieldsValue({
        summary: currentVal ? `${currentVal}\n\n[AI增补]: ${aiResult}` : aiResult
      });
    }
    setAiResult('');
    setAiQuestion('');
    message.success('已成功将 AI 建议填充至当前输入框！');
  };

  // 提交修改到后端
  const handleSaveChanges = async () => {
    if (!selectedResumeId) return;

    try {
      const values = await form.validateFields();
      const candidateResume = selectedResume;
      if (!candidateResume) return;

      const parsedData = { ...(candidateResume.parsed_data || {}) };

      if (editType === 'project' && editingProjectIndex >= 0) {
        const projs = [...(parsedData.project_experiences || [])];
        if (projs[editingProjectIndex]) {
          projs[editingProjectIndex] = {
            ...projs[editingProjectIndex],
            name: values.name,
            business_model: values.business_model,
            landing_ideas: values.landing_ideas ? values.landing_ideas.split('\n').map((i: string) => i.trim()).filter(Boolean) : [],
            missing_evidence: values.missing_evidence ? values.missing_evidence.split(',').map((i: string) => i.trim()).filter(Boolean) : [],
          };
          parsedData.project_experiences = projs;
        }
      } else if (editType === 'capability') {
        parsedData.logic_analysis = values.logic_analysis;
      } else if (editType === 'work' && editingWorkIndex >= 0) {
        const works = [...(parsedData.work_experiences || [])];
        if (works[editingWorkIndex]) {
          works[editingWorkIndex] = {
            ...works[editingWorkIndex],
            company: values.company,
            role: values.role,
            summary: values.summary,
            capabilities: values.capabilities ? values.capabilities.split(',').map((i: string) => i.trim()).filter(Boolean) : [],
          };
          parsedData.work_experiences = works;
        }
      }

      const res = await request.put(`/resumes/${selectedResumeId}/parsed-data`, parsedData) as any;

      if (res.status === 'success') {
        message.success('修改已成功保存至能力库中！');
        setDrawerVisible(false);
        fetchData(false);
      }
    } catch {
      message.error('保存数据失败，请检查输入格式');
    }
  };

  const renderProjectDetail = (record: any) => (
    <div className="project-expanded-detail" style={{ padding: '16px 24px', background: '#fcfcf9', borderRadius: '8px', borderLeft: '3px solid #c9963f' }}>
      <Row gutter={[24, 16]}>
        <Col span={12}>
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>业务问题</Text>
            <Paragraph style={{ margin: 0, color: '#2c3e50', fontWeight: 500 }}>{record.problem || '未说明问题'}</Paragraph>
          </div>
          <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>解决方案</Text>
            <Paragraph style={{ margin: 0 }}>{record.solution || '未说明方案'}</Paragraph>
          </div>
        </Col>
        <Col span={12}>
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>商业模式</Text>
            <Paragraph style={{ margin: 0 }}>{record.business_model || '待追问'}</Paragraph>
          </div>
          <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>落地/创业方向</Text>
            {Array.isArray(record.landing_ideas) && record.landing_ideas.length ? (
              <Space direction="vertical" size={2}>
                {record.landing_ideas.map((idea: string, index: number) => (
                  <Text key={`${idea}-${index}`} style={{ display: 'block' }}>• {idea}</Text>
                ))}
              </Space>
            ) : (
              <Paragraph style={{ margin: 0 }}>待沉淀</Paragraph>
            )}
          </div>
        </Col>
        <Col span={24} style={{ borderTop: '1px dashed #e8e8e8', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>能力样本逻辑</Text>
            <Paragraph style={{ margin: 0 }}>{record.logic_analysis || '暂无逻辑分析'}</Paragraph>
            {Array.isArray(record.missing_evidence) && record.missing_evidence.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <Text type="secondary" style={{ marginRight: 6 }}>缺失证据:</Text>
                {record.missing_evidence.map((item: string) => <Tag color="warning" key={item}>{item}</Tag>)}
              </div>
            )}
          </div>
          <Button type="primary" size="small" icon={<EditOutlined />} onClick={() => startEditProject(record)} style={{ borderRadius: 4 }}>
            修正与 AI 增补 (微标注)
          </Button>
        </Col>
      </Row>
    </div>
  );

  const projectColumns = [
    {
      title: '项目名称与样本',
      dataIndex: 'name',
      key: 'name',
      width: '30%',
      render: (text: string, record: any) => (
        <div className="project-title-cell" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Text strong style={{ fontSize: '15px' }}>{text || '未命名项目'}</Text>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <Tag color={record.industry_color || 'default'} style={{ margin: 0 }}>{record.industry_label || '通用业务'}</Tag>
            <Tag color="blue" style={{ margin: 0 }}><SensitiveField value={record.candidate_name} /></Tag>
            {record.role && <Tag style={{ margin: 0 }}>{record.role}</Tag>}
          </div>
        </div>
      ),
    },
    {
      title: '商业模式核心',
      dataIndex: 'business_model',
      key: 'business_model',
      width: '32%',
      render: (value: string) => (
        <Paragraph ellipsis={{ rows: 2 }} style={{ margin: 0, color: '#555' }}>
          {value || '待追问'}
        </Paragraph>
      ),
    },
    {
      title: '缺失证据链',
      dataIndex: 'missing_evidence',
      key: 'missing_evidence',
      width: '20%',
      render: (value: string[]) => Array.isArray(value) && value.length ? (
        <div className="project-evidence-cell">
          {value.slice(0, 2).map(item => <Tag color="warning" key={item} style={{ margin: 0 }}>{item}</Tag>)}
          {value.length > 2 && <Tag style={{ margin: 0 }}>+{value.length - 2}</Tag>}
        </div>
      ) : <Text type="secondary">-</Text>,
    },
    {
      title: '预期创业方向',
      dataIndex: 'landing_ideas',
      key: 'landing_ideas',
      width: '18%',
      render: (value: string[]) => Array.isArray(value) && value.length ? (
        <Paragraph ellipsis={{ rows: 2 }} style={{ margin: 0 }}>{value[0]}</Paragraph>
      ) : <span style={{ color: '#ccc' }}>待沉淀</span>,
    },
  ];

  const candidateColumns = [
    {
      title: '样本人选',
      dataIndex: 'candidate_name',
      key: 'candidate_name',
      width: '22%',
      render: (value: string, record: any) => (
        <Space direction="vertical" size={4}>
          <Text strong style={{ fontSize: '15px' }}><SensitiveField value={value} /></Text>
          <Tag color={record.industry_color || 'default'} style={{ margin: 0 }}>{record.industry_label || '通用业务'}</Tag>
        </Space>
      ),
    },
    {
      title: '底层业务逻辑推演',
      dataIndex: 'analysis',
      key: 'analysis',
      width: '68%',
      render: (value: string) => (
        <Paragraph ellipsis={{ rows: 3, expandable: true, symbol: '展开全文' }} style={{ margin: 0, color: '#444', lineHeight: '1.6' }}>
          {value || '暂无逻辑分析'}
        </Paragraph>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: '10%',
      align: 'center' as const,
      render: (_: any, record: any) => (
        <Button className="dashboard-fix-button" type="link" icon={<EditOutlined />} onClick={() => startEditCapability(record)}>
          修正
        </Button>
      ),
    }
  ];

  const workColumns = [
    {
      title: '经历人选',
      dataIndex: 'candidate_name',
      key: 'candidate_name',
      width: '15%',
      render: (value: string) => <Text strong><SensitiveField value={value} /></Text>,
    },
    {
      title: '任职公司与角色',
      key: 'company_role',
      width: '28%',
      render: (_: any, record: any) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Text strong style={{ color: '#2c3e50' }}>{record.company || '未命名公司'}</Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>{record.role || '角色未明'}</Text>
          <div>
            <Tag color={record.industry_color || 'default'} style={{ margin: 0, marginTop: 4 }}>{record.industry_label || '通用业务'}</Tag>
          </div>
        </div>
      ),
    },
    {
      title: '任职经历概要',
      dataIndex: 'summary',
      key: 'summary',
      width: '33%',
      render: (value: string) => (
        <Paragraph ellipsis={{ rows: 3, expandable: true, symbol: '展开' }} style={{ margin: 0, color: '#555' }}>
          {value || '暂无概要'}
        </Paragraph>
      ),
    },
    {
      title: '提炼能力标签',
      dataIndex: 'capabilities',
      key: 'capabilities',
      width: '16%',
      render: (value: string[]) => Array.isArray(value) && value.length ? (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {value.slice(0, 3).map(item => <Tag key={item} style={{ margin: 0 }}>{item}</Tag>)}
          {value.length > 3 && <Tag style={{ margin: 0 }}>+{value.length - 3}</Tag>}
        </div>
      ) : <Text type="secondary">-</Text>,
    },
    {
      title: '操作',
      key: 'action',
      width: 90,
      fixed: 'right' as const,
      className: 'actions-column',
      render: (_: any, record: any) => (
        <Button className="dashboard-fix-button" type="link" icon={<EditOutlined />} onClick={() => startEditWork(record)}>
          修正
        </Button>
      ),
    }
  ];

  const projectMobileCurrent = Math.min(projectMobilePage, Math.max(1, Math.ceil(filteredProjects.length / 6)));
  const capabilityMobileCurrent = Math.min(capabilityMobilePage, Math.max(1, Math.ceil(candidateRows.length / 6)));
  const workMobileCurrent = Math.min(workMobilePage, Math.max(1, Math.ceil(workRows.length / 6)));

  const totalProjects = projectLibrary?.project_count || projects.length;
  const totalAssets = (summary?.work_experiences?.length || 0) + (projects.length) + (summary?.logic_analyses?.length || 0);
  const highConfidenceAssets = analyzed;
  const strongProofAssets = Math.round(totalAssets * 0.85);

  return (
    <div className="workbench-page dashboard-page">
      <ModulePageHeader
        eyebrow={<><DatabaseOutlined /> 业务控制台</>}
        title="方案工作台"
        description="集中查看人才样本、项目打法、任职经历与能力逻辑，优先处理证据缺口。"
        actions={<Button icon={<ReloadOutlined />} loading={refreshing} onClick={() => fetchData(false)}>刷新数据</Button>}
      />

      <AsyncState loading={loading} error={loadError} onRetry={() => fetchData(true)}>
        <>

          {/* 首屏可视化图表与数据看板区 */}
          <div className="dashboard-chart-grid">
            {/* 图表 1: 样本解析成功率与状态环形图 */}
            <Card
              className="dashboard-chart-card"
              title={<><BulbOutlined style={{ color: '#722ed1', marginRight: 6 }} /> 样本解析状态与成功率</>}
            >
              <div className="donut-chart-wrapper">
                <div className="donut-svg-container">
                  <svg width="140" height="140" viewBox="0 0 140 140">
                    <circle cx="70" cy="70" r="52" fill="none" stroke="#f0f0f0" strokeWidth="16" />
                    {/* 成功 segment */}
                    <circle
                      cx="70"
                      cy="70"
                      r="52"
                      fill="none"
                      stroke="#52c41a"
                      strokeWidth="16"
                      strokeDasharray={`${(analyzed / (resumeMetrics.total || 1)) * 326.7} 326.7`}
                      strokeDashoffset="0"
                      transform="rotate(-90 70 70)"
                    />
                    {/* 解析中 segment */}
                    <circle
                      cx="70"
                      cy="70"
                      r="52"
                      fill="none"
                      stroke="#1890ff"
                      strokeWidth="16"
                      strokeDasharray={`${(processing / (resumeMetrics.total || 1)) * 326.7} 326.7`}
                      strokeDashoffset={`-${(analyzed / (resumeMetrics.total || 1)) * 326.7}`}
                      transform="rotate(-90 70 70)"
                    />
                    {/* 待分析 segment */}
                    <circle
                      cx="70"
                      cy="70"
                      r="52"
                      fill="none"
                      stroke="#faad14"
                      strokeWidth="16"
                      strokeDasharray={`${(pending / (resumeMetrics.total || 1)) * 326.7} 326.7`}
                      strokeDashoffset={`-${((analyzed + processing) / (resumeMetrics.total || 1)) * 326.7}`}
                      transform="rotate(-90 70 70)"
                    />
                    {/* 失败 segment */}
                    <circle
                      cx="70"
                      cy="70"
                      r="52"
                      fill="none"
                      stroke="#f5222d"
                      strokeWidth="16"
                      strokeDasharray={`${(failed / (resumeMetrics.total || 1)) * 326.7} 326.7`}
                      strokeDashoffset={`-${((analyzed + processing + pending) / (resumeMetrics.total || 1)) * 326.7}`}
                      transform="rotate(-90 70 70)"
                    />
                  </svg>
                  <div className="donut-center-text">
                    <div className="donut-center-rate">{completionRate}%</div>
                    <div className="donut-center-label">成功率</div>
                  </div>
                </div>

                <div className="donut-legend-list">
                  <div className="donut-legend-item">
                    <span><span className="donut-legend-dot" style={{ background: '#52c41a' }} />解析成功</span>
                    <strong>{analyzed} <Text type="secondary">({Math.round((analyzed / (resumeMetrics.total || 1)) * 100)}%)</Text></strong>
                  </div>
                  <div className="donut-legend-item">
                    <span><span className="donut-legend-dot" style={{ background: '#1890ff' }} />分析中</span>
                    <strong>{processing} <Text type="secondary">({Math.round((processing / (resumeMetrics.total || 1)) * 100)}%)</Text></strong>
                  </div>
                  {pending > 0 && (
                    <div className="donut-legend-item">
                      <span><span className="donut-legend-dot" style={{ background: '#faad14' }} />待处理/待分析</span>
                      <strong>{pending} <Text type="secondary">({Math.round((pending / (resumeMetrics.total || 1)) * 100)}%)</Text></strong>
                    </div>
                  )}
                  <div className="donut-legend-item">
                    <span><span className="donut-legend-dot" style={{ background: '#f5222d' }} />需处理/失败</span>
                    <strong>{failed} <Text type="secondary">({Math.round((failed / (resumeMetrics.total || 1)) * 100)}%)</Text></strong>
                  </div>
                </div>
              </div>
            </Card>

            {/* 图表 2: 行业方向分布条形图 */}
            <Card
              className="dashboard-chart-card"
              title={<><DatabaseOutlined style={{ color: '#1890ff', marginRight: 6 }} /> 行业方向沉淀分布</>}
            >
              <div className="industry-bar-chart-list">
                {industrySummary.slice(0, 5).map(item => {
                  const maxCount = Math.max(...industrySummary.map(i => i.resume_count), 1);
                  const pct = Math.round((item.resume_count / maxCount) * 100);
                  const isSelected = industryScope === item.industry_key;
                  return (
                    <div
                      key={item.industry_key}
                      className={`industry-bar-item${isSelected ? ' active' : ''}`}
                      onClick={() => setIndustryScope(isSelected ? 'all' : item.industry_key)}
                    >
                      <div className="industry-bar-head">
                        <Text strong style={{ fontSize: '12px' }}>{item.industry_label}</Text>
                        <Text type="secondary" style={{ fontSize: '11px' }}>
                          {item.resume_count}人 / {item.project_count}项目
                        </Text>
                      </div>
                      <div className="industry-bar-track">
                        <div
                          className="industry-bar-fill"
                          style={{
                            width: `${pct}%`,
                            background: isSelected ? 'var(--primary-color)' : getValidCssColor(item.industry_color, '#1890ff')
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* 屏下明细区：项目经验 / 人才样本 / 公司经历 明细表 */}
          <Card
            className="workbench-main-workspace consulting-table-card"
            title={(
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ display: 'inline-block', width: 4, height: 16, background: 'linear-gradient(180deg, #d4af37 0%, #c9963f 100%)', borderRadius: 2 }} />
                    📊 知识资产、人才样本与项目打法库
                  </span>
                </div>
                <Text type="secondary" style={{ fontSize: '12px', fontWeight: 400 }}>
                  按板块查看提炼的项目打法、能力证据与履历画像
                </Text>
              </div>
            )}
            styles={{ body: { padding: '16px 24px 24px 24px' } }}
            style={{ marginTop: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)' }}
          >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          size="middle"
          type="line"
          tabBarGutter={16}
          items={[
            {
              key: 'projects',
              label: (
                <span className="dashboard-tab-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <ProjectOutlined style={{ color: '#722ed1' }} />
                  <span>项目打法库</span>
                  <Tag color="purple" style={{ margin: 0, borderRadius: 10, fontSize: '11px' }}>{totalProjects} 项</Tag>
                  {missingBusinessCount > 0 && (
                    <Tag color="warning" style={{ margin: 0, borderRadius: 10, fontSize: '11px' }}>缺口 {missingBusinessCount}</Tag>
                  )}
                </span>
              ),
              children: (
                <div>
                  {/* 项目库工具栏 */}
                  <div className="project-library-toolbar" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Space size="middle" style={{ flex: 1, minWidth: '280px' }}>
                      <Input
                        allowClear
                        prefix={<SearchOutlined />}
                        placeholder="搜索项目、样本、商业模式..."
                        value={projectKeyword}
                        onChange={(event) => setProjectKeyword(event.target.value)}
                        style={{ width: 300 }}
                      />
                      {activeIndustry && (
                        <Tag color={activeIndustry.industry_color || 'gold'} style={{ margin: 0 }}>
                          已按 {activeIndustry.industry_label} 筛选
                        </Tag>
                      )}
                    </Space>
                    <Space size="middle">
                      <Segmented
                        value={projectScope}
                        onChange={(value) => setProjectScope(value as 'all' | 'gaps')}
                        options={[
                          { label: `全量项目 (${projects.filter(p => itemMatchesIndustry(p, industryScope)).length})`, value: 'all' },
                          { label: `存在商业缺口 (${projects.filter(p => itemMatchesIndustry(p, industryScope)).filter(projectHasBusinessGap).length})`, value: 'gaps' },
                        ]}
                      />
                      <Button icon={<ReloadOutlined />} loading={refreshing} onClick={() => fetchData(false)}>
                        同步
                      </Button>
                    </Space>
                  </div>

                  {filteredProjects.length ? (
                    <ResponsiveDataView
                      desktop={(
                        <Table
                          className="project-library-card"
                          rowKey={(record) => record._rowKey}
                          dataSource={filteredProjects}
                          columns={projectColumns}
                          expandable={{
                            expandedRowRender: renderProjectDetail,
                            rowExpandable: () => true,
                          }}
                          pagination={{ pageSize: 6, showSizeChanger: false }}
                          tableLayout="fixed"
                          scroll={{ x: 980 }}
                          size="middle"
                        />
                      )}
                      mobile={(
                        <>
                          <div className="mobile-record-grid">
                            {filteredProjects.slice((projectMobileCurrent - 1) * 6, projectMobileCurrent * 6).map(record => (
                              <article className="mobile-record-card" key={record._rowKey}>
                                <div className="mobile-record-head">
                                  <div className="mobile-record-title">
                                    <strong>{record.name || '未命名项目'}</strong>
                                    <span><SensitiveField value={record.candidate_name} /> · {record.role || '角色待补充'}</span>
                                  </div>
                                  <Tag color={record.industry_color || 'default'}>{record.industry_label || '通用业务'}</Tag>
                                </div>
                                <p className="mobile-record-summary">{record.business_model || record.problem || '商业模式待追问'}</p>
                                <div className="mobile-record-meta">
                                  <span>缺失证据 {record.missing_evidence?.length || 0}</span>
                                  <span>落地方向 {record.landing_ideas?.length || 0}</span>
                                </div>
                                <div className="mobile-record-actions">
                                  <Button icon={<EditOutlined />} onClick={() => startEditProject(record)}>修正与增补</Button>
                                </div>
                              </article>
                            ))}
                          </div>
                          {filteredProjects.length > 6 ? <Pagination simple current={projectMobileCurrent} pageSize={6} total={filteredProjects.length} onChange={setProjectMobilePage} /> : null}
                        </>
                      )}
                    />
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={projects.length ? '没有匹配的行业或关键字项目' : '暂无项目经历'} />
                  )}
                </div>
              )
            },
            {
              key: 'capabilities',
              label: (
                <span className="dashboard-tab-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <BulbOutlined style={{ color: '#1890ff' }} />
                  <span>人才能力样本库</span>
                  <Tag color="blue" style={{ margin: 0, borderRadius: 10, fontSize: '11px' }}>{candidateRows.length} 人</Tag>
                  <Tag color="success" style={{ margin: 0, borderRadius: 10, fontSize: '11px' }}>已解析 {analyzed}</Tag>
                </span>
              ),
              children: (
                <AsyncState loading={summaryLoading} error={summaryError} onRetry={() => fetchSummary()}>
                  <div>
                  {/* 能力库工具栏 */}
                  <div className="dashboard-library-toolbar" style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
                    <Input
                      allowClear
                      prefix={<SearchOutlined />}
                      placeholder="搜索样本人选、底层商业逻辑..."
                      value={candidateKeyword}
                      onChange={(event) => {
                        setCandidateKeyword(event.target.value);
                        setCapabilityMobilePage(1);
                      }}
                      style={{ width: 300 }}
                    />
                    <Text type="secondary" style={{ fontSize: '13px' }}><BulbOutlined /> 基于 AI 对简历样本提取的核心交付与论证能力链路</Text>
                  </div>

                  {candidateRows.length ? (
                    <ResponsiveDataView
                      desktop={<Table rowKey={(record) => record._rowKey} dataSource={candidateRows} columns={candidateColumns} pagination={{ pageSize: 6, showSizeChanger: false }} scroll={{ x: 820 }} size="middle" />}
                      mobile={(
                        <>
                          <div className="mobile-record-grid">
                            {candidateRows.slice((capabilityMobileCurrent - 1) * 6, capabilityMobileCurrent * 6).map(record => (
                              <article className="mobile-record-card" key={record._rowKey}>
                                <div className="mobile-record-head">
                                  <div className="mobile-record-title">
                                    <strong><SensitiveField value={record.candidate_name} /></strong>
                                    <span>{record.industry_label || '通用业务'}</span>
                                  </div>
                                </div>
                                <p className="mobile-record-summary">{record.analysis || '暂无逻辑分析'}</p>
                                <div className="mobile-record-actions"><Button icon={<EditOutlined />} onClick={() => startEditCapability(record)}>修正逻辑</Button></div>
                              </article>
                            ))}
                          </div>
                          {candidateRows.length > 6 ? <Pagination simple current={capabilityMobileCurrent} pageSize={6} total={candidateRows.length} onChange={setCapabilityMobilePage} /> : null}
                        </>
                      )}
                    />
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无匹配的人才能力逻辑" />
                  )}
                  </div>
                </AsyncState>
              )
            },
            {
              key: 'works',
              label: (
                <span className="dashboard-tab-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <ApartmentOutlined style={{ color: '#fa8c16' }} />
                  <span>任职经历与知识资产库</span>
                  <Tag color="orange" style={{ margin: 0, borderRadius: 10, fontSize: '11px' }}>{workRows.length} 条</Tag>
                </span>
              ),
              children: (
                <AsyncState loading={summaryLoading} error={summaryError} onRetry={() => fetchSummary()}>
                  <div>
                  {/* 工作经验工具栏 */}
                  <div className="dashboard-library-toolbar" style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
                    <Input
                      allowClear
                      prefix={<SearchOutlined />}
                      placeholder="搜索样本、公司、职位、行业经验、技术栈等..."
                      value={workKeyword}
                      onChange={(event) => {
                        setWorkKeyword(event.target.value);
                        setWorkMobilePage(1);
                      }}
                      style={{ width: 320 }}
                    />
                    <Text type="secondary" style={{ fontSize: '13px' }}>提炼多位高管及骨干经历，证明“做过类似业务，有过类似产出”</Text>
                  </div>

                  {workRows.length ? (
                    <ResponsiveDataView
                      desktop={<Table rowKey={(record) => record._rowKey} dataSource={workRows} columns={workColumns} pagination={{ pageSize: 6, showSizeChanger: false }} scroll={{ x: 980 }} size="middle" />}
                      mobile={(
                        <>
                          <div className="mobile-record-grid">
                            {workRows.slice((workMobileCurrent - 1) * 6, workMobileCurrent * 6).map(record => (
                              <article className="mobile-record-card" key={record._rowKey}>
                                <div className="mobile-record-head">
                                  <div className="mobile-record-title">
                                    <strong>{record.company || '未命名公司'}</strong>
                                    <span><SensitiveField value={record.candidate_name} /> · {record.role || '角色待补充'}</span>
                                  </div>
                                  <Tag color={record.industry_color || 'default'}>{record.industry_label || '通用业务'}</Tag>
                                </div>
                                <p className="mobile-record-summary">{record.summary || '暂无概要'}</p>
                                <div className="mobile-record-meta"><span>能力标签 {record.capabilities?.length || 0}</span></div>
                                <div className="mobile-record-actions"><Button icon={<EditOutlined />} onClick={() => startEditWork(record)}>修正经历</Button></div>
                              </article>
                            ))}
                          </div>
                          {workRows.length > 6 ? <Pagination simple current={workMobileCurrent} pageSize={6} total={workRows.length} onChange={setWorkMobilePage} /> : null}
                        </>
                      )}
                    />
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无匹配的公司任职经验" />
                  )}
                  </div>
                </AsyncState>
              )
            }
          ]}
        />
      </Card>
        </>
      </AsyncState>

      {/* 人机协同微标注侧边抽屉 */}
      <Drawer
        title={
          <span style={{ fontSize: '16px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 6 }}>
            <EditOutlined style={{ color: '#c9963f' }} />
            {editType === 'project' && '修改项目经验与商业打法'}
            {editType === 'capability' && '修正人才底层能力逻辑'}
            {editType === 'work' && '修正高管履历任职经历'}
            <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#999' }}>(人机协同微标注)</span>
          </span>
        }
        placement="right"
        size={560}
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
        extra={
          <Space>
            <Button onClick={() => setDrawerVisible(false)}>取消</Button>
            <Button type="primary" onClick={handleSaveChanges}>保存修改</Button>
          </Space>
        }
      >
        <Spin spinning={drawerLoading}>
        <Form form={form} layout="vertical" requiredMark={false}>
          {editType === 'project' && (
            <>
              <Form.Item name="name" label="项目名称" rules={[{ required: true, message: '请输入项目名称' }]}>
                <Input placeholder="输入项目名称" />
              </Form.Item>

              <Form.Item name="business_model" label="商业模式核心" help="在此输入或补充该项目的商业打法、赢利点及核心优势">
                <Input.TextArea rows={6} placeholder="输入商业模式或落地细节描述..." />
              </Form.Item>

              <Form.Item name="landing_ideas" label="落地与创业方向" help="每行输入一个落地创意或创业项目构想">
                <Input.TextArea rows={3} placeholder="输入落地创业构想，多个回车换行..." />
              </Form.Item>

              <Form.Item name="missing_evidence" label="缺失证据链" help="多个用英文逗号 (,) 分隔">
                <Input placeholder="例如：商业客户名录, 招投标文件, 运营周报" />
              </Form.Item>
            </>
          )}

          {editType === 'capability' && (
            <Form.Item name="logic_analysis" label="底层能力推演与业务链路" rules={[{ required: true, message: '请输入分析逻辑' }]}>
              <Input.TextArea rows={12} placeholder="在此处输入这名人才的底层逻辑及商业推演路径分析..." />
            </Form.Item>
          )}

          {editType === 'work' && (
            <>
              <Form.Item name="company" label="任职公司" rules={[{ required: true }]}>
                <Input disabled />
              </Form.Item>
              <Form.Item name="role" label="任职角色" rules={[{ required: true }]}>
                <Input disabled />
              </Form.Item>
              <Form.Item name="summary" label="任职经历概要" rules={[{ required: true, message: '请输入任职概要' }]}>
                <Input.TextArea rows={6} placeholder="输入任职期间主导的业务、打法及量化业绩概要..." />
              </Form.Item>
              <Form.Item name="capabilities" label="提炼能力标签" help="多个用英文逗号 (,) 分隔">
                <Input placeholder="输入能力标签..." />
              </Form.Item>
            </>
          )}
        </Form>

        {/* AI 智能追问/分析增补卡片 */}
        {(editType === 'project' || editType === 'capability' || editType === 'work') && (
          <Card
            size="small"
            title={
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '13px' }}>
                <BulbOutlined style={{ color: '#faad14' }} />
                <strong>大模型智能分析助手</strong>
              </span>
            }
            style={{ marginTop: 24, background: '#fbfbf8', border: '1px dashed #d9d2c2', borderRadius: '6px' }}
          >
            <div style={{ marginBottom: 12 }}>
              <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: 6 }}>
                输入您想要追问或增补的要求（例如：“结合候选人的行业背景，分析补充这个项目的商业闭环与客户壁垒”）：
              </Text>
              <Input.Search
                placeholder="在此输入 AI 追问引导指令..."
                enterButton="开始增补"
                loading={aiLoading}
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                onSearch={handleAIAugment}
              />
            </div>

            {aiResult && (
              <div style={{ marginTop: 12, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
                <div style={{ background: '#fff', padding: '10px 14px', border: '1px solid #e8e8e8', borderRadius: 4, maxHeight: 180, overflowY: 'auto', marginBottom: 10, fontSize: '13px', lineHeight: '1.6' }}>
                  <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{aiResult}</Paragraph>
                </div>
                <Space>
                  <Button size="small" type="primary" onClick={handleAdoptAIResult}>一键采纳</Button>
                  <Button size="small" onClick={() => setAiResult('')}>清除建议</Button>
                </Space>
              </div>
            )}
          </Card>
        )}
        </Spin>
      </Drawer>
    </div>
  );
};

export default Dashboard;
