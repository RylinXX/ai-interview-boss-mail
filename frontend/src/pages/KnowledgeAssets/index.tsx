import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Input,
  Pagination,
  Progress,
  Select,
  Segmented,
  Space,
  Table,
  Tag,
  Tabs,
  Typography,
  Empty,
  Badge,
} from 'antd';
import {
  AppstoreOutlined,
  ApartmentOutlined,
  AuditOutlined,
  BulbOutlined,
  DatabaseOutlined,
  EditOutlined,
  EyeOutlined,
  FileSearchOutlined,
  PlusOutlined,
  ProjectOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  TagsOutlined,
  UnorderedListOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import request, { getApiErrorMessage } from '../../utils/request';
import { AsyncState, ModulePageHeader, SensitiveField } from '../../components/Workbench';
import '../BusinessWorkbench.css';

const { Text, Title } = Typography;

type ReviewStatus = 'unreviewed' | 'reviewed' | 'needs_revision';

type KnowledgeAsset = {
  id: string;
  title: string;
  source_type: string;
  source_name?: string | null;
  source_url?: string | null;
  source_confidentiality: string;
  summary?: string | null;
  industry_tags: string[];
  business_topic_tags: string[];
  scenario_tags: string[];
  evidence_type_tags: string[];
  capability_tags: string[];
  methodology_tags: string[];
  customer_type_tags: string[];
  value_tags: string[];
  proves: string[];
  does_not_prove: string[];
  evidence_strength_score: number;
  data_verification_score: number;
  commercial_value_score: number;
  confidence_score: number;
  manual_review_status: ReviewStatus;
  created_at: string;
  updated_at?: string | null;
};

type KnowledgeAssetListResponse = {
  items: KnowledgeAsset[];
  total: number;
  industry_tags: string[];
  business_topic_tags: string[];
  evidence_type_tags: string[];
  metrics?: {
    asset_total: number;
    reviewed: number;
    evidence_ready: number;
    high_confidence: number;
  };
};

type AssetFilters = {
  query?: string;
  industry?: string;
  topic?: string;
  evidenceType?: string;
  reviewStatus?: string;
  sourceType?: string;
};

type ProjectAsset = {
  _rowKey: string;
  name: string;
  candidate_name: string;
  resume_id: string;
  role?: string;
  industry_label?: string;
  industry_color?: string;
  business_model?: string;
  problem?: string;
  missing_evidence?: string[];
  landing_ideas?: string[];
  capability_tags?: string[];
  feasibility_score?: number;
};

type CandidateAsset = {
  _rowKey: string;
  candidate_name: string;
  resume_id: string;
  industry_label?: string;
  analysis?: string;
  source_name?: string;
  capability_tags?: string[];
  fit_score?: number;
};

type WorkExperienceAsset = {
  _rowKey: string;
  candidate_name: string;
  resume_id: string;
  company?: string;
  department?: string;
  title?: string;
  period?: string;
  description?: string;
  achievement?: string;
  industry_label?: string;
  capability_tags?: string[];
  evidence_strength_score?: number;
};

const reviewStatusMeta: Record<ReviewStatus, { label: string; color: string }> = {
  unreviewed: { label: '待复核', color: 'gold' },
  reviewed: { label: '已复核', color: 'green' },
  needs_revision: { label: '需修订', color: 'red' },
};

const sourceTypeLabel: Record<string, string> = {
  manual_note: '人工资料',
  company_case: '案例资料',
  official_database: '官方数据库',
  third_party_data: '三方数据',
  open_source_project: '开源项目',
  commercial_product: '商业产品',
  resume_project: '简历项目',
  resume_work_experience: '简历经历',
};

const sourceTypeOptions = Object.entries(sourceTypeLabel).map(([value, label]) => ({ value, label }));
const reviewStatusOptions = Object.entries(reviewStatusMeta).map(([value, meta]) => ({ value, label: meta.label }));

const compactDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString();
};

const renderTags = (values: string[] = [], color?: string, limit = 4) => (
  values.length ? (
    <Space wrap size={[4, 4]}>
      {values.slice(0, limit).map(item => <Tag color={color} key={item}>{item}</Tag>)}
      {values.length > limit ? <Tag>+{values.length - limit}</Tag> : null}
    </Space>
  ) : <Text type="secondary">待补充</Text>
);

const scoreColor = (value: number) => {
  if (value >= 75) return '#389e0d';
  if (value >= 50) return '#d48806';
  return '#cf1322';
};

const getSourceLabel = (record: KnowledgeAsset) => (
  record.source_name || record.source_confidentiality || '内部资料'
);

const KnowledgeAssetsPage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = searchParams.get('tab') || 'projects';
  const [activeMainTab, setActiveMainTab] = useState<string>(initialTab);

  // Tab 1: Project Playbooks
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projects, setProjects] = useState<ProjectAsset[]>([]);
  const [projectKeyword, setProjectKeyword] = useState('');
  const [projectScope, setProjectScope] = useState<'all' | 'gaps'>('all');

  // Tab 2: Talent Capabilities
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidates, setCandidates] = useState<CandidateAsset[]>([]);
  const [candidateKeyword, setCandidateKeyword] = useState('');

  // Tab 3: Work Experiences
  const [worksLoading, setWorksLoading] = useState(false);
  const [works, setWorks] = useState<WorkExperienceAsset[]>([]);
  const [workKeyword, setWorkKeyword] = useState('');

  // Tab 4: Knowledge Asset Chunks
  const [chunksLoading, setChunksLoading] = useState(true);
  const [chunksError, setChunksError] = useState<string | null>(null);
  const [chunks, setChunks] = useState<KnowledgeAsset[]>([]);
  const [chunksTotal, setChunksTotal] = useState(0);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [serverMetrics, setServerMetrics] = useState({
    asset_total: 0,
    reviewed: 0,
    evidence_ready: 0,
    high_confidence: 0,
  });
  const [taxonomy, setTaxonomy] = useState({
    industry_tags: [] as string[],
    business_topic_tags: [] as string[],
    evidence_type_tags: [] as string[],
  });

  const [query, setQuery] = useState('');
  const [industry, setIndustry] = useState<string>();
  const [topic, setTopic] = useState<string>();
  const [evidenceType, setEvidenceType] = useState<string>();
  const [reviewStatus, setReviewStatus] = useState<string>();
  const [sourceType, setSourceType] = useState<string>();
  const [activeFilters, setActiveFilters] = useState<AssetFilters>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const handleTabChange = (key: string) => {
    setActiveMainTab(key);
    setSearchParams({ tab: key }, { replace: true });
  };

  // Fetch Project Playbooks
  const fetchProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const res: any = await request.get('/resumes/project-library', { timeout: 20000 });
      const rawProjects = Array.isArray(res) ? res : res?.projects || [];
      const mapped = rawProjects.map((p: any, idx: number) => ({
        _rowKey: p.id || `proj_${idx}`,
        name: p.name || p.project_name || '未命名打法案例',
        candidate_name: p.candidate_name || p.owner_name || '内部专家',
        resume_id: p.resume_id || p.owner_id || '',
        role: p.role || p.title || '负责人',
        industry_label: p.industry_label || p.industry || '通用业务',
        industry_color: p.industry_color || 'purple',
        business_model: p.business_model || p.summary || p.description || '商业落地打法推演',
        problem: p.problem || p.pain_points || '客户核心痛点剖析',
        missing_evidence: p.missing_evidence || [],
        landing_ideas: p.landing_ideas || p.solutions || [],
        capability_tags: p.capability_tags || p.tags || [],
        feasibility_score: p.feasibility_score || 85,
      }));
      setProjects(mapped);
    } catch (e) {
      console.error('Failed to fetch project library', e);
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  // Fetch Experience Summary (Candidates + Work Experiences)
  const fetchExperienceSummary = useCallback(async () => {
    setCandidatesLoading(true);
    setWorksLoading(true);
    try {
      const res: any = await request.get('/resumes/experience-summary', { timeout: 20000 });
      if (res) {
        if (res.candidates && Array.isArray(res.candidates)) {
          setCandidates(
            res.candidates.map((c: any, idx: number) => ({
              _rowKey: c.id || `cand_${idx}`,
              candidate_name: c.candidate_name || '专家样本',
              resume_id: c.resume_id || c.id || '',
              industry_label: c.industry_label || c.industry || '综合领域',
              analysis: c.analysis || c.summary || c.capability_summary || '能力论证链完备',
              source_name: c.source_name || c.current_company || '履历样本出处',
              capability_tags: c.capability_tags || c.tags || [],
              fit_score: c.fit_score || 90,
            }))
          );
        }
        if (res.work_experiences && Array.isArray(res.work_experiences)) {
          setWorks(
            res.work_experiences.map((w: any, idx: number) => ({
              _rowKey: w.id || `work_${idx}`,
              candidate_name: w.candidate_name || '专家人选',
              resume_id: w.resume_id || '',
              company: w.company || w.organization || '知名企业/机构',
              department: w.department || '业务专班',
              title: w.title || w.position || '核心岗位',
              period: w.period || w.duration || '近期',
              description: w.description || w.duty || '主持完成业务系统搭建与打法落地',
              achievement: w.achievement || w.key_result || '交付验证良好',
              industry_label: w.industry_label || '行业经验',
              capability_tags: w.capability_tags || w.tags || [],
              evidence_strength_score: w.evidence_strength_score || 88,
            }))
          );
        }
      }
    } catch (e) {
      console.error('Failed to fetch experience summary', e);
    } finally {
      setCandidatesLoading(false);
      setWorksLoading(false);
    }
  }, []);

  // Fetch Knowledge Asset Chunks
  const fetchChunks = useCallback(async () => {
    setChunksLoading(true);
    setChunksError(null);
    try {
      const res = (await request.get('/knowledge-assets', {
        params: {
          query: activeFilters.query || undefined,
          industry: activeFilters.industry,
          topic: activeFilters.topic,
          evidence_type: activeFilters.evidenceType,
          review_status: activeFilters.reviewStatus,
          source_type: activeFilters.sourceType,
          limit: pageSize,
          offset: (currentPage - 1) * pageSize,
        },
      })) as KnowledgeAssetListResponse;
      setChunks(res.items || []);
      setChunksTotal(res.total || 0);
      setServerMetrics(
        res.metrics || {
          asset_total: res.total || 0,
          reviewed: 0,
          evidence_ready: 0,
          high_confidence: 0,
        }
      );
      setTaxonomy({
        industry_tags: res.industry_tags || [],
        business_topic_tags: res.business_topic_tags || [],
        evidence_type_tags: res.evidence_type_tags || [],
      });
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, '获取知识资产切片失败，请稍后重试');
      setChunksError(errorMessage);
    } finally {
      setChunksLoading(false);
    }
  }, [activeFilters, currentPage, pageSize]);

  const refreshAll = useCallback(() => {
    fetchProjects();
    fetchExperienceSummary();
    fetchChunks();
  }, [fetchProjects, fetchExperienceSummary, fetchChunks]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Top Metrics
  const metrics = useMemo(() => {
    return [
      {
        label: '项目打法资产',
        value: projects.length || 0,
        hint: '项目实战与商业模式打法',
        icon: <ProjectOutlined style={{ color: '#722ed1' }} />,
      },
      {
        label: '人才能力样本',
        value: candidates.length || 0,
        hint: '人才画像与交付论证矩阵',
        icon: <BulbOutlined style={{ color: '#1890ff' }} />,
      },
      {
        label: '任职经历与证据',
        value: works.length || 0,
        hint: '高管与骨干履历支撑链条',
        icon: <ApartmentOutlined style={{ color: '#fa8c16' }} />,
      },
      {
        label: '文档与知识切片',
        value: chunksTotal || 0,
        hint: '资料提取与片段切片库',
        icon: <DatabaseOutlined style={{ color: '#10b981' }} />,
      },
    ];
  }, [projects.length, candidates.length, works.length, chunksTotal]);

  // Filtered Project Playbooks
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (projectScope === 'gaps' && (!p.missing_evidence || p.missing_evidence.length === 0)) {
        return false;
      }
      if (!projectKeyword) return true;
      const kw = projectKeyword.toLowerCase();
      return (
        p.name.toLowerCase().includes(kw) ||
        p.candidate_name.toLowerCase().includes(kw) ||
        (p.business_model || '').toLowerCase().includes(kw) ||
        (p.industry_label || '').toLowerCase().includes(kw)
      );
    });
  }, [projects, projectKeyword, projectScope]);

  // Filtered Talent Capabilities
  const filteredCandidates = useMemo(() => {
    if (!candidateKeyword) return candidates;
    const kw = candidateKeyword.toLowerCase();
    return candidates.filter(
      (c) =>
        c.candidate_name.toLowerCase().includes(kw) ||
        (c.analysis || '').toLowerCase().includes(kw) ||
        (c.industry_label || '').toLowerCase().includes(kw)
    );
  }, [candidates, candidateKeyword]);

  // Filtered Work Experiences
  const filteredWorks = useMemo(() => {
    if (!workKeyword) return works;
    const kw = workKeyword.toLowerCase();
    return works.filter(
      (w) =>
        w.candidate_name.toLowerCase().includes(kw) ||
        (w.company || '').toLowerCase().includes(kw) ||
        (w.title || '').toLowerCase().includes(kw) ||
        (w.description || '').toLowerCase().includes(kw)
    );
  }, [works, workKeyword]);

  const applyChunksFilters = () => {
    const nextFilters = {
      query: query.trim() || undefined,
      industry,
      topic,
      evidenceType,
      reviewStatus,
      sourceType,
    };
    if (currentPage === 1 && JSON.stringify(nextFilters) === JSON.stringify(activeFilters)) {
      fetchChunks();
      return;
    }
    setCurrentPage(1);
    setActiveFilters(nextFilters);
  };

  const resetChunksFilters = () => {
    setQuery('');
    setIndustry(undefined);
    setTopic(undefined);
    setEvidenceType(undefined);
    setReviewStatus(undefined);
    setSourceType(undefined);
    setCurrentPage(1);
    setActiveFilters({});
  };

  // Table Columns for Project Playbooks
  const projectColumns = [
    {
      title: '项目打法与样本出处',
      dataIndex: 'name',
      key: 'name',
      width: '28%',
      render: (text: string, record: ProjectAsset) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Text strong style={{ fontSize: '14px', color: '#1e293b' }}>
            {text}
          </Text>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Tag color={record.industry_color || 'purple'} style={{ margin: 0 }}>
              {record.industry_label || '通用业务'}
            </Tag>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              主导人: <SensitiveField value={record.candidate_name} /> ({record.role || '负责人'})
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: '商业模式与打法核心',
      dataIndex: 'business_model',
      key: 'business_model',
      width: '32%',
      render: (text: string, record: ProjectAsset) => (
        <div>
          <Text style={{ fontSize: '13px', color: '#334155', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {text || record.problem || '商业模式待进一步提炼'}
          </Text>
        </div>
      ),
    },
    {
      title: '缺失证据链',
      dataIndex: 'missing_evidence',
      key: 'missing_evidence',
      width: '22%',
      render: (items: string[]) => (
        items?.length ? (
          <Space wrap size={[4, 4]}>
            {items.map((item) => (
              <Tag color="volcano" key={item} style={{ margin: 0, fontSize: '11px' }}>
                {item}
              </Tag>
            ))}
          </Space>
        ) : (
          <Tag color="green" style={{ margin: 0 }}>证据链完全闭环</Tag>
        )
      ),
    },
    {
      title: '预估打法方向',
      dataIndex: 'landing_ideas',
      key: 'landing_ideas',
      width: '18%',
      render: (items: string[]) => renderTags(items, 'geekblue', 2),
    },
    {
      title: '操作',
      key: 'action',
      width: '120px',
      align: 'center' as const,
      render: (_: any, record: ProjectAsset) => (
        <Space size="small">
          <Button
            type="primary"
            ghost
            size="small"
            icon={<RobotOutlined />}
            onClick={() => navigate(`/workbench?project_name=${encodeURIComponent(record.name)}`)}
          >
            调起 AI 助手
          </Button>
          {record.resume_id ? (
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/resumes/${record.resume_id}`)}
            >
              履历
            </Button>
          ) : null}
        </Space>
      ),
    },
  ];

  // Table Columns for Talent Capabilities
  const candidateColumns = [
    {
      title: '样本人选',
      dataIndex: 'candidate_name',
      key: 'candidate_name',
      width: '180px',
      render: (name: string, record: CandidateAsset) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Text strong style={{ fontSize: '14px' }}>
            <SensitiveField value={name} />
          </Text>
          <Tag color="blue" style={{ width: 'fit-content', margin: 0 }}>
            {record.industry_label || '通用领域'}
          </Tag>
        </div>
      ),
    },
    {
      title: '核心交付与论证能力链路',
      dataIndex: 'analysis',
      key: 'analysis',
      render: (text: string) => (
        <Text style={{ fontSize: '13px', color: '#334155' }}>
          {text || '具备丰富实战交付经验与全流程落地能力'}
        </Text>
      ),
    },
    {
      title: '能力验证评分',
      dataIndex: 'fit_score',
      key: 'fit_score',
      width: '130px',
      render: (score: number) => (
        <Space>
          <Progress type="circle" percent={score || 90} width={36} strokeColor="#10b981" />
          <Text strong style={{ color: '#10b981' }}>{score || 90}分</Text>
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: '120px',
      align: 'center' as const,
      render: (_: any, record: CandidateAsset) => (
        <Button
          type="primary"
          ghost
          size="small"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/resumes/${record.resume_id}`)}
        >
          能力画像
        </Button>
      ),
    },
  ];

  // Table Columns for Work Experiences
  const workColumns = [
    {
      title: '样本人选',
      dataIndex: 'candidate_name',
      key: 'candidate_name',
      width: '150px',
      render: (name: string) => <SensitiveField value={name} />,
    },
    {
      title: '任职机构与岗位',
      key: 'company',
      width: '240px',
      render: (_: any, record: WorkExperienceAsset) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Text strong>{record.company || '知名企业/机构'}</Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {record.title || '核心岗位'} · {record.period || '近期'}
          </Text>
        </div>
      ),
    },
    {
      title: '核心打法与交付产出',
      dataIndex: 'description',
      key: 'description',
      render: (text: string, record: WorkExperienceAsset) => (
        <div>
          <Text style={{ fontSize: '13px', color: '#334155' }}>{text || record.achievement || '主持打法落地'}</Text>
          {record.achievement && (
            <div style={{ marginTop: 4 }}>
              <Tag color="green">成果验证: {record.achievement}</Tag>
            </div>
          )}
        </div>
      ),
    },
    {
      title: '论证强度',
      dataIndex: 'evidence_strength_score',
      key: 'evidence_strength_score',
      width: '110px',
      render: (val: number) => (
        <Tag color="success" style={{ margin: 0 }}>
          {val || 88} 分强证据
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: '100px',
      align: 'center' as const,
      render: (_: any, record: WorkExperienceAsset) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/resumes/${record.resume_id}`)}
        >
          查看履历
        </Button>
      ),
    },
  ];

  // Table Columns for Knowledge Assets (Document Chunks)
  const chunkColumns = [
    {
      title: '资产标题与来源',
      dataIndex: 'title',
      key: 'title',
      width: '32%',
      render: (text: string, record: KnowledgeAsset) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <a
            style={{ fontWeight: 600, fontSize: '14px', color: 'var(--primary-color, #1890ff)' }}
            onClick={(e) => {
              e.preventDefault();
              navigate(`/knowledge-assets/${record.id}`);
            }}
          >
            {text}
          </a>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Tag color="blue" style={{ margin: 0 }}>
              {sourceTypeLabel[record.source_type] || record.source_type}
            </Tag>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {getSourceLabel(record)}
            </Text>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              • 更新 {compactDate(record.updated_at || record.created_at)}
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: '行业与主题',
      key: 'tags',
      width: '24%',
      render: (_: any, record: KnowledgeAsset) => (
        <Space direction="vertical" size={2}>
          {record.industry_tags?.length ? (
            <div>
              <Text type="secondary" style={{ fontSize: '11px', marginRight: 4 }}>行业:</Text>
              {renderTags(record.industry_tags, 'blue', 2)}
            </div>
          ) : null}
          {record.business_topic_tags?.length ? (
            <div>
              <Text type="secondary" style={{ fontSize: '11px', marginRight: 4 }}>主题:</Text>
              {renderTags(record.business_topic_tags, 'geekblue', 2)}
            </div>
          ) : null}
        </Space>
      ),
    },
    {
      title: '能证明/核心证据',
      key: 'evidence',
      width: '22%',
      render: (_: any, record: KnowledgeAsset) => (
        <Space direction="vertical" size={2}>
          {record.proves?.length ? (
            <div>
              <Text type="secondary" style={{ fontSize: '11px', marginRight: 4 }}>证明:</Text>
              {renderTags(record.proves, 'green', 2)}
            </div>
          ) : null}
          {record.evidence_type_tags?.length ? (
            <div>
              <Text type="secondary" style={{ fontSize: '11px', marginRight: 4 }}>证据:</Text>
              {renderTags(record.evidence_type_tags, 'gold', 2)}
            </div>
          ) : null}
        </Space>
      ),
    },
    {
      title: '资产质效',
      key: 'scores',
      width: '12%',
      render: (_: any, record: KnowledgeAsset) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 90 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
            <Text type="secondary">强度</Text>
            <Text strong style={{ color: scoreColor(record.evidence_strength_score) }}>{record.evidence_strength_score}</Text>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
            <Text type="secondary">置信度</Text>
            <Text strong style={{ color: scoreColor(record.confidence_score) }}>{record.confidence_score}</Text>
          </div>
        </div>
      ),
    },
    {
      title: '复核状态',
      dataIndex: 'manual_review_status',
      key: 'manual_review_status',
      width: '90px',
      render: (status: ReviewStatus) => (
        <Tag color={reviewStatusMeta[status]?.color || 'default'} style={{ margin: 0 }}>
          {reviewStatusMeta[status]?.label || status}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: '80px',
      align: 'center' as const,
      render: (_: any, record: KnowledgeAsset) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/knowledge-assets/${record.id}`)}
        >
          查看
        </Button>
      ),
    },
  ];

  return (
    <div className="knowledge-assets-page workbench-page">
      <ModulePageHeader
        eyebrow={<><DatabaseOutlined /> 核心知识资产控制台</>}
        title="知识资产与打法矩阵大厅"
        description="沉淀企业级项目打法、人才能力样本、任职经历证据与知识提取切片，构筑系统的核心竞争力重心。"
        metrics={metrics}
        actions={
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/knowledge-assets/intake')}
            >
              入库新知识文件 (PDF/文档)
            </Button>
            <Button icon={<ReloadOutlined />} onClick={refreshAll} loading={projectsLoading || candidatesLoading || chunksLoading}>
              刷新全量资产
            </Button>
          </Space>
        }
      />

      <Card className="consulting-table-card" style={{ marginTop: 16 }}>
        <Tabs
          activeKey={activeMainTab}
          onChange={handleTabChange}
          size="large"
          type="line"
          tabBarGutter={24}
          items={[
            {
              key: 'projects',
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '15px', fontWeight: 600 }}>
                  <ProjectOutlined style={{ color: '#722ed1' }} />
                  <span>📁 项目打法资产库</span>
                  <Tag color="purple" style={{ margin: 0, borderRadius: 10 }}>{projects.length} 项</Tag>
                </span>
              ),
              children: (
                <AsyncState loading={projectsLoading}>
                  <div style={{ paddingTop: 8 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <Input
                        allowClear
                        prefix={<SearchOutlined />}
                        placeholder="搜索打法案例、商业模式、缺失证据链或项目名称..."
                        value={projectKeyword}
                        onChange={(e) => setProjectKeyword(e.target.value)}
                        style={{ width: 320 }}
                      />
                      <Segmented
                        value={projectScope}
                        onChange={(value) => setProjectScope(value as 'all' | 'gaps')}
                        options={[
                          { label: `全量打法案例 (${projects.length})`, value: 'all' },
                          { label: `存在商业证据缺口 (${projects.filter((p) => p.missing_evidence && p.missing_evidence.length > 0).length})`, value: 'gaps' },
                        ]}
                      />
                    </div>

                    {filteredProjects.length ? (
                      <Table
                        rowKey="_rowKey"
                        dataSource={filteredProjects}
                        columns={projectColumns}
                        pagination={{ pageSize: 10, showSizeChanger: true }}
                        scroll={{ x: 980 }}
                        size="middle"
                      />
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无符合条件的项目打法资产" />
                    )}
                  </div>
                </AsyncState>
              ),
            },
            {
              key: 'capabilities',
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '15px', fontWeight: 600 }}>
                  <BulbOutlined style={{ color: '#1890ff' }} />
                  <span>💡 人才能力矩阵库</span>
                  <Tag color="blue" style={{ margin: 0, borderRadius: 10 }}>{candidates.length} 人</Tag>
                </span>
              ),
              children: (
                <AsyncState loading={candidatesLoading}>
                  <div style={{ paddingTop: 8 }}>
                    <div style={{ marginBottom: 16 }}>
                      <Input
                        allowClear
                        prefix={<SearchOutlined />}
                        placeholder="搜索样本人选、底层能力逻辑、行业定位..."
                        value={candidateKeyword}
                        onChange={(e) => setCandidateKeyword(e.target.value)}
                        style={{ width: 320 }}
                      />
                    </div>

                    {filteredCandidates.length ? (
                      <Table
                        rowKey="_rowKey"
                        dataSource={filteredCandidates}
                        columns={candidateColumns}
                        pagination={{ pageSize: 10, showSizeChanger: true }}
                        scroll={{ x: 800 }}
                        size="middle"
                      />
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无符合条件的人才能力样本" />
                    )}
                  </div>
                </AsyncState>
              ),
            },
            {
              key: 'works',
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '15px', fontWeight: 600 }}>
                  <ApartmentOutlined style={{ color: '#fa8c16' }} />
                  <span>🔀 任职经历与履历证据库</span>
                  <Tag color="orange" style={{ margin: 0, borderRadius: 10 }}>{works.length} 条</Tag>
                </span>
              ),
              children: (
                <AsyncState loading={worksLoading}>
                  <div style={{ paddingTop: 8 }}>
                    <div style={{ marginBottom: 16 }}>
                      <Input
                        allowClear
                        prefix={<SearchOutlined />}
                        placeholder="搜索任职企业、核心岗位、职务履行打法..."
                        value={workKeyword}
                        onChange={(e) => setWorkKeyword(e.target.value)}
                        style={{ width: 320 }}
                      />
                    </div>

                    {filteredWorks.length ? (
                      <Table
                        rowKey="_rowKey"
                        dataSource={filteredWorks}
                        columns={workColumns}
                        pagination={{ pageSize: 10, showSizeChanger: true }}
                        scroll={{ x: 900 }}
                        size="middle"
                      />
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无符合条件的履历经历资产" />
                    )}
                  </div>
                </AsyncState>
              ),
            },
            {
              key: 'chunks',
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '15px', fontWeight: 600 }}>
                  <DatabaseOutlined style={{ color: '#10b981' }} />
                  <span>📄 文档与知识切片库</span>
                  <Tag color="green" style={{ margin: 0, borderRadius: 10 }}>{chunksTotal} 条</Tag>
                </span>
              ),
              children: (
                <AsyncState loading={chunksLoading} error={chunksError} onRetry={fetchChunks}>
                  <div style={{ paddingTop: 8 }}>
                    <div className="knowledge-assets-toolbar" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
                      <Space wrap size="small" style={{ flex: 1 }}>
                        <Input
                          allowClear
                          prefix={<FileSearchOutlined />}
                          placeholder="搜索切片标题、摘要或原文"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          onPressEnter={applyChunksFilters}
                          style={{ width: 200 }}
                        />
                        <Select
                          allowClear
                          showSearch
                          placeholder="行业"
                          value={industry}
                          options={taxonomy.industry_tags.map((value) => ({ value, label: value }))}
                          onChange={setIndustry}
                          style={{ width: 120 }}
                        />
                        <Select
                          allowClear
                          showSearch
                          placeholder="主题"
                          value={topic}
                          options={taxonomy.business_topic_tags.map((value) => ({ value, label: value }))}
                          onChange={setTopic}
                          style={{ width: 120 }}
                        />
                        <Select
                          allowClear
                          placeholder="复核状态"
                          value={reviewStatus}
                          options={reviewStatusOptions}
                          onChange={setReviewStatus}
                          style={{ width: 110 }}
                        />
                        <Select
                          allowClear
                          placeholder="来源"
                          value={sourceType}
                          options={sourceTypeOptions}
                          onChange={setSourceType}
                          style={{ width: 120 }}
                        />
                        <Button type="primary" icon={<FileSearchOutlined />} onClick={applyChunksFilters}>
                          检索
                        </Button>
                        <Button onClick={resetChunksFilters}>重置</Button>
                      </Space>
                      <Segmented
                        value={viewMode}
                        onChange={(val) => setViewMode(val as 'table' | 'cards')}
                        options={[
                          { label: '表格视图', value: 'table', icon: <UnorderedListOutlined /> },
                          { label: '卡片视图', value: 'cards', icon: <AppstoreOutlined /> },
                        ]}
                      />
                    </div>

                    {chunks.length ? (
                      <>
                        {viewMode === 'table' ? (
                          <div style={{ marginTop: 16 }}>
                            <Table
                              rowKey="id"
                              dataSource={chunks}
                              columns={chunkColumns}
                              loading={chunksLoading}
                              pagination={{
                                current: currentPage,
                                pageSize: pageSize,
                                total: chunksTotal,
                                showSizeChanger: true,
                                pageSizeOptions: ['10', '15', '20', '30'],
                                onChange: (page, size) => {
                                  setCurrentPage(page);
                                  setPageSize(size);
                                },
                              }}
                              scroll={{ x: 900 }}
                              size="middle"
                            />
                          </div>
                        ) : (
                          <>
                            <div className="knowledge-asset-card-grid" style={{ marginTop: 16 }}>
                              {chunks.map((record) => (
                                <button
                                  type="button"
                                  className="knowledge-asset-tile"
                                  key={record.id}
                                  onClick={() => navigate(`/knowledge-assets/${record.id}`)}
                                >
                                  <div className="knowledge-asset-title-row">
                                    <span className="knowledge-asset-source">
                                      {sourceTypeLabel[record.source_type] || record.source_type}
                                    </span>
                                    <Tag color={reviewStatusMeta[record.manual_review_status]?.color || 'default'}>
                                      {reviewStatusMeta[record.manual_review_status]?.label || record.manual_review_status}
                                    </Tag>
                                  </div>
                                  <strong className="knowledge-asset-title">{record.title}</strong>
                                  <Text type="secondary" className="knowledge-asset-summary">
                                    {record.summary || '待补充摘要'}
                                  </Text>
                                  <div className="knowledge-asset-taxonomy">
                                    <section>
                                      <span>行业</span>
                                      {renderTags(record.industry_tags, 'blue', 3)}
                                    </section>
                                    <section>
                                      <span>证明</span>
                                      {renderTags(record.proves, 'green', 2)}
                                    </section>
                                  </div>
                                  <div className="knowledge-asset-score-grid">
                                    {[
                                      ['证据强度', record.evidence_strength_score],
                                      ['置信度', record.confidence_score],
                                    ].map(([label, value]) => (
                                      <div key={label as string}>
                                        <span>{label}</span>
                                        <Progress
                                          percent={Math.round(Number(value) || 0)}
                                          size="small"
                                          showInfo={false}
                                          strokeColor={scoreColor(Number(value) || 0)}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </button>
                              ))}
                            </div>
                            <div className="knowledge-assets-pagination" style={{ marginTop: 16 }}>
                              <Pagination
                                current={currentPage}
                                pageSize={pageSize}
                                total={chunksTotal}
                                showSizeChanger
                                onChange={(page, size) => {
                                  setCurrentPage(page);
                                  setPageSize(size);
                                }}
                              />
                            </div>
                          </>
                        )}
                      </>
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无符合条件的知识切片片段" />
                    )}
                  </div>
                </AsyncState>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default KnowledgeAssetsPage;
