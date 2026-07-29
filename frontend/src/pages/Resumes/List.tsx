import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Checkbox, Divider, Dropdown, Input, message, Modal, Pagination, Progress, Select, Space, Spin, Table, Tag, Tooltip, Typography } from 'antd';
import type { MenuProps } from 'antd';
import {
  ClearOutlined,
  DeleteOutlined,
  DownOutlined,
  EyeOutlined,
  FileTextOutlined,
  MoreOutlined,
  ProjectOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  SyncOutlined,
  TrophyOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import request, { getApiErrorMessage, getResumeParseErrorMessage } from '../../utils/request';
import { AsyncState, ModulePageHeader, ResponsiveDataView, SensitiveField } from '../../components/Workbench';
import '../BusinessWorkbench.css';

const { Text } = Typography;

const STATUS_MAP: Record<string, { text: string; color: string }> = {
  processing: { text: '分析中', color: 'processing' },
  success: { text: '已分析', color: 'success' },
  failed: { text: '失败', color: 'error' },
};

const getProjectCount = (record: any) => {
  if (Number.isFinite(record.project_count)) return record.project_count;
  const projects = record.parsed_data?.project_experiences;
  return Array.isArray(projects) ? projects.length : 0;
};

const getQuestionCount = (record: any) => {
  if (Number.isFinite(record.question_count)) return record.question_count;
  const questions = record.parsed_data?.interview_questions;
  const business = record.parsed_data?.business_model_questions;
  return (Array.isArray(questions) ? questions.length : 0) + (Array.isArray(business) ? business.length : 0);
};

const getResumeSummary = (record: any) => (
  record.experience_summary
  || record.parsed_data?.experience_summary
  || (record.parse_status === 'failed' ? getResumeParseErrorMessage(record.parse_error) : '等待模型分析')
);

const EMPTY_METRICS = { total: 0, success: 0, processing: 0, failed: 0, pending: 0 };

const GLOBAL_RESUME_LIST_CACHE = new Map<string, { allItems: any[]; total: number; metrics: typeof EMPTY_METRICS }>();

export const clearResumeListCache = () => {
  GLOBAL_RESUME_LIST_CACHE.clear();
};

const ResumesList: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const queryName = searchParams.get('candidate_name') || '';
  const queryStatus = searchParams.get('parse_status') || undefined;
  const queryPositionId = searchParams.get('position_id') || undefined;
  const queryScoreRange = searchParams.get('score_range') || undefined;
  const querySchoolTag = searchParams.get('school_tag') || 'all';
  const queryCompanyTag = searchParams.get('company_tag') || 'all';
  const queryPage = Number(searchParams.get('page')) || 1;
  const queryPageSize = Number(searchParams.get('pageSize')) || 10;

  const initialFilterKey = JSON.stringify({
    name: queryName,
    status: queryStatus,
    position: queryPositionId,
    score: queryScoreRange,
    school: querySchoolTag,
    company: queryCompanyTag,
  });
  const cachedInitial = GLOBAL_RESUME_LIST_CACHE.get(initialFilterKey);
  const initialSliced = cachedInitial ? cachedInitial.allItems.slice((queryPage - 1) * queryPageSize, queryPage * queryPageSize) : [];

  const [data, setData] = useState<any[]>(initialSliced);
  const [total, setTotal] = useState(cachedInitial?.total || 0);
  const [metrics, setMetrics] = useState(cachedInitial?.metrics || EMPTY_METRICS);
  const [initialLoading, setInitialLoading] = useState(!cachedInitial);
  const [tableLoading, setTableLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pollingEnabled, setPollingEnabled] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [searchName, setSearchName] = useState(queryName);
  const [parseStatus, setParseStatus] = useState<string | undefined>(queryStatus);
  const [activeSearchName, setActiveSearchName] = useState(queryName);
  const [activeParseStatus, setActiveParseStatus] = useState<string | undefined>(queryStatus);
  const [positions, setPositions] = useState<any[]>([]);
  const [selectedPositionId, setSelectedPositionId] = useState<string | undefined>(queryPositionId);
  const [selectedScoreRange, setSelectedScoreRange] = useState<string | undefined>(queryScoreRange);
  const [selectedSchoolTag, setSelectedSchoolTag] = useState<string>(querySchoolTag);
  const [selectedCompanyTag, setSelectedCompanyTag] = useState<string>(queryCompanyTag);
  const [currentPage, setCurrentPage] = useState(queryPage);
  const [pageSize, setPageSize] = useState(queryPageSize);
  const [mailSyncing, setMailSyncing] = useState(false);
  const [reparsingFailed, setReparsingFailed] = useState(false);
  const [batchReparsing, setBatchReparsing] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  useEffect(() => {
    request.get('/positions').then((res: any) => {
      setPositions(res || []);
    }).catch(() => {});
  }, []);

  const updateUrlParams = useCallback((newParams: Record<string, any>) => {
    const params: Record<string, string> = {};
    if (newParams.candidate_name) params.candidate_name = newParams.candidate_name;
    if (newParams.parse_status) params.parse_status = newParams.parse_status;
    if (newParams.position_id) params.position_id = newParams.position_id;
    if (newParams.score_range) params.score_range = newParams.score_range;
    if (newParams.school_tag && newParams.school_tag !== 'all') params.school_tag = newParams.school_tag;
    if (newParams.company_tag && newParams.company_tag !== 'all') params.company_tag = newParams.company_tag;
    if (newParams.page && newParams.page > 1) params.page = String(newParams.page);
    if (newParams.pageSize && newParams.pageSize !== 10) params.pageSize = String(newParams.pageSize);

    setSearchParams(params, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    const name = searchParams.get('candidate_name') || '';
    const status = searchParams.get('parse_status') || undefined;
    const posId = searchParams.get('position_id') || undefined;
    const score = searchParams.get('score_range') || undefined;
    const school = searchParams.get('school_tag') || 'all';
    const company = searchParams.get('company_tag') || 'all';
    const page = Number(searchParams.get('page')) || 1;
    const size = Number(searchParams.get('pageSize')) || 10;

    setSearchName(name);
    setActiveSearchName(name);
    setParseStatus(status);
    setActiveParseStatus(status);
    setSelectedPositionId(posId);
    setSelectedScoreRange(score);
    setSelectedSchoolTag(school);
    setSelectedCompanyTag(company);
    setCurrentPage(page);
    setPageSize(size);
  }, [searchParams]);

  const fetchResumes = useCallback(async (silent = false, bypassCache = false) => {
    const filterKey = JSON.stringify({
      name: activeSearchName,
      status: activeParseStatus,
      position: selectedPositionId,
      score: selectedScoreRange,
      school: selectedSchoolTag,
      company: selectedCompanyTag,
    });

    const cached = GLOBAL_RESUME_LIST_CACHE.get(filterKey);
    if (cached && !bypassCache) {
      const sliced = cached.allItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);
      setData(sliced);
      setTotal(cached.total);
      setMetrics(cached.metrics);
      setInitialLoading(false);
      setTableLoading(false);
      setPollingEnabled((cached.metrics?.processing || 0) > 0);
      return;
    }

    if (!silent) {
      if (data.length === 0) {
        setInitialLoading(true);
      } else {
        setTableLoading(true);
      }
      setLoadError(null);
    }

    try {
      const params: any = {
        skip: 0,
        limit: 500,
      };
      if (activeSearchName) params.candidate_name = activeSearchName;
      if (activeParseStatus) params.parse_status = activeParseStatus;
      if (selectedPositionId) params.position_id = selectedPositionId;
      if (selectedScoreRange) params.score_range = selectedScoreRange;
      if (selectedSchoolTag !== 'all') params.school_tag = selectedSchoolTag;
      if (selectedCompanyTag !== 'all') params.company_tag = selectedCompanyTag;

      const res = await request.get('/resumes/page', { params }) as {
        items: any[];
        total: number;
        metrics: typeof EMPTY_METRICS;
      };

      const allItems = res.items || [];
      const totalCount = res.total ?? allItems.length;
      const metricsData = res.metrics || EMPTY_METRICS;

      const result = {
        allItems,
        total: totalCount,
        metrics: metricsData,
      };

      GLOBAL_RESUME_LIST_CACHE.set(filterKey, result);
      const sliced = allItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);
      setData(sliced);
      setTotal(totalCount);
      setMetrics(metricsData);
      setPollingEnabled((metricsData.processing || 0) > 0);
    } catch (error) {
      if (!silent) {
        const errorMessage = getApiErrorMessage(error, '获取人才样本失败，请稍后重试');
        setLoadError(errorMessage);
        message.error(errorMessage);
      }
    } finally {
      if (!silent) {
        setInitialLoading(false);
        setTableLoading(false);
      }
    }
  }, [activeParseStatus, activeSearchName, selectedPositionId, selectedScoreRange, selectedSchoolTag, selectedCompanyTag, currentPage, pageSize, data.length]);

  useEffect(() => {
    fetchResumes();
  }, [fetchResumes]);

  useEffect(() => {
    if (pollingEnabled) {
      pollingRef.current = setInterval(() => fetchResumes(true), 3000);
    } else if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [fetchResumes, pollingEnabled]);

  const handleSyncResumeMail = async () => {
    setMailSyncing(true);
    try {
      const res = (await request.post('/resume-mail-import/sync', undefined, {
        params: { limit: 200 },
        timeout: 240000,
      })) as any;
      const summary = `扫描 ${res.scanned_messages ?? 0}，导入 ${res.imported ?? 0}，跳过 ${res.skipped ?? 0}，失败 ${res.failed ?? 0}`;
      if ((res.failed ?? 0) > 0) {
        message.warning(`邮箱同步完成：${summary}`);
      } else {
        message.success(`邮箱同步完成：${summary}`);
      }
      GLOBAL_RESUME_LIST_CACHE.clear();
      await fetchResumes(false, true);
    } catch (error) {
      message.error(getApiErrorMessage(error, '邮箱同步失败，请先检查系统设置里的样本导入配置'));
    } finally {
      setMailSyncing(false);
    }
  };

  const handleReparse = (record: any) => {
    Modal.confirm({
      title: '重新分析能力样本',
      content: '将重新调用模型读取样本并覆盖现有分析结果。',
      okText: '重新分析',
      cancelText: '取消',
      onOk: async () => {
        try {
          await request.post(`/resumes/${record.id}/reparse`);
          message.success('已提交重新分析');
          GLOBAL_RESUME_LIST_CACHE.clear();
          fetchResumes(false, true);
        } catch (error) {
          message.error(getApiErrorMessage(error, '重新分析失败'));
        }
      },
    });
  };

  const handleReparseFailed = () => {
    const failedCount = metrics.failed;
    if (!failedCount) {
      message.info('当前没有失败的能力样本');
      return;
    }
    Modal.confirm({
      title: '批量重新分析失败样本',
      content: `将重新提交 ${failedCount} 份失败能力样本到模型解析队列。`,
      okText: '开始',
      cancelText: '取消',
      onOk: async () => {
        setReparsingFailed(true);
        try {
          const res = await request.post('/resumes/reparse-failed', undefined, {
            params: { limit: Math.min(failedCount, 100) },
          }) as any;
          message.success(`已提交 ${res.queued_count || 0} 份能力样本重新分析`);
          GLOBAL_RESUME_LIST_CACHE.clear();
          await fetchResumes(false, true);
        } catch (error) {
          message.error(getApiErrorMessage(error, '批量重新分析失败'));
        } finally {
          setReparsingFailed(false);
        }
      },
    });
  };

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这份能力样本吗？此操作不可恢复。',
      okText: '删除',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        try {
          await request.delete(`/resumes/${id}`);
          message.success('删除成功');
          GLOBAL_RESUME_LIST_CACHE.clear();
          fetchResumes(false, true);
        } catch (error) {
          message.error(getApiErrorMessage(error, '删除失败'));
        }
      },
    });
  };

  const handleBatchDelete = () => {
    if (!selectedRowKeys.length) {
      message.warning('请先选择要删除的能力样本');
      return;
    }
    Modal.confirm({
      title: '批量删除能力样本',
      content: `确定删除选中的 ${selectedRowKeys.length} 份能力样本吗？`,
      okText: '删除',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        try {
          await Promise.all(selectedRowKeys.map(id => request.delete(`/resumes/${id}`)));
          setSelectedRowKeys([]);
          message.success('批量删除成功');
          GLOBAL_RESUME_LIST_CACHE.clear();
          fetchResumes(false, true);
        } catch (error) {
          message.error(getApiErrorMessage(error, '批量删除失败'));
        }
      },
    });
  };

  const handleBatchReparse = () => {
    if (!selectedRowKeys.length) {
      message.warning('请先选择要重新分析的能力样本');
      return;
    }

    const selectedRecords = data.filter(item => selectedRowKeys.includes(item.id));
    const reparsableRecords = selectedRecords.filter(item => item.parse_status !== 'processing');
    const skippedCount = selectedRecords.length - reparsableRecords.length;

    if (!reparsableRecords.length) {
      message.info('选中的能力样本都在分析中，无需重复提交');
      return;
    }

    Modal.confirm({
      title: '批量重新生成分析',
      content: `将重新提交 ${reparsableRecords.length} 份能力样本到模型分析队列${skippedCount ? `，跳过 ${skippedCount} 份正在分析的样本` : ''}。`,
      okText: '重新生成',
      cancelText: '取消',
      onOk: async () => {
        setBatchReparsing(true);
        try {
          await Promise.all(reparsableRecords.map(record => request.post(`/resumes/${record.id}/reparse`)));
          setSelectedRowKeys([]);
          message.success(`已提交 ${reparsableRecords.length} 份能力样本重新生成`);
          GLOBAL_RESUME_LIST_CACHE.clear();
          await fetchResumes(false, true);
        } catch (error) {
          message.error(getApiErrorMessage(error, '批量重新分析失败'));
        } finally {
          setBatchReparsing(false);
        }
      },
    });
  };

  const analyzedCount = metrics.success;
  const failedCount = metrics.failed;
  const projectCount = data.reduce((sum, item) => sum + getProjectCount(item), 0);
  const questionCount = data.reduce((sum, item) => sum + getQuestionCount(item), 0);
  const applyFilters = () => {
    const nextSearchName = searchName.trim();
    setActiveSearchName(nextSearchName);
    setActiveParseStatus(parseStatus);
    setCurrentPage(1);
    updateUrlParams({
      candidate_name: nextSearchName,
      parse_status: parseStatus,
      position_id: selectedPositionId,
      score_range: selectedScoreRange,
      school_tag: selectedSchoolTag,
      company_tag: selectedCompanyTag,
      page: 1,
      pageSize,
    });
  };
  const headerActions: MenuProps['items'] = [
    {
      key: 'sync-mail',
      icon: <SyncOutlined spin={mailSyncing} />,
      label: mailSyncing ? '同步中...' : '同步邮箱样本',
      disabled: mailSyncing,
      onClick: handleSyncResumeMail,
    },
    {
      key: 'retry-failed',
      icon: <ReloadOutlined spin={reparsingFailed} />,
      label: reparsingFailed ? '重试中...' : '重试失败',
      disabled: reparsingFailed,
      onClick: handleReparseFailed,
    },
  ];

  const batchMenuItems: MenuProps['items'] = [
    {
      key: 'batch-reparse',
      icon: <ReloadOutlined spin={batchReparsing} />,
      label: '批量重新生成',
      disabled: !selectedRowKeys.length || batchReparsing,
      onClick: handleBatchReparse,
    },
    {
      type: 'divider',
    },
    {
      key: 'batch-delete',
      danger: true,
      icon: <DeleteOutlined />,
      label: '批量删除',
      disabled: !selectedRowKeys.length,
      onClick: handleBatchDelete,
    },
  ];

  const columns = [
    {
      title: '人才样本与评估标签',
      dataIndex: 'candidate_name',
      key: 'candidate_name',
      width: '22%',
      render: (text: string, record: any) => {
        const schoolTags = record.school_tags || record.parsed_data?.school_tags || [];
        const companyTags = record.company_tags || record.parsed_data?.company_tags || [];
        const salary = record.salary_expectation || record.parsed_data?.salary_expectation || record.parsed_data?.expected_salary;

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
              <Text strong style={{ fontSize: '14px' }}><SensitiveField value={text} kind="name" /></Text>
              {record.position_name && (
                <Tag color="geekblue" style={{ margin: 0, fontSize: '11px', lineHeight: '18px', fontWeight: 600 }}>
                  🎯 {record.position_name}
                </Tag>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 5px' }}>
              {salary && salary !== '面议' && (
                <Tag color="magenta" style={{ margin: 0, fontSize: '11px', lineHeight: '18px', fontWeight: 600 }}>
                  💰 {salary}
                </Tag>
              )}
              {schoolTags.map((t: string) => (
                <Tag color={t.includes('985') ? 'purple' : t.includes('211') ? 'cyan' : 'geekblue'} key={t} style={{ margin: 0, fontSize: '11px', lineHeight: '18px', fontWeight: 600 }}>
                  🎓 {t}
                </Tag>
              ))}
              {companyTags.map((t: string) => (
                <Tag color={t.includes('互联网') ? 'volcano' : t.includes('500强') ? 'gold' : 'blue'} key={t} style={{ margin: 0, fontSize: '11px', lineHeight: '18px', fontWeight: 600 }}>
                  🏢 {t}
                </Tag>
              ))}
            </div>
            <Text type="secondary" style={{ fontSize: 11 }}>
              <SensitiveField
                value={record.email || record.contact}
                kind={record.email ? 'email' : 'phone'}
                fallback="暂无联系方式"
              />
            </Text>
          </div>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'parse_status',
      key: 'parse_status',
      width: '7%',
      render: (status: string) => {
        const item = STATUS_MAP[status] || { text: status || '待处理', color: 'default' };
        return <Tag color={item.color}>{item.text}</Tag>;
      },
    },
    {
      title: '评估分',
      dataIndex: 'match_score',
      key: 'match_score',
      width: '7%',
      sorter: (a: any, b: any) => (a.match_score || 0) - (b.match_score || 0),
      render: (score: number | null) => score == null ? '-' : (
        <Space>
          <Progress
            type="circle"
            size={36}
            percent={score}
            strokeColor={score >= 80 ? '#059669' : score >= 60 ? '#D97706' : '#DC2626'}
            format={() => score}
          />
        </Space>
      ),
    },
    {
      title: '核心经历概要',
      key: 'summary',
      width: '30%',
      ellipsis: true,
      render: (_: any, record: any) => (
        <Tooltip title={getResumeSummary(record)}>
          <span>{getResumeSummary(record)}</span>
        </Tooltip>
      ),
    },
    {
      title: '项目',
      key: 'projects',
      width: '5%',
      render: (_: any, record: any) => getProjectCount(record),
    },
    {
      title: '问题',
      key: 'questions',
      width: '5%',
      render: (_: any, record: any) => getQuestionCount(record),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: '10%',
      render: (value: string) => value ? new Date(value).toLocaleDateString('zh-CN') : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: '14%',
      align: 'center' as const,
      render: (_: any, record: any) => (
        <Space className="resume-row-actions" size={4}>
          <Tooltip title="查看分析">
            <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/resumes/${record.id}`)} />
          </Tooltip>
          <Tooltip title="重新分析">
            <Button size="small" icon={<ReloadOutlined />} onClick={() => handleReparse(record)} disabled={record.parse_status === 'processing'} />
          </Tooltip>
          <Tooltip title="删除">
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const headerMetrics = [
    { label: '样本总数', value: metrics.total, hint: '已入库能力样本', icon: <FileTextOutlined /> },
    { label: '已分析', value: analyzedCount, hint: '模型结构化解析', icon: <TrophyOutlined /> },
    { label: '项目经历', value: projectCount, hint: '当前页可复用素材', icon: <ProjectOutlined /> },
    { label: '待处理失败', value: failedCount, hint: `当前页生成 ${questionCount} 个追问`, icon: <QuestionCircleOutlined /> },
  ];

  return (
    <div className="resume-list-page workbench-page">
      <ModulePageHeader
        eyebrow={<><FileTextOutlined /> 能力证据</>}
        title="人才样本"
        description="集中管理履历样本，沉淀行业、职能、项目经验和可复用业务方法。"
        metrics={headerMetrics}
        actions={<>
          <Dropdown menu={{ items: headerActions }} trigger={['click']}>
            <Button icon={<MoreOutlined />}>更多操作</Button>
          </Dropdown>
          <Button type="primary" icon={<UploadOutlined />} onClick={() => navigate('/resumes/upload')}>
            导入样本
          </Button>
        </>}
      />

      <AsyncState loading={initialLoading} error={loadError} onRetry={() => fetchResumes(false, true)}>
        <Card className="consulting-table-card" title="人才样本列表">
          <div className="data-toolbar" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <Input
              placeholder="搜索人才"
              prefix={<SearchOutlined />}
              value={searchName}
              onChange={event => setSearchName(event.target.value)}
              onPressEnter={applyFilters}
              allowClear
              style={{ width: 130 }}
            />
            <Select
              placeholder="🎯 投递岗位"
              allowClear
              value={selectedPositionId}
              onChange={val => {
                setSelectedPositionId(val);
                updateUrlParams({
                  candidate_name: activeSearchName,
                  parse_status: activeParseStatus,
                  position_id: val,
                  score_range: selectedScoreRange,
                  school_tag: selectedSchoolTag,
                  company_tag: selectedCompanyTag,
                  page: 1,
                  pageSize,
                });
              }}
              style={{ width: 140 }}
              options={positions.map((p: any) => ({ value: p.id, label: `🎯 ${p.title}` }))}
            />
            <Select
              placeholder="⭐ 评估分筛选"
              allowClear
              value={selectedScoreRange}
              onChange={val => {
                setSelectedScoreRange(val);
                updateUrlParams({
                  candidate_name: activeSearchName,
                  parse_status: activeParseStatus,
                  position_id: selectedPositionId,
                  score_range: val,
                  school_tag: selectedSchoolTag,
                  company_tag: selectedCompanyTag,
                  page: 1,
                  pageSize,
                });
              }}
              style={{ width: 150 }}
              options={[
                { value: '80-100', label: '🏆 优秀 (80-100分)' },
                { value: '60-79', label: '👍 良好 (60-79分)' },
                { value: '0-59', label: '⚠️ 待提升 (60分以下)' },
                { value: 'unscored', label: '❓ 未评分' },
              ]}
            />
            <Select
              placeholder="分析状态"
              allowClear
              value={parseStatus}
              onChange={val => {
                setParseStatus(val);
              }}
              style={{ width: 100 }}
              options={[
                { value: 'processing', label: '分析中' },
                { value: 'success', label: '已分析' },
                { value: 'failed', label: '失败' },
              ]}
            />
            <Select
              placeholder="🎓 院校背景"
              allowClear
              value={selectedSchoolTag === 'all' ? undefined : selectedSchoolTag}
              onChange={val => {
                const nextTag = val || 'all';
                updateUrlParams({
                  candidate_name: activeSearchName,
                  parse_status: activeParseStatus,
                  position_id: selectedPositionId,
                  score_range: selectedScoreRange,
                  school_tag: nextTag,
                  company_tag: selectedCompanyTag,
                  page: 1,
                  pageSize,
                });
              }}
              style={{ width: 135 }}
              options={[
                { value: '985院校', label: '🎓 985院校' },
                { value: '211院校', label: '🎓 211院校' },
                { value: 'QS前30/海外名校', label: '🎓 QS前30/海外名校' },
                { value: '硕士学历', label: '🎓 硕士学历' },
              ]}
            />
            <Select
              placeholder="🏢 履历平台"
              allowClear
              value={selectedCompanyTag === 'all' ? undefined : selectedCompanyTag}
              onChange={val => {
                const nextTag = val || 'all';
                updateUrlParams({
                  candidate_name: activeSearchName,
                  parse_status: activeParseStatus,
                  position_id: selectedPositionId,
                  score_range: selectedScoreRange,
                  school_tag: selectedSchoolTag,
                  company_tag: nextTag,
                  page: 1,
                  pageSize,
                });
              }}
              style={{ width: 140 }}
              options={[
                { value: '一线互联网/大厂', label: '🏢 一线互联网/大厂' },
                { value: '世界500强', label: '🏢 世界500强' },
                { value: '国央企/大型名企', label: '🏢 国央企/大型名企' },
              ]}
            />
            <Button type="primary" onClick={applyFilters}>查询</Button>
            <Button onClick={() => {
              setSearchName('');
              setParseStatus(undefined);
              setSelectedPositionId(undefined);
              setSelectedScoreRange(undefined);
              setSelectedSchoolTag('all');
              setSelectedCompanyTag('all');
              setCurrentPage(1);
              setActiveSearchName('');
              setActiveParseStatus(undefined);
              setSearchParams({}, { replace: true });
            }}>重置</Button>

            <Divider type="vertical" style={{ height: 20, margin: '0 2px' }} />

            <Text type="secondary" style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
              问题 {questionCount} 个
            </Text>
            <Dropdown menu={{ items: batchMenuItems }} disabled={!selectedRowKeys.length} trigger={['click']}>
              <Button icon={<DownOutlined />}>
                批量操作 {selectedRowKeys.length ? `(${selectedRowKeys.length})` : ''}
              </Button>
            </Dropdown>
          </div>

          <ResponsiveDataView
            desktop={(
              <Table
                className="resume-intelligence-table"
                rowKey="id"
                dataSource={data}
                columns={columns}
                loading={tableLoading}
                tableLayout="fixed"
                rowSelection={{
                  columnWidth: 64,
                  selectedRowKeys,
                  onChange: setSelectedRowKeys,
                }}
                pagination={{
                  current: currentPage,
                  pageSize,
                  total,
                  showSizeChanger: true,
                  pageSizeOptions: [10, 20, 50],
                  onChange: (page, size) => {
                    updateUrlParams({
                      candidate_name: activeSearchName,
                      parse_status: activeParseStatus,
                      position_id: selectedPositionId,
                      score_range: selectedScoreRange,
                      school_tag: selectedSchoolTag,
                      company_tag: selectedCompanyTag,
                      page,
                      pageSize: size,
                    });
                    setSelectedRowKeys([]);
                  },
                }}
              />
            )}
            mobile={(
              <Spin spinning={tableLoading}>
                <div className="mobile-record-grid">
                  {data.map(record => {
                    const status = STATUS_MAP[record.parse_status] || { text: '待处理', color: 'default' };
                    const selected = selectedRowKeys.includes(record.id);
                    return (
                      <article className="mobile-record-card" key={record.id}>
                        <div className="mobile-record-head">
                          <Checkbox
                            checked={selected}
                            onChange={() => setSelectedRowKeys(keys => selected ? keys.filter(key => key !== record.id) : [...keys, record.id])}
                            aria-label={`选择样本 ${record.id}`}
                          />
                          <div className="mobile-record-title">
                            <strong><SensitiveField value={record.candidate_name} kind="name" /></strong>
                            <span><SensitiveField value={record.email || record.contact} kind={record.email ? 'email' : 'phone'} fallback="暂无联系方式" /></span>
                          </div>
                          <Tag color={status.color}>{status.text}</Tag>
                        </div>
                        <p className="mobile-record-summary">{getResumeSummary(record)}</p>
                        <div className="mobile-record-meta">
                          <span>评分 {record.match_score ?? '-'}</span>
                          <span>项目 {getProjectCount(record)}</span>
                          <span>问题 {getQuestionCount(record)}</span>
                          <span>{record.created_at ? new Date(record.created_at).toLocaleDateString('zh-CN') : '-'}</span>
                        </div>
                        <div className="mobile-record-actions">
                          <Button icon={<EyeOutlined />} onClick={() => navigate(`/resumes/${record.id}`)} aria-label="查看分析">查看</Button>
                          <Button icon={<ReloadOutlined />} onClick={() => handleReparse(record)} disabled={record.parse_status === 'processing'} aria-label="重新分析" />
                          <Button danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} aria-label="删除样本" />
                        </div>
                      </article>
                    );
                  })}
                </div>
                {total > pageSize ? (
                  <Pagination
                    className="mobile-data-pagination"
                    simple
                    current={currentPage}
                    pageSize={pageSize}
                    total={total}
                    onChange={page => {
                      updateUrlParams({
                        candidate_name: activeSearchName,
                        parse_status: activeParseStatus,
                        position_id: selectedPositionId,
                        score_range: selectedScoreRange,
                        school_tag: selectedSchoolTag,
                        company_tag: selectedCompanyTag,
                        page,
                        pageSize,
                      });
                      setSelectedRowKeys([]);
                    }}
                  />
                ) : null}
              </Spin>
            )}
          />
        </Card>
      </AsyncState>
    </div>
  );
};

export default ResumesList;
