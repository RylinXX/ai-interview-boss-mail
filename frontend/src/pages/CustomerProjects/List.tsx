import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Form, Input, Modal, Space, Table, Tag, Typography } from 'antd';
import { ApartmentOutlined, FileDoneOutlined, FileTextOutlined, PlusOutlined, ProjectOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import request, { getApiErrorMessage } from '../../utils/request';
import '../BusinessWorkbench.css';

const { Title, Text } = Typography;

type CustomerProject = {
  id: string;
  name: string;
  industry?: string;
  company_scale?: string;
  business_model?: string;
  pain_points: string[];
  goals: string[];
  status: string;
  created_at: string;
  solution_document?: {
    title: string;
  };
};

const splitLines = (value?: string) => (
  String(value || '')
    .split(/\n|,|，|;|；/)
    .map(item => item.trim())
    .filter(Boolean)
);

const statusLabel: Record<string, string> = {
  draft: '草稿',
  diagnosing: '诊断中',
  designing: '方案设计',
  ready: '可交付',
  archived: '已归档',
};

const CustomerProjectsList: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [projects, setProjects] = useState<CustomerProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request.get('/customer-projects');
      setProjects(res as CustomerProject[]);
    } catch (error) {
      message.error(getApiErrorMessage(error, '获取客户项目失败'));
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const createProject = async () => {
    const values = await form.validateFields();
    setCreating(true);
    try {
      const created = await request.post('/customer-projects', {
        name: values.name,
        industry: values.industry,
        company_scale: values.company_scale,
        business_model: values.business_model,
        pain_points: splitLines(values.pain_points),
        goals: splitLines(values.goals),
      }) as CustomerProject;
      message.success('客户项目已创建');
      setModalOpen(false);
      form.resetFields();
      navigate(`/customer-projects/${created.id}`);
    } catch (error) {
      message.error(getApiErrorMessage(error, '创建客户项目失败'));
    } finally {
      setCreating(false);
    }
  };

  const summary = useMemo(() => {
    const active = projects.filter(item => item.status !== 'archived').length;
    return `${projects.length} 个项目，${active} 个进行中`;
  }, [projects]);

  const portfolioMetrics = useMemo(() => {
    const active = projects.filter(item => item.status !== 'archived').length;
    const ready = projects.filter(item => item.status === 'ready').length;
    const industries = new Set(projects.map(item => item.industry).filter(Boolean)).size;
    const documented = projects.filter(item => item.solution_document?.title).length;
    return { active, ready, industries, documented };
  }, [projects]);

  const metrics = [
    { label: '进行中交付', value: portfolioMetrics.active, hint: '待推进客户项目', icon: <ProjectOutlined /> },
    { label: '可交付方案', value: portfolioMetrics.ready, hint: '已进入交付状态', icon: <FileDoneOutlined /> },
    { label: '覆盖行业', value: portfolioMetrics.industries, hint: '来自项目样本', icon: <ApartmentOutlined /> },
    { label: '方案文档', value: portfolioMetrics.documented, hint: '已生成案卷文档', icon: <FileTextOutlined /> },
  ];

  const formatDossierCode = (createdAt?: string) => {
    const date = createdAt ? new Date(createdAt) : null;
    if (!date || Number.isNaN(date.getTime())) return 'DOSSIER';
    return `DOS-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  };

  return (
    <div className="customer-projects-page workbench-page">
      <section className="consulting-hero">
        <div className="consulting-hero-copy">
          <span className="dossier-code">Engagement Portfolio</span>
          <Title level={1}>客户项目案卷</Title>
          <Text>
            每个项目都是一次业务优化交付：客户背景、诊断、方案、执行任务和 AI 员工产出统一沉淀。
          </Text>
        </div>
        <Space className="consulting-hero-actions">
          <Button icon={<ReloadOutlined />} onClick={fetchProjects} loading={loading}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>启动新交付</Button>
        </Space>
      </section>

      <div className="workbench-summary-strip">
        <ProjectOutlined />
        <span>{summary}</span>
      </div>

      <div className="consulting-metric-grid">
        {metrics.map(metric => (
          <Card className="consulting-metric-card" key={metric.label}>
            <span className="metric-icon">{metric.icon}</span>
            <Text type="secondary">{metric.label}</Text>
            <strong>{metric.value}</strong>
            <span>{metric.hint}</span>
          </Card>
        ))}
      </div>

      <Card className="consulting-table-card" title="交付案卷列表">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={projects}
          pagination={{ pageSize: 10 }}
          onRow={(record) => ({
            onClick: () => navigate(`/customer-projects/${record.id}`),
          })}
          columns={[
            {
              title: '项目案卷',
              dataIndex: 'name',
              width: 280,
              render: (value: string, record) => (
                <Space orientation="vertical" size={4}>
                  <span className="dossier-code">{formatDossierCode(record.created_at)}</span>
                  <Text strong>{value}</Text>
                  <Text type="secondary">{record.solution_document?.title || '待生成方案文档'}</Text>
                </Space>
              ),
            },
            {
              title: '客户背景',
              key: 'background',
              width: 220,
              render: (_: unknown, record) => (
                <Space orientation="vertical" size={4}>
                  <Text>{record.industry || '行业待补充'}</Text>
                  <Text type="secondary">{record.company_scale || '规模待补充'}</Text>
                </Space>
              ),
            },
            {
              title: '核心问题',
              dataIndex: 'pain_points',
              render: (values: string[]) => (
                <Space wrap>
                  {(values || []).slice(0, 3).map(item => <Tag key={item}>{item}</Tag>)}
                </Space>
              ),
            },
            {
              title: '交付目标',
              dataIndex: 'goals',
              render: (values: string[]) => (
                <Space wrap>
                  {(values || []).slice(0, 3).map(item => <Tag color="gold" key={item}>{item}</Tag>)}
                </Space>
              ),
            },
            {
              title: '交付状态',
              dataIndex: 'status',
              width: 120,
              render: (value: string) => <Tag color="processing">{statusLabel[value] || value}</Tag>,
            },
          ]}
        />
      </Card>

      <Modal
        title="启动新交付"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={createProject}
        okText="创建案卷并进入"
        confirmLoading={creating}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item label="项目名称" name="name" rules={[{ required: true, message: '请输入项目名称' }]}>
            <Input placeholder="例如：某制造企业售后提效项目" />
          </Form.Item>
          <Form.Item label="行业" name="industry">
            <Input placeholder="例如：制造业、电商、本地生活" />
          </Form.Item>
          <Form.Item label="企业规模" name="company_scale">
            <Input placeholder="例如：200-500人" />
          </Form.Item>
          <Form.Item label="业务模式" name="business_model">
            <Input.TextArea rows={3} placeholder="描述客户如何获客、交付和收费" />
          </Form.Item>
          <Form.Item label="主要痛点" name="pain_points">
            <Input.TextArea rows={3} placeholder="每行一个痛点" />
          </Form.Item>
          <Form.Item label="业务目标" name="goals">
            <Input.TextArea rows={3} placeholder="每行一个目标" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CustomerProjectsList;
