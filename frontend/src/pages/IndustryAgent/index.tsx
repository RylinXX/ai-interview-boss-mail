import React, { useEffect, useMemo, useState } from 'react';
import { App, Card, Col, Empty, Input, Row, Segmented, Space, Spin, Statistic, Table, Tag, Typography } from 'antd';
import { ApartmentOutlined, BulbOutlined, ProjectOutlined, SearchOutlined, TeamOutlined } from '@ant-design/icons';
import request from '../../utils/request';

const { Title, Text, Paragraph } = Typography;

type IndustryAgentData = {
  resume_count: number;
  industry_count: number;
  industries: any[];
};

const matchesKeyword = (industry: any, keyword: string) => {
  if (!keyword) return true;
  const values = [
    industry.name,
    industry.offer_template,
    ...(industry.solution_focus || []),
    ...(industry.reusable_patterns || []),
    ...(industry.project_cases || []).flatMap((item: any) => [
      item.project_name,
      item.candidate_name,
      item.problem,
      item.solution,
      item.business_model,
      ...(item.landing_ideas || []),
    ]),
    ...(industry.work_cases || []).flatMap((item: any) => [
      item.company,
      item.role,
      item.candidate_name,
      item.summary,
      ...(item.capabilities || []),
    ]),
  ];
  return values.some(value => String(value || '').toLowerCase().includes(keyword));
};

const IndustryAgent: React.FC = () => {
  const { message } = App.useApp();
  const [data, setData] = useState<IndustryAgentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [scope, setScope] = useState('all');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await request.get('/resumes/industry-agent');
        setData(response as IndustryAgentData);
      } catch (error) {
        message.error('获取行业方案智能体失败');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [message]);

  const industries = data?.industries || [];
  const scopeOptions = [
    { label: `全部 ${industries.length}`, value: 'all' },
    ...industries.map(industry => ({
      label: industry.name,
      value: industry.key,
    })),
  ];
  const filteredIndustries = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    return industries.filter(industry => (scope === 'all' || industry.key === scope) && matchesKeyword(industry, normalized));
  }, [industries, keyword, scope]);

  const projectColumns = [
    {
      title: '复用项目',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 220,
      render: (value: string, record: any) => (
        <div className="work-title-cell">
          <Text strong>{value || '未命名项目'}</Text>
          <Text type="secondary">{record.candidate_name || '未识别候选人'} · {record.role || '角色未明'}</Text>
        </div>
      ),
    },
    {
      title: '客户问题',
      dataIndex: 'problem',
      key: 'problem',
      render: (value: string) => <Paragraph ellipsis={{ rows: 3 }} style={{ margin: 0 }}>{value || '待补充'}</Paragraph>,
    },
    {
      title: '可复用方案',
      key: 'solution',
      render: (_: any, record: any) => (
        <Paragraph ellipsis={{ rows: 3 }} style={{ margin: 0 }}>
          {record.solution || record.business_model || '待沉淀'}
        </Paragraph>
      ),
    },
  ];

  const workColumns = [
    {
      title: '候选人/公司',
      key: 'candidate_company',
      width: 220,
      render: (_: any, record: any) => (
        <div className="work-title-cell">
          <Text strong>{record.candidate_name || '未识别候选人'}</Text>
          <Text type="secondary">{record.company || '未命名公司'} · {record.role || '角色未明'}</Text>
        </div>
      ),
    },
    {
      title: '经验支撑',
      dataIndex: 'summary',
      key: 'summary',
      render: (value: string) => <Paragraph ellipsis={{ rows: 3 }} style={{ margin: 0 }}>{value || '暂无概要'}</Paragraph>,
    },
    {
      title: '能力',
      dataIndex: 'capabilities',
      key: 'capabilities',
      width: 220,
      render: (value: string[]) => Array.isArray(value) && value.length ? (
        <div className="project-tag-row">
          {value.slice(0, 4).map(item => <Tag key={item}>{item}</Tag>)}
        </div>
      ) : '-',
    },
  ];

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '70vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="industry-agent-page">
      <div className="page-header">
        <div>
          <Title level={2}>行业方案智能体</Title>
          <Text type="secondary">基于项目经验库、候选人库和工作经验库，自动归类行业并沉淀可复用方案。</Text>
        </div>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card>
            <Statistic title="分析简历" value={data?.resume_count || 0} prefix={<TeamOutlined />} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="行业分类" value={data?.industry_count || 0} prefix={<ApartmentOutlined />} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="可复用案例"
              value={industries.reduce((sum, item) => sum + item.project_count + item.work_count, 0)}
              prefix={<ProjectOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <div className="industry-agent-toolbar">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索行业、公司、项目、方案关键词"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <Segmented value={scope} onChange={(value) => setScope(String(value))} options={scopeOptions} />
        </div>
      </Card>

      {filteredIndustries.length ? filteredIndustries.map(industry => (
        <Card
          key={industry.key}
          className="industry-agent-card"
          title={
            <Space>
              <ApartmentOutlined />
              <span>{industry.name}</span>
              <Tag color="blue">{industry.project_count} 项目</Tag>
              <Tag>{industry.candidate_count} 人</Tag>
            </Space>
          }
          style={{ marginBottom: 16 }}
        >
          <Row gutter={[16, 16]}>
            <Col span={8}>
              <Card size="small" title="方案方向">
                <Paragraph>{industry.offer_template}</Paragraph>
                <div className="project-tag-row">
                  {(industry.solution_focus || []).map((item: string) => <Tag color="processing" key={item}>{item}</Tag>)}
                </div>
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small" title="复用模式">
                <Space orientation="vertical" size={8}>
                  {(industry.reusable_patterns || []).map((item: string) => (
                    <Text key={item}><BulbOutlined /> {item}</Text>
                  ))}
                </Space>
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small" title="候选人能力池">
                <div className="project-tag-row">
                  {(industry.candidate_pool || []).slice(0, 10).map((item: any) => (
                    <Tag color="success" key={item.resume_id}>{item.candidate_name || '未识别'} · {item.case_count}</Tag>
                  ))}
                </div>
              </Card>
            </Col>
            <Col span={24}>
              <Table
                size="small"
                rowKey={(record) => `${record.resume_id}-${record.project_name}`}
                dataSource={industry.project_cases || []}
                columns={projectColumns}
                pagination={false}
              />
            </Col>
            <Col span={24}>
              <Table
                size="small"
                rowKey={(record) => `${record.resume_id}-${record.company}-${record.role}`}
                dataSource={industry.work_cases || []}
                columns={workColumns}
                pagination={false}
              />
            </Col>
          </Row>
        </Card>
      )) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无匹配行业方案" />
      )}
    </div>
  );
};

export default IndustryAgent;
