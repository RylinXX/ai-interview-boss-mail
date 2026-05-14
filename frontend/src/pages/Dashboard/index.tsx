import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Col, Empty, Input, Row, Segmented, Select, Space, Spin, Table, Tag, Typography } from 'antd';
import { ApartmentOutlined, BulbOutlined, FileTextOutlined, ProjectOutlined, QuestionCircleOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import request from '../../utils/request';
import '../BusinessWorkbench.css';

const { Title, Text, Paragraph } = Typography;

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
  const [resumes, setResumes] = useState<any[]>([]);
  const [summary, setSummary] = useState<ExperienceSummary | null>(null);
  const [projectLibrary, setProjectLibrary] = useState<ProjectLibrary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [projectKeyword, setProjectKeyword] = useState('');
  const [projectScope, setProjectScope] = useState<'all' | 'gaps'>('all');
  const [industryScope, setIndustryScope] = useState('all');
  const [candidateKeyword, setCandidateKeyword] = useState('');
  const [workKeyword, setWorkKeyword] = useState('');

  const fetchData = useCallback(async (initialLoad = false) => {
    if (initialLoad) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const [resumeRes, summaryRes, projectRes] = await Promise.all([
        request.get('/resumes'),
        request.get('/resumes/experience-summary'),
        request.get('/resumes/project-library'),
      ]);
      setResumes(resumeRes as any[]);
      setSummary(summaryRes as ExperienceSummary);
      setProjectLibrary(projectRes as ProjectLibrary);
    } catch (error) {
      message.error('获取方案工作台失败');
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
  const industrySummary = summary?.industry_summary || projectLibrary?.industry_summary || [];
  const activeIndustry = industrySummary.find(item => item.industry_key === industryScope);
  const normalizedKeyword = projectKeyword.trim().toLowerCase();
  const normalizedCandidateKeyword = candidateKeyword.trim().toLowerCase();
  const normalizedWorkKeyword = workKeyword.trim().toLowerCase();
  const missingBusinessCount = projects.filter(projectHasBusinessGap).length;
  const industryOptions = [
    { label: `全部行业（${industrySummary.length || '不限'}）`, value: 'all' },
    ...industrySummary.map(item => ({
      label: `${item.industry_label}（${item.resume_count} 人 / ${item.project_count} 项目）`,
      value: item.industry_key,
    })),
  ];
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
      .map((item, index) => ({ ...item, _rowKey: `${item.resume_id || 'candidate'}-${index}` })),
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
  const completionRate = resumes.length ? Math.round((analyzed / resumes.length) * 100) : 0;

  const renderProjectDetail = (record: any) => (
    <div className="project-expanded-detail">
      <div>
        <Text type="secondary">业务问题</Text>
        <Paragraph>{record.problem || '未说明问题'}</Paragraph>
      </div>
      <div>
        <Text type="secondary">解决方案</Text>
        <Paragraph>{record.solution || '未说明方案'}</Paragraph>
      </div>
      <div>
        <Text type="secondary">商业模式</Text>
        <Paragraph>{record.business_model || '待追问'}</Paragraph>
      </div>
      <div>
        <Text type="secondary">落地/创业方向</Text>
        {Array.isArray(record.landing_ideas) && record.landing_ideas.length ? (
          <Space orientation="vertical" size={6}>
            {record.landing_ideas.map((idea: string, index: number) => (
              <Paragraph key={`${idea}-${index}`} style={{ margin: 0 }}>{idea}</Paragraph>
            ))}
          </Space>
        ) : (
          <Paragraph>待沉淀</Paragraph>
        )}
      </div>
      <div>
        <Text type="secondary">缺失证据</Text>
        {Array.isArray(record.missing_evidence) && record.missing_evidence.length ? (
          <div className="project-tag-row">
            {record.missing_evidence.map((item: string) => <Tag color="warning" key={item}>{item}</Tag>)}
          </div>
        ) : (
          <Paragraph>暂无明显缺失</Paragraph>
        )}
      </div>
      <div>
        <Text type="secondary">能力样本逻辑</Text>
        <Paragraph>{record.logic_analysis || '暂无逻辑分析'}</Paragraph>
      </div>
    </div>
  );

  const projectColumns = [
    {
      title: '项目',
      dataIndex: 'name',
      key: 'name',
      width: '24%',
      render: (text: string, record: any) => (
        <div className="project-title-cell">
          <Text strong>{text || '未命名项目'}</Text>
          <div>
            <Tag color={record.industry_color || 'default'}>{record.industry_label || '通用业务'}</Tag>
            <Tag>{record.candidate_name || '未识别样本'}</Tag>
            {record.role && <Tag>{record.role}</Tag>}
          </div>
        </div>
      ),
    },
    {
      title: '商业模式',
      dataIndex: 'business_model',
      key: 'business_model',
      width: '28%',
      render: (value: string) => (
        <Paragraph ellipsis={{ rows: 3 }} style={{ margin: 0 }}>
          {value || '待追问'}
        </Paragraph>
      ),
    },
    {
      title: '缺失证据',
      dataIndex: 'missing_evidence',
      key: 'missing_evidence',
      width: '22%',
      render: (value: string[]) => Array.isArray(value) && value.length ? (
        <div className="project-tag-row">
          {value.slice(0, 3).map(item => <Tag color="warning" key={item}>{item}</Tag>)}
          {value.length > 3 && <Tag>+{value.length - 3}</Tag>}
        </div>
      ) : '-',
    },
    {
      title: '落地方向',
      dataIndex: 'landing_ideas',
      key: 'landing_ideas',
      width: '22%',
      render: (value: string[]) => Array.isArray(value) && value.length ? (
        <Paragraph ellipsis={{ rows: 3 }} style={{ margin: 0 }}>{value[0]}</Paragraph>
      ) : '待沉淀',
    },
  ];

  const candidateColumns = [
    {
      title: '样本',
      dataIndex: 'candidate_name',
      key: 'candidate_name',
      width: 220,
      render: (value: string, record: any) => (
        <Space orientation="vertical" size={6}>
          <Text strong>{value || '未识别样本'}</Text>
          <Tag color={record.industry_color || 'default'}>{record.industry_label || '通用业务'}</Tag>
        </Space>
      ),
    },
    {
      title: '底层逻辑分析',
      dataIndex: 'analysis',
      key: 'analysis',
      render: (value: string) => (
        <Paragraph ellipsis={{ rows: 4, expandable: true, symbol: '展开' }} style={{ margin: 0 }}>
          {value || '暂无逻辑分析'}
        </Paragraph>
      ),
    },
  ];

  const workColumns = [
    {
      title: '样本',
      dataIndex: 'candidate_name',
      key: 'candidate_name',
      width: 160,
      render: (value: string) => <Text strong>{value || '未识别样本'}</Text>,
    },
    {
      title: '公司/角色',
      key: 'company_role',
      width: 300,
      render: (_: any, record: any) => (
        <div className="work-title-cell">
          <Text strong>{record.company || '未命名公司'}</Text>
          <Text type="secondary">{record.role || '角色未明'}</Text>
          <Tag color={record.industry_color || 'default'}>{record.industry_label || '通用业务'}</Tag>
        </div>
      ),
    },
    {
      title: '经历概要',
      dataIndex: 'summary',
      key: 'summary',
      render: (value: string) => (
        <Paragraph ellipsis={{ rows: 4, expandable: true, symbol: '展开' }} style={{ margin: 0 }}>
          {value || '暂无概要'}
        </Paragraph>
      ),
    },
    {
      title: '能力标签',
      dataIndex: 'capabilities',
      key: 'capabilities',
      width: 260,
      render: (value: string[]) => Array.isArray(value) && value.length ? (
        <div className="project-tag-row">
          {value.slice(0, 4).map(item => <Tag key={item}>{item}</Tag>)}
          {value.length > 4 && <Tag>+{value.length - 4}</Tag>}
        </div>
      ) : '-',
    },
  ];

  return (
    <div className="workbench-page dashboard-page">
      <section className="consulting-hero">
        <div className="consulting-hero-copy">
          <span className="dossier-code">Command Center</span>
          <Title level={1}>方案工作台</Title>
          <Text>从高级人才样本中汇总项目经历、公司经历和能力逻辑，用行业标签支撑客户方案判断。</Text>
        </div>
        <Space className="consulting-hero-actions">
          <Button icon={<ReloadOutlined />} loading={refreshing} onClick={() => fetchData(false)}>刷新</Button>
        </Space>
      </section>

      <div className="consulting-metric-grid">
        <Card className="consulting-metric-card">
          <span className="metric-icon"><FileTextOutlined /></span>
          <Text type="secondary">能力样本</Text>
          <strong>{resumes.length}</strong>
          <span>已入库高级人才样本</span>
        </Card>
        <Card className="consulting-metric-card">
          <span className="metric-icon"><ProjectOutlined /></span>
          <Text type="secondary">项目经历</Text>
          <strong>{projectLibrary?.project_count || 0}</strong>
          <span>可复用业务素材</span>
        </Card>
        <Card className="consulting-metric-card">
          <span className="metric-icon"><QuestionCircleOutlined /></span>
          <Text type="secondary">商业缺口</Text>
          <strong>{missingBusinessCount}</strong>
          <span>待补齐方案证据</span>
        </Card>
        <Card className="consulting-metric-card">
          <span className="metric-icon"><BulbOutlined /></span>
          <Text type="secondary">分析完成率</Text>
          <strong>{completionRate}%</strong>
          <span>成功 {analyzed} / 处理中 {processing} / 失败 {failed}</span>
        </Card>
      </div>

      <Card
        className="industry-overview-card consulting-table-card"
        title="行业标签总览"
        extra={
          <Select
            value={industryScope}
            onChange={setIndustryScope}
            options={industryOptions}
            popupMatchSelectWidth={false}
            className="industry-filter-select"
          />
        }
      >
        {industrySummary.length ? (
          <div className="industry-overview-grid">
            {industrySummary.map(item => {
              const active = industryScope === item.industry_key;
              return (
                <button
                  key={item.industry_key}
                  type="button"
                  className={`industry-overview-item${active ? ' active' : ''}`}
                  onClick={() => setIndustryScope(active ? 'all' : item.industry_key)}
                >
                  <span>
                    <ApartmentOutlined />
                    <Tag color={item.industry_color || 'default'}>{item.industry_label}</Tag>
                  </span>
                  <strong>{item.resume_count} 人</strong>
                  <em>{item.project_count} 项目 · {item.company_count || 0} 公司</em>
                </button>
              );
            })}
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无行业标签" />
        )}
        {activeIndustry && (
          <Text type="secondary" className="industry-active-hint">
            当前查看：{activeIndustry.industry_label}，下方项目库、能力样本库和工作经验库已同步筛选。
          </Text>
        )}
      </Card>

      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card
            className="project-library-card consulting-table-card"
            title="项目经验库"
            extra={<Text type="secondary">显示 {filteredProjects.length} / {projects.length}</Text>}
          >
            <div className="project-library-toolbar">
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="搜索项目、样本、商业模式"
                value={projectKeyword}
                onChange={(event) => setProjectKeyword(event.target.value)}
              />
              <Select
                value={industryScope}
                onChange={setIndustryScope}
                options={industryOptions}
                popupMatchSelectWidth={false}
                className="industry-filter-select"
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
                expandable={{
                  expandedRowRender: renderProjectDetail,
                  rowExpandable: () => true,
                }}
                pagination={{ pageSize: 6, showSizeChanger: false }}
                tableLayout="fixed"
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={projects.length ? '没有匹配的项目' : '暂无项目经历'} />
            )}
          </Card>
        </Col>
        <Col span={24}>
          <Card
            className="consulting-table-card"
            title="能力样本库"
            extra={<Text type="secondary">显示 {candidateRows.length} / {summary?.logic_analyses.length || 0}</Text>}
          >
            <div className="dashboard-library-toolbar">
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="搜索样本或底层逻辑"
                value={candidateKeyword}
                onChange={(event) => setCandidateKeyword(event.target.value)}
              />
              <Text type="secondary"><BulbOutlined /> 按行业标签和能力逻辑查找可复用经验</Text>
            </div>
            {candidateRows.length ? (
              <Table
                rowKey={(record) => record._rowKey}
                dataSource={candidateRows}
                columns={candidateColumns}
                pagination={{ pageSize: 6, showSizeChanger: false }}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无能力样本逻辑" />
            )}
          </Card>
        </Col>
      </Row>

      <Card
        className="consulting-table-card"
        title="工作经验库"
        style={{ marginTop: 16 }}
        extra={<Text type="secondary">显示 {workRows.length} / {summary?.work_experiences.length || 0}</Text>}
      >
        <div className="dashboard-library-toolbar">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索样本、公司、角色、行业或经历"
            value={workKeyword}
            onChange={(event) => setWorkKeyword(event.target.value)}
          />
          <Text type="secondary">沉淀可复用能力、公司经验和角色上下文</Text>
        </div>
        {workRows.length ? (
          <Table
            rowKey={(record) => record._rowKey}
            dataSource={workRows}
            columns={workColumns}
            pagination={{ pageSize: 8, showSizeChanger: false }}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无工作经历" />
        )}
      </Card>
    </div>
  );
};

export default Dashboard;
