import React, { useEffect, useRef, useState } from 'react';
import { Button, Card, Dropdown, Input, message, Modal, Progress, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { MenuProps } from 'antd';
import {
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
import request, { getApiErrorMessage } from '../../utils/request';
import '../BusinessWorkbench.css';

const { Title, Text } = Typography;

const STATUS_MAP: Record<string, { text: string; color: string }> = {
  processing: { text: '分析中', color: 'processing' },
  success: { text: '已分析', color: 'success' },
  failed: { text: '失败', color: 'error' },
};

const getProjectCount = (record: any) => {
  const projects = record.parsed_data?.project_experiences;
  return Array.isArray(projects) ? projects.length : 0;
};

const getQuestionCount = (record: any) => {
  const questions = record.parsed_data?.interview_questions;
  const business = record.parsed_data?.business_model_questions;
  return (Array.isArray(questions) ? questions.length : 0) + (Array.isArray(business) ? business.length : 0);
};

const ResumesList: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [pollingEnabled, setPollingEnabled] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [searchName, setSearchName] = useState('');
  const [parseStatus, setParseStatus] = useState<string | undefined>(undefined);
  const [mailSyncing, setMailSyncing] = useState(false);
  const [reparsingFailed, setReparsingFailed] = useState(false);
  const [batchReparsing, setBatchReparsing] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const navigate = useNavigate();

  const fetchResumes = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params: any = {};
      if (searchName) params.candidate_name = searchName;
      const res = await request.get('/resumes', { params }) as any[];
      const filtered = parseStatus ? res.filter(item => item.parse_status === parseStatus) : res;
      setData(filtered);
      setPollingEnabled(res.some(item => item.parse_status === 'processing'));
    } catch (error) {
      if (!silent) message.error('获取能力样本列表失败');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchResumes();
  }, []);

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
  }, [pollingEnabled, searchName, parseStatus]);

  const handleSyncResumeMail = async () => {
    setMailSyncing(true);
    try {
      const res = (await request.post('/resume-mail-import/sync', undefined, {
        params: { limit: 100 },
        timeout: 120000,
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
    const failedCount = data.filter(item => item.parse_status === 'failed').length;
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
            params: { limit: failedCount },
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

  const analyzedCount = data.filter(item => item.parse_status === 'success').length;
  const failedCount = data.filter(item => item.parse_status === 'failed').length;
  const projectCount = data.reduce((sum, item) => sum + getProjectCount(item), 0);
  const questionCount = data.reduce((sum, item) => sum + getQuestionCount(item), 0);
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
      title: '人才样本',
      dataIndex: 'candidate_name',
      key: 'candidate_name',
      width: 180,
      render: (text: string, record: any) => (
        <div>
          <Text strong>{text || '未识别'}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>{record.email || record.contact || '暂无联系方式'}</Text>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'parse_status',
      key: 'parse_status',
      width: 100,
      render: (status: string) => {
        const item = STATUS_MAP[status] || { text: status || '待处理', color: 'default' };
        return <Tag color={item.color}>{item.text}</Tag>;
      },
    },
    {
      title: '评估分',
      dataIndex: 'match_score',
      key: 'match_score',
      width: 150,
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
        <Tooltip title={record.parsed_data?.experience_summary || record.parse_error || '等待模型分析'}>
          <span>{record.parsed_data?.experience_summary || record.parse_error || '等待模型分析'}</span>
        </Tooltip>
      ),
    },
    {
      title: '项目',
      key: 'projects',
      width: 90,
      render: (_: any, record: any) => getProjectCount(record),
    },
    {
      title: '问题',
      key: 'questions',
      width: 90,
      render: (_: any, record: any) => getQuestionCount(record),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (value: string) => value ? new Date(value).toLocaleString() : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_: any, record: any) => (
        <Space>
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
      <section className="consulting-hero">
        <div className="consulting-hero-copy">
          <span className="dossier-code">Capability Evidence</span>
          <Title level={1}>高级人才能力样本库</Title>
          <Text>集中管理高级白领履历样本，沉淀行业、职能、项目经验和可复用业务方法。</Text>
        </div>
        <Space className="consulting-hero-actions">
          <Dropdown menu={{ items: headerActions }} trigger={['click']}>
            <Button icon={<MoreOutlined />}>更多操作</Button>
          </Dropdown>
          <Button type="primary" icon={<UploadOutlined />} onClick={() => navigate('/resumes/upload')}>
            导入人才样本
          </Button>
        </Space>
      </section>

      <div className="consulting-metric-grid">
        <Card className="consulting-metric-card">
          <span className="metric-icon"><FileTextOutlined /></span>
          <Text type="secondary">样本总数</Text>
          <strong>{data.length}</strong>
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
          <span>可复用项目素材</span>
        </Card>
        <Card className="consulting-metric-card">
          <span className="metric-icon"><QuestionCircleOutlined /></span>
          <Text type="secondary">待处理失败</Text>
          <strong>{failedCount}</strong>
          <span>{questionCount} 个追问已生成</span>
        </Card>
      </div>

      <Card className="consulting-table-card" title="能力样本列表">
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <Input
              placeholder="搜索人才样本"
              prefix={<SearchOutlined />}
              value={searchName}
              onChange={event => setSearchName(event.target.value)}
              onPressEnter={() => fetchResumes()}
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
            <Button type="primary" onClick={() => fetchResumes()}>查询</Button>
            <Button onClick={() => {
              setSearchName('');
              setParseStatus(undefined);
              fetchResumes();
            }}>重置</Button>
          </Space>
          <Space>
            {!!selectedRowKeys.length && <Text type="secondary">已选 {selectedRowKeys.length} 份</Text>}
            <Text type="secondary">已生成问题 {questionCount} 个</Text>
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
          </Space>
        </Space>

        <Table
          className="resume-intelligence-table"
          rowKey="id"
          loading={loading}
          dataSource={data}
          columns={columns}
          rowSelection={{
            columnWidth: 64,
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  );
};

export default ResumesList;
