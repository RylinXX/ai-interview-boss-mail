import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Checkbox,
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
  Tooltip,
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
import { useAuth } from '../../contexts/AuthContext';
import { useKnowledgeAssetsStore } from '../../store/useKnowledgeAssetsStore';
import type {
  KnowledgeAsset,
  ProjectAsset,
  CandidateAsset,
  WorkExperienceAsset,
  AssetFilters,
} from '../../store/useKnowledgeAssetsStore';
import '../BusinessWorkbench.css';

const { Text, Title, Paragraph } = Typography;

type ReviewStatus = 'unreviewed' | 'reviewed' | 'needs_revision';

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
  const { user } = useAuth();

  const initialTab = searchParams.get('tab') || 'projects';
  const [activeMainTab, setActiveMainTab] = useState<string>(initialTab);

  // Search / Filter inputs
  const [projectKeyword, setProjectKeyword] = useState('');
  const [projectScope, setProjectScope] = useState<'all' | 'gaps'>('all');
  const [candidateKeyword, setCandidateKeyword] = useState('');
  const [workKeyword, setWorkKeyword] = useState('');

  // Chunk filters
  const [query, setQuery] = useState('');
  const [industry, setIndustry] = useState<string>();
  const [topic, setTopic] = useState<string>();
  const [evidenceType, setEvidenceType] = useState<string>();
  const [reviewStatus, setReviewStatus] = useState<string>();
  const [sourceType, setSourceType] = useState<string>();
  const [activeFilters, setActiveFilters] = useState<AssetFilters>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [manualRefreshing, setManualRefreshing] = useState(false);

  // Store state & actions
  const {
    projects,
    projectsLoading,
    projectsRefreshing,
    candidates,
    works,
    experienceLoading,
    experienceRefreshing,
    chunksCache,
    taxonomy,
    chunksLoading,
    chunksRefreshing,
    chunksError,
    fetchProjects,
    fetchExperienceSummary,
    fetchChunks,
    refreshAll,
  } = useKnowledgeAssetsStore();

  const userId = user?.id || 'default';

  // Current chunks slice from cache
  const currentChunksKey = [
    userId,
    activeFilters.query || '',
    activeFilters.industry || '',
    activeFilters.topic || '',
    activeFilters.evidenceType || '',
    activeFilters.reviewStatus || '',
    activeFilters.sourceType || '',
    currentPage,
    pageSize,
  ].join('_');

  const currentChunkData = chunksCache[currentChunksKey];
  const chunks = currentChunkData?.chunks || [];
  const chunksTotal = currentChunkData?.total || 0;

  const isRefreshing =
    projectsRefreshing || experienceRefreshing || chunksRefreshing || manualRefreshing;

  const handleTabChange = (key: string) => {
    setActiveMainTab(key);
    setSearchParams({ tab: key }, { replace: true });
  };

  useEffect(() => {
    const opts = { userId };
    fetchProjects(opts).catch((e) => {
      if (projects.length === 0) message.error(getApiErrorMessage(e, '加载项目打法资产失败'));
    });
    fetchExperienceSummary(opts).catch((e) => {
      if (candidates.length === 0 && works.length === 0)
        message.error(getApiErrorMessage(e, '加载人才与履历失败'));
    });
    fetchChunks(activeFilters, currentPage, pageSize, opts).catch((e) => {
      if (!currentChunkData) message.error(getApiErrorMessage(e, '加载知识切片失败'));
    });
  }, [
    userId,
    fetchProjects,
    fetchExperienceSummary,
    fetchChunks,
    activeFilters,
    currentPage,
    pageSize,
    projects.length,
    candidates.length,
    works.length,
    currentChunkData,
    message,
  ]);

  const handleManualRefresh = async () => {
    setManualRefreshing(true);
    try {
      const res = await refreshAll(activeFilters, currentPage, pageSize, { userId });
      if (res.success) {
        message.success('知识资产数据已完成更新');
      } else {
        message.warning(`刷新完成，部分维度更新失败: ${res.errors.join('；')}`);
      }
    } catch (e: any) {
      message.error(getApiErrorMessage(e, '刷新失败，已保留当前视图数据'));
    } finally {
      setManualRefreshing(false);
    }
  };

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
      fetchChunks(nextFilters, 1, pageSize, { force: true, userId });
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
      width: 320,
      render: (text: string, record: ProjectAsset) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Text strong style={{ fontSize: '14px', color: '#1e293b' }}>
            {text}
          </Text>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
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
      title: '缺失证据链',
      dataIndex: 'missing_evidence',
      key: 'missing_evidence',
      width: 200,
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
          <Tag color="green" style={{ margin: 0 }}>
            证据链完全闭环
          </Tag>
        );
      },
    },
    {
      title: '预估打法方向',
      dataIndex: 'landing_ideas',
      key: 'landing_ideas',
      width: 180,
      render: (items: any) => renderTags(items, 'geekblue', 2),
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      align: 'center' as const,
      fixed: 'right' as const,
      render: (_: any, record: ProjectAsset) => (
        <Space size={6} wrap={false} style={{ whiteSpace: 'nowrap' }}>
          <Button
            type="primary"
            ghost
            size="small"
            icon={<RobotOutlined />}
            onClick={() => navigate(`/workbench?project_name=${encodeURIComponent(record.name)}`)}
            style={{ borderRadius: '4px' }}
          >
            调起 AI 助手
          </Button>
          {record.resume_id ? (
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/resumes/${record.resume_id}`)}
              style={{ padding: '0 4px', borderRadius: '4px' }}
            >
              查看履历
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
      width: 280,
      render: (tags: any) => {
        const arr = ensureArray(tags);
        return arr.length ? (
          <Space wrap size={[4, 4]}>
            {arr.map((item) => {
              const isSchool =
                item.includes('院校') ||
                item.includes('985') ||
                item.includes('211') ||
                item.includes('学历') ||
                item.includes('硕士') ||
                item.includes('博士') ||
                item.includes('本科');
              const isCompany =
                item.includes('500强') ||
                item.includes('大厂') ||
                item.includes('互联网') ||
                item.includes('知名');
              const color = isSchool
                ? item.includes('985')
                  ? 'purple'
                  : item.includes('211')
                  ? 'cyan'
                  : 'blue'
                : isCompany
                ? item.includes('500强')
                  ? 'gold'
                  : item.includes('互联网')
                  ? 'volcano'
                  : 'blue'
                : 'geekblue';
              const icon = isSchool ? '🎓 ' : isCompany ? '🏢 ' : '';
              return (
                <Tag
                  color={color}
                  key={item}
                  style={{ margin: 0, fontWeight: 600, fontSize: '11px', lineHeight: '18px' }}
                >
                  {icon}
                  {item}
                </Tag>
              );
            })}
          </Space>
        ) : (
          <Text type="secondary">待补充</Text>
        );
      },
    },
    {
      title: '能力验证评分',
      dataIndex: 'fit_score',
      key: 'fit_score',
      width: 130,
      render: (score: number, record: CandidateAsset) => {
        const val = record.fit_score ?? record.match_score ?? score ?? 85;
        const color = val >= 80 ? '#10b981' : val >= 60 ? '#f59e0b' : '#ef4444';
        return (
          <Space>
            <Progress type="circle" percent={val} width={36} strokeColor={color} format={() => val} />
            <Text strong style={{ color }}>
              {val}分
            </Text>
          </Space>
        );
      },
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
          <Text style={{ fontSize: '13px', color: '#334155' }}>
            {text || record.achievement || '主持打法落地'}
          </Text>
          {record.achievement && (
            <div style={{ marginTop: 4 }}>
              <Tag color="green">成果验证: {record.achievement}</Tag>
            </div>
          )}
          {record.capability_tags && record.capability_tags.length > 0 && (
            <div style={{ marginTop: 4 }}>{renderTags(record.capability_tags, 'geekblue', 3)}</div>
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
        <Text
          style={{
            fontSize: '13px',
            color: '#334155',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
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
            <Button
              icon={<ReloadOutlined spin={isRefreshing} />}
              onClick={handleManualRefresh}
              loading={manualRefreshing}
            >
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
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: '15px',
                    fontWeight: 600,
                  }}
                >
                  <ProjectOutlined style={{ color: '#722ed1' }} />
                  <span>📁 项目打法资产库</span>
                  <Tag color="purple" style={{ margin: 0, borderRadius: 10 }}>
                    {projects.length}
                  </Tag>
                </span>
              ),
              children: (
                <div style={{ paddingTop: 8 }}>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 12,
                      justifyContent: 'space-between',
                      marginBottom: 16,
                    }}
                  >
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
                        {
                          label: `存在证据链缺口 (${
                            projects.filter(
                              (p) => p.missing_evidence && p.missing_evidence.length > 0
                            ).length
                          })`,
                          value: 'gaps',
                        },
                      ]}
                    />
                  </div>

                  <Table
                    rowKey={(record) => record._rowKey}
                    loading={projects.length === 0 && projectsLoading}
                    dataSource={filteredProjects}
                    columns={projectColumns}
                    pagination={{ pageSize: 8, showSizeChanger: true }}
                    scroll={{ x: 1000 }}
                    size="middle"
                  />
                </div>
              ),
            },
            {
              key: 'capabilities',
              label: (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: '15px',
                    fontWeight: 600,
                  }}
                >
                  <BulbOutlined style={{ color: '#1890ff' }} />
                  <span>💡 人才能力矩阵库</span>
                  <Tag color="blue" style={{ margin: 0, borderRadius: 10 }}>
                    {candidates.length}
                  </Tag>
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
                    loading={candidates.length === 0 && experienceLoading}
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
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: '15px',
                    fontWeight: 600,
                  }}
                >
                  <ApartmentOutlined style={{ color: '#fa8c16' }} />
                  <span>🔀 任职经历与履历证据库</span>
                  <Tag color="orange" style={{ margin: 0, borderRadius: 10 }}>
                    {works.length}
                  </Tag>
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
                    loading={works.length === 0 && experienceLoading}
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
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: '15px',
                    fontWeight: 600,
                  }}
                >
                  <DatabaseOutlined style={{ color: '#10b981' }} />
                  <span>📄 文档与知识切片片段库</span>
                  <Tag color="green" style={{ margin: 0, borderRadius: 10 }}>
                    {chunksTotal}
                  </Tag>
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

                  <AsyncState
                    loading={!currentChunkData && chunksLoading}
                    error={chunksError}
                    onRetry={() => fetchChunks(activeFilters, currentPage, pageSize, { force: true, userId })}
                  >
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
