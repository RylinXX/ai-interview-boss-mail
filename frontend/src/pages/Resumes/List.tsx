import React, { useEffect, useRef, useState } from 'react';
import { Button, Card, Col, Input, message, Modal, Progress, Row, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { DeleteOutlined, EyeOutlined, ReloadOutlined, SearchOutlined, SyncOutlined, UploadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import request, { getApiErrorMessage } from '../../utils/request';

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
      if (!silent) message.error('获取简历列表失败');
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
      message.error(getApiErrorMessage(error, '邮箱同步失败，请先检查系统设置里的邮箱导入配置'));
    } finally {
      setMailSyncing(false);
    }
  };

  const handleReparse = (record: any) => {
    Modal.confirm({
      title: '重新分析简历',
      content: '将重新调用模型读取简历并覆盖现有分析结果。',
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
      message.info('当前没有失败的简历');
      return;
    }
    Modal.confirm({
      title: '批量重新分析失败简历',
      content: `将重新提交 ${failedCount} 份失败简历到模型解析队列。`,
      okText: '开始',
      cancelText: '取消',
      onOk: async () => {
        setReparsingFailed(true);
        try {
          const res = await request.post('/resumes/reparse-failed', undefined, {
            params: { limit: failedCount },
          }) as any;
          message.success(`已提交 ${res.queued_count || 0} 份简历重新分析`);
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
      content: '确定要删除这份简历吗？此操作不可恢复。',
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
      message.warning('请先选择要删除的简历');
      return;
    }
    Modal.confirm({
      title: '批量删除简历',
      content: `确定删除选中的 ${selectedRowKeys.length} 份简历吗？`,
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
      message.warning('请先选择要重新分析的简历');
      return;
    }

    const selectedRecords = data.filter(item => selectedRowKeys.includes(item.id));
    const reparsableRecords = selectedRecords.filter(item => item.parse_status !== 'processing');
    const skippedCount = selectedRecords.length - reparsableRecords.length;

    if (!reparsableRecords.length) {
      message.info('选中的简历都在分析中，无需重复提交');
      return;
    }

    Modal.confirm({
      title: '批量重新生成分析',
      content: `将重新提交 ${reparsableRecords.length} 份简历到模型分析队列${skippedCount ? `，跳过 ${skippedCount} 份正在分析的简历` : ''}。`,
      okText: '重新生成',
      cancelText: '取消',
      onOk: async () => {
        setBatchReparsing(true);
        try {
          await Promise.all(reparsableRecords.map(record => request.post(`/resumes/${record.id}/reparse`)));
          setSelectedRowKeys([]);
          message.success(`已提交 ${reparsableRecords.length} 份简历重新生成`);
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

  const columns = [
    {
      title: '候选人',
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
    <div>
      <div className="page-header">
        <div>
          <Title level={2}>简历智能库</Title>
          <Text type="secondary">集中管理收集到的简历，查看模型抽取的经历、项目、追问和落地建议。</Text>
        </div>
        <Space>
          <Button icon={<SyncOutlined />} loading={mailSyncing} onClick={handleSyncResumeMail}>
            同步邮箱简历
          </Button>
          <Button icon={<ReloadOutlined />} loading={reparsingFailed} onClick={handleReparseFailed}>
            重试失败
          </Button>
          <Button type="primary" icon={<UploadOutlined />} onClick={() => navigate('/resumes/upload')}>
            上传简历
          </Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Text type="secondary">简历总数</Text>
            <Title level={2}>{data.length}</Title>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Text type="secondary">已分析</Text>
            <Title level={2}>{analyzedCount}</Title>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Text type="secondary">项目经历</Text>
            <Title level={2}>{projectCount}</Title>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Text type="secondary">待处理失败</Text>
            <Title level={2}>{failedCount}</Title>
          </Card>
        </Col>
      </Row>

      <Card>
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <Input
              placeholder="搜索候选人"
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
