import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Col, Empty, Input, Progress, Row, Segmented, Space, Spin, Table, Tag, Tooltip, Typography } from 'antd';
import { BulbOutlined, FileTextOutlined, ProjectOutlined, QuestionCircleOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import request from '../../utils/request';

const { Title, Text, Paragraph } = Typography;

type ExperienceSummary = {
  resume_count: number;
  work_experiences: any[];
  project_experiences: any[];
  logic_analyses: any[];
};

type ProjectLibrary = {
  resume_count: number;
  project_count: number;
  projects: any[];
};

type QueueStats = {
  queue_size: number;
  running_tasks: number;
  completed_tasks: number;
  max_concurrent: number;
  total_submitted: number;
  total_completed: number;
  total_failed: number;
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

const Dashboard: React.FC = () => {
  const { message } = App.useApp();
  const [resumes, setResumes] = useState<any[]>([]);
  const [summary, setSummary] = useState<ExperienceSummary | null>(null);
  const [projectLibrary, setProjectLibrary] = useState<ProjectLibrary | null>(null);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [projectKeyword, setProjectKeyword] = useState('');
  const [projectScope, setProjectScope] = useState<'all' | 'gaps'>('all');

  const fetchData = useCallback(async (initialLoad = false) => {
    if (initialLoad) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const [resumeRes, summaryRes, projectRes, queueRes] = await Promise.all([
        request.get('/resumes'),
        request.get('/resumes/experience-summary'),
        request.get('/resumes/project-library'),
        request.get('/resumes/queue-stats'),
      ]);
      setResumes(resumeRes as any[]);
      setSummary(summaryRes as ExperienceSummary);
      setProjectLibrary(projectRes as ProjectLibrary);
      setQueueStats(queueRes as QueueStats);
    } catch (error) {
      message.error('获取分析仪表盘失败');
    } finally {
      if (initialLoad) {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  }, [message]);

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  const projects = projectLibrary?.projects || [];
  const normalizedKeyword = projectKeyword.trim().toLowerCase();
  const missingBusinessCount = projects.filter(projectHasBusinessGap).length;
  const filteredProjects = useMemo(
    () => projects
      .filter(project => (projectScope === 'gaps' ? projectHasBusinessGap(project) : true))
      .filter(project => projectMatchesKeyword(project, normalizedKeyword))
      .map((project, index) => ({
        ...project,
        _rowKey: `${project.resume_id || 'resume'}-${project.name || 'project'}-${project.role || 'role'}-${index}`,
      })),
    [normalizedKeyword, projectScope, projects],
  );

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '70vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  const analyzed = resumes.filter(item => item.parse_status === 'success').length;
  const processing = resumes.filter(item => item.parse_status === 'processing').length;
  const failed = resumes.filter(item => item.parse_status === 'failed').length;
  const questions = resumes.reduce((sum, item) => {
    const parsed = item.parsed_data || {};
    return sum
      + (Array.isArray(parsed.interview_questions) ? parsed.interview_questions.length : 0)
      + (Array.isArray(parsed.business_model_questions) ? parsed.business_model_questions.length : 0)
      + (Array.isArray(parsed.experience_completion_questions) ? parsed.experience_completion_questions.length : 0);
  }, 0);
  const completionRate = resumes.length ? Math.round((analyzed / resumes.length) * 100) : 0;
  const queueLoad = queueStats?.max_concurrent
    ? Math.round(((queueStats.running_tasks || 0) / queueStats.max_concurrent) * 100)
    : 0;

  const projectColumns = [
    {
      title: '项目',
      dataIndex: 'name',
      key: 'name',
      width: 240,
      render: (text: string, record: any) => (
        <div>
          <Text strong>{text || '未命名项目'}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>{record.candidate_name}</Text>
        </div>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 150,
      render: (value: string) => value || '-',
    },
    {
      title: '问题/方案',
      key: 'problem',
      ellipsis: true,
      render: (_: any, record: any) => (
        <Tooltip title={`${record.problem || '未说明问题'} / ${record.solution || '未说明方案'}`}>
          <span>{record.problem || record.solution || '待补充项目上下文'}</span>
        </Tooltip>
      ),
    },
    {
      title: '商业模式',
      dataIndex: 'business_model',
      key: 'business_model',
      ellipsis: true,
      render: (value: string) => value || '待追问',
    },
    {
      title: '缺失证据',
      dataIndex: 'missing_evidence',
      key: 'missing_evidence',
      width: 220,
      render: (value: string[]) => Array.isArray(value) && value.length ? (
        <Space wrap>
          {value.slice(0, 3).map(item => <Tag color="warning" key={item}>{item}</Tag>)}
        </Space>
      ) : '-',
    },
    {
      title: '落地方向',
      dataIndex: 'landing_ideas',
      key: 'landing_ideas',
      width: 260,
      render: (value: string[]) => Array.isArray(value) && value.length ? (
        <Paragraph ellipsis={{ rows: 2 }} style={{ margin: 0 }}>{value[0]}</Paragraph>
      ) : '待沉淀',
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <Title level={2}>分析仪表盘</Title>
          <Text type="secondary">从所有简历中汇总项目经历、商业模式缺口、处理队列和候选人的底层逻辑信号。</Text>
        </div>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Space align="start">
              <FileTextOutlined style={{ fontSize: 22, color: '#2563EB' }} />
              <div>
                <Text type="secondary">简历总数</Text>
                <Title level={2}>{resumes.length}</Title>
              </div>
            </Space>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Space align="start">
              <ProjectOutlined style={{ fontSize: 22, color: '#059669' }} />
              <div>
                <Text type="secondary">项目经历</Text>
                <Title level={2}>{projectLibrary?.project_count || 0}</Title>
              </div>
            </Space>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Space align="start">
              <QuestionCircleOutlined style={{ fontSize: 22, color: '#D97706' }} />
              <div>
                <Text type="secondary">商业缺口</Text>
                <Title level={2}>{missingBusinessCount}</Title>
              </div>
            </Space>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Space align="center">
              <Progress type="circle" percent={completionRate} size={62} />
              <div>
                <Text type="secondary">分析完成率</Text>
                <div><Text>成功 {analyzed} / 处理中 {processing} / 失败 {failed}</Text></div>
                <Text type="secondary">已生成问题 {questions} 个</Text>
              </div>
            </Space>
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={18}>
          <Card
            title="项目经验库"
            extra={<Text type="secondary">显示 {filteredProjects.length} / {projects.length}</Text>}
          >
            <div className="project-library-toolbar">
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="搜索项目、候选人、商业模式"
                value={projectKeyword}
                onChange={(event) => setProjectKeyword(event.target.value)}
              />
              <Segmented
                value={projectScope}
                onChange={(value) => setProjectScope(value as 'all' | 'gaps')}
                options={[
                  { label: `全部 ${projects.length}`, value: 'all' },
                  { label: `缺口 ${missingBusinessCount}`, value: 'gaps' },
                ]}
              />
              <Button icon={<ReloadOutlined />} loading={refreshing} onClick={() => fetchData(false)}>
                刷新
              </Button>
            </div>
            {filteredProjects.length ? (
              <Table
                rowKey={(record) => record._rowKey}
                dataSource={filteredProjects}
                columns={projectColumns}
                pagination={{ pageSize: 8, showSizeChanger: false }}
                scroll={{ x: 1200 }}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={projects.length ? '没有匹配的项目' : '暂无项目经历'} />
            )}
          </Card>
        </Col>
        <Col span={6}>
          <Card title="模型处理队列" style={{ marginBottom: 16 }}>
            <Space orientation="vertical" size={12} style={{ width: '100%' }}>
              <Progress percent={queueLoad} size="small" status={queueLoad >= 100 ? 'active' : 'normal'} />
              <Row gutter={[8, 8]}>
                <Col span={12}>
                  <Text type="secondary">等待中</Text>
                  <Title level={4}>{queueStats?.queue_size ?? 0}</Title>
                </Col>
                <Col span={12}>
                  <Text type="secondary">处理中</Text>
                  <Title level={4}>{queueStats?.running_tasks ?? 0}</Title>
                </Col>
                <Col span={12}>
                  <Text type="secondary">已完成</Text>
                  <Title level={4}>{queueStats?.total_completed ?? 0}</Title>
                </Col>
                <Col span={12}>
                  <Text type="secondary">失败</Text>
                  <Title level={4}>{queueStats?.total_failed ?? 0}</Title>
                </Col>
              </Row>
              <Text type="secondary">最大并发：{queueStats?.max_concurrent ?? 0}，累计提交：{queueStats?.total_submitted ?? 0}</Text>
            </Space>
          </Card>
          <Card title="候选人逻辑分析" extra={<BulbOutlined />}>
            {summary?.logic_analyses.length ? (
              <div className="analysis-list">
                {summary.logic_analyses.slice(0, 6).map((item, index) => (
                  <div className="analysis-list-item" key={`${item.candidate_name || 'unknown'}-${index}`}>
                    <Text strong>{item.candidate_name || '未识别候选人'}</Text>
                    <Paragraph ellipsis={{ rows: 3 }} style={{ margin: '6px 0 0' }}>{item.analysis}</Paragraph>
                  </div>
                ))}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无逻辑分析" />
            )}
          </Card>
        </Col>
      </Row>

      <Card title="工作经验库" style={{ marginTop: 16 }} extra={<Text type="secondary">沉淀可复用能力、公司经验和角色上下文</Text>}>
        {summary?.work_experiences.length ? (
          <Row gutter={[16, 16]}>
            {summary.work_experiences.slice(0, 12).map((item, index) => (
              <Col span={8} key={`${item.company || 'company'}-${item.candidate_name || 'candidate'}-${index}`}>
                <Card size="small" title={item.company || '未命名公司'}>
                  <Space orientation="vertical" size={6}>
                    <Text type="secondary">{item.candidate_name} · {item.role || '角色未明'}</Text>
                    <Paragraph ellipsis={{ rows: 3 }}>{item.summary || '暂无概要'}</Paragraph>
                  </Space>
                </Card>
              </Col>
            ))}
          </Row>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无工作经历" />
        )}
      </Card>
    </div>
  );
};

export default Dashboard;
