import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Form, Input, Modal, Space, Table, Tag, Typography } from 'antd';
import { PlusOutlined, ProjectOutlined, ReloadOutlined } from '@ant-design/icons';
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

  return (
    <div className="customer-projects-page workbench-page">
      <div className="page-header">
        <div>
          <Title level={2}>客户项目</Title>
          <Text type="secondary">围绕客户现状、业务目标、能力样本和 AI 员工任务生成内部方案文档。</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchProjects} loading={loading}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>新建项目</Button>
        </Space>
      </div>

      <div className="workbench-summary-strip">
        <ProjectOutlined />
        <span>{summary}</span>
      </div>

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
            title: '客户项目',
            dataIndex: 'name',
            render: (value: string, record) => (
              <Space orientation="vertical" size={2}>
                <Text strong>{value}</Text>
                <Text type="secondary">{record.solution_document?.title || '待生成方案文档'}</Text>
              </Space>
            ),
          },
          {
            title: '行业',
            dataIndex: 'industry',
            render: (value: string) => value || '待补充',
          },
          {
            title: '规模',
            dataIndex: 'company_scale',
            render: (value: string) => value || '待补充',
          },
          {
            title: '痛点',
            dataIndex: 'pain_points',
            render: (values: string[]) => (
              <Space wrap>
                {(values || []).slice(0, 3).map(item => <Tag key={item}>{item}</Tag>)}
              </Space>
            ),
          },
          {
            title: '目标',
            dataIndex: 'goals',
            render: (values: string[]) => (
              <Space wrap>
                {(values || []).slice(0, 3).map(item => <Tag color="blue" key={item}>{item}</Tag>)}
              </Space>
            ),
          },
          {
            title: '状态',
            dataIndex: 'status',
            render: (value: string) => <Tag color="processing">{statusLabel[value] || value}</Tag>,
          },
        ]}
      />

      <Modal
        title="新建客户项目"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={createProject}
        okText="创建并进入"
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
