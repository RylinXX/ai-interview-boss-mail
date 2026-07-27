import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Checkbox, Dropdown, Input, message, Modal, Pagination, Progress, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { MenuProps } from 'antd';
import {
  ClearOutlined,
  DeleteOutlined,
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
import { useNavigate } from 'react-router-dom';
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

const ResumesList: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [metrics, setMetrics] = useState(EMPTY_METRICS);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pollingEnabled, setPollingEnabled] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [searchName, setSearchName] = useState('');
  const [parseStatus, setParseStatus] = useState<string | undefined>(undefined);
  const [activeSearchName, setActiveSearchName] = useState('');
  const [activeParseStatus, setActiveParseStatus] = useState<string | undefined>(undefined);
  const [selectedSchoolTag, setSelectedSchoolTag] = useState<string>('all');
  const [selectedCompanyTag, setSelectedCompanyTag] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [mailSyncing, setMailSyncing] = useState(false);
  const [reparsingFailed, setReparsingFailed] = useState(false);
  const [batchReparsing, setBatchReparsing] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const navigate = useNavigate();

  const fetchResumes = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    if (!silent) setLoadError(null);
    try {
      const params: any = {
        skip: (currentPage - 1) * pageSize,
        limit: pageSize,
      };
      if (activeSearchName) params.candidate_name = activeSearchName;
      if (activeParseStatus) params.parse_status = activeParseStatus;
      if (selectedSchoolTag !== 'all') params.school_tag = selectedSchoolTag;
      if (selectedCompanyTag !== 'all') params.company_tag = selectedCompanyTag;

      const res = await request.get('/resumes/page', { params }) as {
        items: any[];
        total: number;
        metrics: typeof EMPTY_METRICS;
      };
      setData(res.items || []);
      setTotal(res.total || 0);
      setMetrics(res.metrics || EMPTY_METRICS);
      setPollingEnabled((res.metrics?.processing || 0) > 0);
    } catch (error) {
      if (!silent) {
        const errorMessage = getApiErrorMessage(error, '获取人才样本失败，请稍后重试');
        setLoadError(errorMessage);
        message.error(errorMessage);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [activeParseStatus, activeSearchName, currentPage, pageSize, selectedCompanyTag, selectedSchoolTag]);

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
      await fetchResumes();
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
          fetchResumes();
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
          await fetchResumes();
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
          fetchResumes();
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
          fetchResumes();
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
          await fetchResumes();
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
    if (currentPage === 1 && nextSearchName === activeSearchName && parseStatus === activeParseStatus) {
      fetchResumes();
      return;
    }
    setCurrentPage(1);
    setActiveSearchName(nextSearchName);
    setActiveParseStatus(parseStatus);
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

  const columns = [
    {
      title: '人才样本与评估标签',
      dataIndex: 'candidate_name',
      key: 'candidate_name',
      width: 240,
      render: (text: string, record: any) => {
        const schoolTags = record.school_tags || record.parsed_data?.school_tags || [];
        const companyTags = record.company_tags || record.parsed_data?.company_tags || [];
        const salary = record.salary_expectation || record.parsed_data?.salary_expectation || record.parsed_data?.expected_salary;

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div>
              <Text strong style={{ fontSize: '14px' }}><SensitiveField value={text} kind="name" /></Text>
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
      width: 88,
      render: (status: string) => {
        const item = STATUS_MAP[status] || { text: status || '待处理', color: 'default' };
        return <Tag color={item.color}>{item.text}</Tag>;
      },
    },
    {
      title: '评估分',
      dataIndex: 'match_score',
      key: 'match_score',
      width: 96,
      sorter: (a: any, b: any) => (a.match_score || 0) - (b.match_score || 0),
      render: (score: number | null) => score == null ? '-' : (
        <Space>
          <Progress
            type="circle"
            size={38}
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
      width: 72,
      render: (_: any, record: any) => getProjectCount(record),
    },
    {
      title: '问题',
      key: 'questions',
      width: 72,
      render: (_: any, record: any) => getQuestionCount(record),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 144,
      render: (value: string) => value ? new Date(value).toLocaleString() : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 152,
      fixed: 'right' as const,
      className: 'actions-column',
      render: (_: any, record: any) => (
        <Space className="resume-row-actions" size={6}>
          <Tooltip title="查看分析">
            <Button icon={<EyeOutlined />} onClick={() => navigate(`/resumes/${record.id}`)} />
          </Tooltip>
          <Tooltip title="重新分析">
            <Button icon={<ReloadOutlined />} onClick={() => handleReparse(record)} disabled={record.parse_status === 'processing'} />
          </Tooltip>
          <Tooltip title="删除">
            <Button danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div className="resume-list-page workbench-page">
      <ModulePageHeader
        eyebrow={<><FileTextOutlined /> 能力证据</>}
        title="人才样本"
        description="集中管理履历样本，沉淀行业、职能、项目经验和可复用业务方法。"
        actions={<>
          <Dropdown menu={{ items: headerActions }} trigger={['click']}>
            <Button icon={<MoreOutlined />}>更多操作</Button>
          </Dropdown>
          <Button type="primary" icon={<UploadOutlined />} onClick={() => navigate('/resumes/upload')}>
            导入样本
          </Button>
        </>}
      />

      <AsyncState loading={loading} error={loadError} onRetry={() => fetchResumes()}>
        <div className="consulting-metric-grid">
          <Card className="consulting-metric-card">
            <span className="metric-icon"><FileTextOutlined /></span>
            <Text type="secondary">样本总数</Text>
            <strong>{metrics.total}</strong>
            <span>已入库能力样本</span>
          </Card>
          <Card className="consulting-metric-card">
            <span className="metric-icon"><TrophyOutlined /></span>
            <Text type="secondary">已分析</Text>
            <strong>{analyzedCount}</strong>
            <span>模型完成结构化解析</span>
          </Card>
          <Card className="consulting-metric-card">
            <span className="metric-icon"><ProjectOutlined /></span>
            <Text type="secondary">项目经历</Text>
            <strong>{projectCount}</strong>
            <span>当前页可复用素材</span>
          </Card>
          <Card className="consulting-metric-card">
            <span className="metric-icon"><QuestionCircleOutlined /></span>
            <Text type="secondary">待处理失败</Text>
            <strong>{failedCount}</strong>
            <span>当前页生成 {questionCount} 个追问</span>
          </Card>
        </div>

        <Card className="consulting-table-card" title="人才样本列表">
          <div className="data-toolbar">
            <div className="data-toolbar-group">
            <Input
              placeholder="搜索人才样本"
              prefix={<SearchOutlined />}
              value={searchName}
              onChange={event => setSearchName(event.target.value)}
              onPressEnter={applyFilters}
              allowClear
              style={{ width: 220 }}
            />
            <Select
              placeholder="分析状态"
              allowClear
              value={parseStatus}
              onChange={setParseStatus}
              style={{ width: 150 }}
              options={[
                { value: 'processing', label: '分析中' },
                { value: 'success', label: '已分析' },
                { value: 'failed', label: '失败' },
              ]}
            />
            <Button type="primary" onClick={applyFilters}>查询</Button>
            <Button onClick={() => {
              setSearchName('');
              setParseStatus(undefined);
              setCurrentPage(1);
              setActiveSearchName('');
              setActiveParseStatus(undefined);
            }}>重置</Button>
            </div>
            <div className="data-toolbar-group">
            {!!selectedRowKeys.length && <Text type="secondary">已选 {selectedRowKeys.length} 份</Text>}
            <Text type="secondary">当前页已生成问题 {questionCount} 个</Text>
            <Button
              icon={<ReloadOutlined />}
              loading={batchReparsing}
              disabled={!selectedRowKeys.length}
              onClick={handleBatchReparse}
            >
              批量重新生成
            </Button>
            <Button danger disabled={!selectedRowKeys.length} onClick={handleBatchDelete}>
              批量删除
            </Button>
            </div>
          </div>

          {/* 人才特征与结构化标签二次筛选栏 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 12, marginBottom: 16, padding: '10px 16px', background: 'rgba(201, 150, 63, 0.05)', borderRadius: 8, border: '1px solid rgba(201, 150, 63, 0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text strong style={{ fontSize: '12px', color: '#8c6019', marginRight: 2 }}>🎓 院校背景:</Text>
              {['all', '985院校', '211院校', 'QS前30/海外名校', '硕士学历'].map(tag => (
                <Tag.CheckableTag
                  key={tag}
                  checked={selectedSchoolTag === tag}
                  onChange={() => {
                    setSelectedSchoolTag(selectedSchoolTag === tag ? 'all' : tag);
                    setCurrentPage(1);
                  }}
                  style={{ borderRadius: 12, padding: '1px 10px', fontSize: '12px' }}
                >
                  {tag === 'all' ? '全部院校' : tag}
                </Tag.CheckableTag>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text strong style={{ fontSize: '12px', color: '#8c6019', marginRight: 2 }}>🏢 履历平台:</Text>
              {['all', '一线互联网/大厂', '世界500强', '国央企/大型名企'].map(tag => (
                <Tag.CheckableTag
                  key={tag}
                  checked={selectedCompanyTag === tag}
                  onChange={() => {
                    setSelectedCompanyTag(selectedCompanyTag === tag ? 'all' : tag);
                    setCurrentPage(1);
                  }}
                  style={{ borderRadius: 12, padding: '1px 10px', fontSize: '12px' }}
                >
                  {tag === 'all' ? '全部履历' : tag}
                </Tag.CheckableTag>
              ))}
            </div>

            {(selectedSchoolTag !== 'all' || selectedCompanyTag !== 'all') && (
              <Button
                type="link"
                size="small"
                icon={<ClearOutlined />}
                onClick={() => {
                  setSelectedSchoolTag('all');
                  setSelectedCompanyTag('all');
                  setCurrentPage(1);
                }}
                style={{ fontSize: '12px', color: '#ff4d4f', paddingLeft: 4 }}
              >
                重置标签筛选
              </Button>
            )}
          </div>

          <ResponsiveDataView
            desktop={(
              <Table
                className="resume-intelligence-table"
                rowKey="id"
                dataSource={data}
                columns={columns}
                tableLayout="fixed"
                scroll={{ x: 1120 }}
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
                    setCurrentPage(page);
                    setPageSize(size);
                    setSelectedRowKeys([]);
                  },
                }}
              />
            )}
            mobile={(
              <>
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
                      setCurrentPage(page);
                      setSelectedRowKeys([]);
                    }}
                  />
                ) : null}
              </>
            )}
          />
          {!data.length ? <AsyncState empty emptyDescription="暂无符合条件的人才样本"><span /></AsyncState> : null}
        </Card>
      </AsyncState>
    </div>
  );
};

export default ResumesList;
