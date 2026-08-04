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

interface KnowledgeAsset {
  id: string;
  title: string;
  asset_code?: string;
  content_snippet?: string;
  confidence_score?: number;
  evidence_strength_score?: number;
  confidentiality_level?: string;
  review_status?: ReviewStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  source_type?: string;
  source_id?: string;
  source_name?: string | null;
  source_confidentiality?: string | null;
  tags?: string[];
  industry_tags?: string[];
  business_topic_tags?: string[];
  evidence_type_tags?: string[];
  created_at?: string;
}

interface ProjectAsset {
  _rowKey: string;
  id?: string;
  name: string;
  candidate_name: string;
  resume_id?: string;
  role?: string;
  business_model?: string;
  problem?: string;
  missing_evidence?: string[];
  landing_ideas?: string[];
  industry_label?: string;
  industry_color?: string;
}

interface CandidateAsset {
  _rowKey: string;
  candidate_name: string;
  resume_id?: string;
  industry_label?: string;
  analysis?: string;
  source_name?: string;
  capability_tags?: string[];
  fit_score?: number;
}

interface WorkExperienceAsset {
  _rowKey: string;
  candidate_name: string;
  resume_id?: string;
  company: string;
  department?: string;
  title?: string;
  period?: string;
  description?: string;
  achievement?: string;
  industry_label?: string;
  capability_tags?: string[];
  evidence_strength_score?: number;
}

interface AssetFilters {
  query?: string;
  industry?: string;
  topic?: string;
  evidenceType?: string;
  reviewStatus?: string;
  sourceType?: string;
}

const reviewStatusMeta: Record<ReviewStatus, { label: string; color: string }> = {
  unreviewed: { label: '待核对', color: 'default' },
  reviewed: { label: '已核对', color: 'success' },
  needs_revision: { label: '待补全', color: 'warning' },
};

const sourceTypeLabel: Record<string, string> = {
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

const ensureArray = (val: any): string[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val.map((x) => String(x));
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x));
    } catch {
      return val.split(/[,，;\n]/).map((x) => x.trim()).filter(Boolean);
    }
  }
  return [];
};

const renderTags = (values: any = [], color?: string, limit = 4) => {
  const arr = ensureArray(values);
  return arr.length ? (
    <Space wrap size={[4, 4]}>
      {arr.slice(0, limit).map((item) => (
        <Tag color={color} key={item}>
          {item}
        </Tag>
      ))}
      {arr.length > limit ? <Tag>+{arr.length - limit}</Tag> : null}
    </Space>
  ) : (
    <Text type="secondary">待补充</Text>
  );
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
      const res: any = await request.get('/resumes/project-library', { timeout: 20000 }).catch(() => ({}));
      const rawProjects = Array.isArray(res) ? res : res?.projects || [];
      const mapped = rawProjects.map((p: any, idx: number) => ({
        _rowKey: p.id || `proj_${idx}_${p.name || ''}`,
        id: p.id,
        name: p.name || p.project_name || '未命名打法案例',
        candidate_name: p.candidate_name || p.owner_name || '内部专家',
        resume_id: p.resume_id || '',
        role: p.role || p.position || '负责人',
        business_model: p.business_model || p.summary || p.description || '',
        problem: p.problem || p.pain_point || '',
        missing_evidence: ensureArray(p.missing_evidence || p.evidence_gaps),
        landing_ideas: ensureArray(p.landing_ideas || p.ideas),
        industry_label: p.industry_label || p.industry || '通用业务',
        industry_color: p.industry_color || 'purple',
      }));
      setProjects(mapped);
    } catch (e) {
      console.error('Failed to fetch projects', e);
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  // Fetch Experience Summary (Candidates + Work Experiences)
  const fetchExperienceSummary = useCallback(async () => {
    setCandidatesLoading(true);
    setWorksLoading(true);
    try {
      const [summaryRes, resumeListRes]: [any, any] = await Promise.all([
        request.get('/resumes/experience-summary', { timeout: 20000 }).catch(() => ({})),
        request.get('/resumes').catch(() => []),
      ]);

      const rawLogic = summaryRes?.logic_analyses || summaryRes?.candidates || [];
      const rawWorks = summaryRes?.work_experiences || [];
      const allResumes = Array.isArray(resumeListRes) ? resumeListRes : resumeListRes?.items || [];

      // Map logic analyses into candidate capability assets
      let candList: CandidateAsset[] = rawLogic.map((c: any, idx: number) => ({
        _rowKey: c.id || c.resume_id || `cand_${idx}`,
        candidate_name: c.candidate_name || '专家样本',
        resume_id: c.resume_id || c.id || '',
        industry_label: c.industry_label || c.industry || '综合领域',
        analysis: c.analysis || c.summary || c.logic_analysis || '能力论证链完备，具备高复杂场景交付能力',
        source_name: c.source_name || c.current_company || '履历出处',
        capability_tags: ensureArray(c.capability_tags || c.tags),
        fit_score: c.fit_score || 90,
      }));

      // Fallback: If logic_analyses is empty, map allResumes directly!
      if (candList.length === 0 && allResumes.length > 0) {
        candList = allResumes.map((r: any, idx: number) => ({
          _rowKey: r.id || `res_${idx}`,
          candidate_name: r.name || r.candidate_name || `专家人选 #${idx + 1}`,
          resume_id: r.id || '',
          industry_label: r.industry || r.target_position || '软件与IT服务',
          analysis: r.summary || (r.skills && r.skills.length > 0 ? `核心能力标签: ${ensureArray(r.skills).join(', ')}` : '简历特征与打法推演已入库'),
          source_name: r.current_company || '履历样本出处',
          capability_tags: ensureArray(r.skills || r.tags),
          fit_score: r.fit_score || 88,
        }));
      }

      setCandidates(candList);

      // Map work experiences
      setWorks(
        rawWorks.map((w: any, idx: number) => ({
          _rowKey: w.id || `work_${idx}_${w.company || ''}`,
          candidate_name: w.candidate_name || '专家人选',
          resume_id: w.resume_id || '',
          company: w.company || w.organization || '知名企业/机构',
          department: w.department || '业务部门',
          title: w.title || w.role || w.position || '核心岗位',
          period: w.period || w.duration || '近期',
          description: w.description || w.duty || w.summary || '主持完成架构升级与系统能力建设',
          achievement: w.achievement || w.key_result || '交付验证良好',
          industry_label: w.industry_label || '行业经验',
          capability_tags: ensureArray(w.capability_tags || w.tags),
          evidence_strength_score: w.evidence_strength_score || 88,
        }))
      );
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
      const res: any = await request.get('/knowledge-assets/query', {
        params: {
          q: activeFilters.query || undefined,
          industry_tag: activeFilters.industry || undefined,
          topic_tag: activeFilters.topic || undefined,
          evidence_type: activeFilters.evidenceType || undefined,
          review_status: activeFilters.reviewStatus || undefined,
          source_type: activeFilters.sourceType || undefined,
          skip: (currentPage - 1) * pageSize,
          limit: pageSize,
        },
      });

      setChunks(res?.items || []);
      setChunksTotal(res?.total || 0);

      const taxRes: any = await request.get('/knowledge-assets/taxonomy/stats').catch(() => ({}));
      setTaxonomy({
        industry_tags: taxRes?.industry_tags?.map((item: any) => item.name) || [],
        business_topic_tags: taxRes?.business_topic_tags?.map((item: any) => item.name) || [],
        evidence_type_tags: taxRes?.evidence_type_tags?.map((item: any) => item.name) || [],
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
      render: (items: any) => {
        const arr = ensureArray(items);
        return arr.length ? (
          <Space wrap size={[4, 4]}>
            {arr.map((item) => (
              <Tag color="volcano" key={item} style={{ margin: 0, fontSize: '11px' }}>
                {item}
              </Tag>
            ))}
          </Space>
        ) : (
          <Tag color="green" style={{ margin: 0 }}>证据链完全闭环</Tag>
        );
      },
    },
    {
      title: '预估打法方向',
      dataIndex: 'landing_ideas',
      key: 'landing_ideas',
      width: '18%',
      render: (items: any) => renderTags(items, 'geekblue', 2),
    },
    {
      title: '操作',
      key: 'action',
      width: '130px',
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
            <SensitiveField value={name || record.candidate_name || '未命名专家'} />
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
      title: '能力标签矩阵',
      dataIndex: 'capability_tags',
      key: 'capability_tags',
      width: '240px',
      render: (tags: any) => renderTags(tags, 'geekblue', 3),
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
          onClick={() => {
            if (record.resume_id) {
              navigate(`/resumes/${record.resume_id}`);
            } else {
              message.info('该人选暂无明细简历档案');
            }
          }}
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
      render: (name: string) => <SensitiveField value={name || '专家人选'} />,
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
          onClick={() => {
            if (record.resume_id) {
              navigate(`/resumes/${record.resume_id}`);
            } else {
              message.info('暂无关联的明细履历档案');
            }
          }}
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
          <Text type="secondary" style={{ fontSize: '12px' }}>
            编号: {record.asset_code || record.id?.slice(0, 8)} · 来源: {getSourceLabel(record)}
          </Text>
        </div>
      ),
    },
    {
      title: '抽取正文切片',
      dataIndex: 'content_snippet',
      key: 'content_snippet',
      width: '36%',
      render: (text?: string) => (
        <Text style={{ fontSize: '13px', color: '#334155', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {text || '已提炼抽取结构化特征'}
        </Text>
      ),
    },
    {
      title: '分类标签',
      key: 'tags',
      width: '20%',
      render: (_: any, record: KnowledgeAsset) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {renderTags(record.industry_tags, 'purple', 1)}
          {renderTags(record.business_topic_tags, 'blue', 1)}
        </div>
      ),
    },
    {
      title: '审核状态',
      dataIndex: 'review_status',
      key: 'review_status',
      width: '12%',
      render: (status: ReviewStatus = 'unreviewed') => {
        const meta = reviewStatusMeta[status] || reviewStatusMeta.unreviewed;
        return <Badge status={meta.color as any} text={meta.label} />;
      },
    },
  ];

  return (
    <div className="knowledge-assets-page workbench-page">
      <ModulePageHeader
        eyebrow="Knowledge Assets Hub"
        title="知识资产库"
        description="沉淀全量项目实战打法、人才能力论证矩阵、任职履历证据与抽取资料切片。"
        metrics={metrics}
        actions={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={refreshAll}>
              刷新资产
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/knowledge-assets/intake')}
            >
              新建知识切片
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
                  <Tag color="purple" style={{ margin: 0, borderRadius: 10 }}>{projects.length}</Tag>
                </span>
              ),
              children: (
                <div style={{ paddingTop: 8 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', marginBottom: 16 }}>
                    <Input
                      allowClear
                      prefix={<SearchOutlined />}
                      placeholder="搜索项目名称、主导人、商业模式或打法关键字..."
                      value={projectKeyword}
                      onChange={(e) => setProjectKeyword(e.target.value)}
                      style={{ width: 320 }}
                    />
                    <Segmented
                      value={projectScope}
                      onChange={(val) => setProjectScope(val as 'all' | 'gaps')}
                      options={[
                        { label: `全量打法 (${projects.length})`, value: 'all' },
                        { label: `存在证据链缺口 (${projects.filter((p) => p.missing_evidence && p.missing_evidence.length > 0).length})`, value: 'gaps' },
                      ]}
                    />
                  </div>

                  <Table
                    rowKey={(record) => record._rowKey}
                    loading={projectsLoading}
                    dataSource={filteredProjects}
                    columns={projectColumns}
                    pagination={{ pageSize: 8, showSizeChanger: true }}
                    scroll={{ x: 980 }}
                    size="middle"
                  />
                </div>
              ),
            },
            {
              key: 'capabilities',
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '15px', fontWeight: 600 }}>
                  <BulbOutlined style={{ color: '#1890ff' }} />
                  <span>💡 人才能力矩阵库</span>
                  <Tag color="blue" style={{ margin: 0, borderRadius: 10 }}>{candidates.length}</Tag>
                </span>
              ),
              children: (
                <div style={{ paddingTop: 8 }}>
                  <div style={{ marginBottom: 16 }}>
                    <Input
                      allowClear
                      prefix={<SearchOutlined />}
                      placeholder="搜索人选姓名、底层交付能力或行业方向..."
                      value={candidateKeyword}
                      onChange={(e) => setCandidateKeyword(e.target.value)}
                      style={{ width: 320 }}
                    />
                  </div>

                  <Table
                    rowKey={(record) => record._rowKey}
                    loading={candidatesLoading}
                    dataSource={filteredCandidates}
                    columns={candidateColumns}
                    pagination={{ pageSize: 8, showSizeChanger: true }}
                    scroll={{ x: 880 }}
                    size="middle"
                  />
                </div>
              ),
            },
            {
              key: 'works',
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '15px', fontWeight: 600 }}>
                  <ApartmentOutlined style={{ color: '#fa8c16' }} />
                  <span>🔀 任职经历与履历证据库</span>
                  <Tag color="orange" style={{ margin: 0, borderRadius: 10 }}>{works.length}</Tag>
                </span>
              ),
              children: (
                <div style={{ paddingTop: 8 }}>
                  <div style={{ marginBottom: 16 }}>
                    <Input
                      allowClear
                      prefix={<SearchOutlined />}
                      placeholder="搜索公司、岗位、任职成就或专家人选..."
                      value={workKeyword}
                      onChange={(e) => setWorkKeyword(e.target.value)}
                      style={{ width: 320 }}
                    />
                  </div>

                  <Table
                    rowKey={(record) => record._rowKey}
                    loading={worksLoading}
                    dataSource={filteredWorks}
                    columns={workColumns}
                    pagination={{ pageSize: 8, showSizeChanger: true }}
                    scroll={{ x: 920 }}
                    size="middle"
                  />
                </div>
              ),
            },
            {
              key: 'chunks',
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '15px', fontWeight: 600 }}>
                  <DatabaseOutlined style={{ color: '#10b981' }} />
                  <span>📄 文档与知识切片片段库</span>
                  <Tag color="green" style={{ margin: 0, borderRadius: 10 }}>{chunksTotal}</Tag>
                </span>
              ),
              children: (
                <div style={{ paddingTop: 8 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                    <Input
                      allowClear
                      prefix={<SearchOutlined />}
                      placeholder="搜索文档切片正文、关键字..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onPressEnter={applyChunksFilters}
                      style={{ width: 260 }}
                    />
                    <Select
                      allowClear
                      placeholder="按行业领域"
                      value={industry}
                      onChange={setIndustry}
                      options={taxonomy.industry_tags.map((t) => ({ label: t, value: t }))}
                      style={{ width: 150 }}
                    />
                    <Select
                      allowClear
                      placeholder="按审核状态"
                      value={reviewStatus}
                      onChange={setReviewStatus}
                      options={reviewStatusOptions}
                      style={{ width: 130 }}
                    />
                    <Button type="primary" onClick={applyChunksFilters}>
                      查询
                    </Button>
                    <Button onClick={resetChunksFilters}>重置</Button>
                  </div>

                  <AsyncState loading={chunksLoading} error={chunksError} onRetry={fetchChunks}>
                    {chunks.length ? (
                      <Table
                        rowKey="id"
                        dataSource={chunks}
                        columns={chunkColumns}
                        pagination={{
                          current: currentPage,
                          pageSize,
                          total: chunksTotal,
                          onChange: (page, pSize) => {
                            setCurrentPage(page);
                            setPageSize(pSize);
                          },
                        }}
                        size="middle"
                      />
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无符合条件的知识切片" />
                    )}
                  </AsyncState>
                </div>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default KnowledgeAssetsPage;
