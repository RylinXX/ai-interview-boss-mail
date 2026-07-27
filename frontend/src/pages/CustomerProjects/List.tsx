import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Form, Input, Modal, Pagination, Space, Table, Tag, Typography } from 'antd';
import { ApartmentOutlined, EyeOutlined, FileDoneOutlined, FileTextOutlined, PlusOutlined, ProjectOutlined, ReadOutlined, ReloadOutlined, RobotOutlined, SolutionOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import request, { getApiErrorMessage } from '../../utils/request';
import { AsyncState, ModulePageHeader, ResponsiveDataView } from '../../components/Workbench';
import '../BusinessWorkbench.css';

const { Text } = Typography;

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
    .split(/\r\n|\n|\r|,|，|;|；/)
    .map(item => item.trim())
    .filter(Boolean)
);

const statusLabel: Record<string, string> = {
  draft: '草稿评估',
  diagnosing: '诊断中',
  designing: '方案可行性设计',
  ready: '高置信可行方案',
  archived: '已归档卷宗',
};

const CustomerProjectsList: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [projects, setProjects] = useState<CustomerProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [mobilePage, setMobilePage] = useState(1);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await request.get('/customer-projects');
      setProjects(res as CustomerProject[]);
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, '获取客户项目案卷失败');
      setLoadError(errorMessage);
      message.error(errorMessage);
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
      message.success('客户项目案卷已创建');
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
    return `共沉淀 ${projects.length} 份评估卷宗，${active} 份处于可行性分析与落地方向设计状态`;
  }, [projects]);

  const portfolioMetrics = useMemo(() => {
    const active = projects.filter(item => item.status !== 'archived').length;
    const ready = projects.filter(item => item.status === 'ready' || item.status === 'designing').length;
    const industries = new Set(projects.map(item => item.industry).filter(Boolean)).size;
    const documented = projects.filter(item => item.solution_document?.title).length;
    return { active, ready, industries, documented };
  }, [projects]);

  const metrics = [
    { label: '评估中卷宗', value: portfolioMetrics.active, hint: '待落地系统评估案卷', icon: <ProjectOutlined /> },
    { label: '高置信可行方案', value: portfolioMetrics.ready, hint: '打法与人才验证通过', icon: <FileDoneOutlined /> },
    { label: '人才匹配覆盖行业', value: portfolioMetrics.industries || 1, hint: '人才库打法交叉匹配', icon: <ApartmentOutlined /> },
    { label: '结构化方案卷宗', value: portfolioMetrics.documented, hint: '包含推荐功能与专家线索', icon: <FileTextOutlined /> },
  ];

  const formatDossierCode = (createdAt?: string) => {
    const date = createdAt ? new Date(createdAt) : null;
    if (!date || Number.isNaN(date.getTime())) return 'DOSSIER';
    return `DOS-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  };

  return (
    <div className="customer-projects-list-page workbench-page">
      <ModulePageHeader
        eyebrow="AI 解决方案落地卷宗库"
        title="客户项目系统建设评估与专家打法卷宗"
        description="本板块为 AI 解决方案助手的持久化归档中心。帮助评估特定系统建设的可行性、搜寻人才库中曾做过同类系统的专家代表与实际效果，并拆解推荐落地的核心功能模块与技术路线。"
        actions={
          <Space wrap>
            <Button icon={<RobotOutlined />} type="primary" onClick={() => navigate('/ai-solution-assistant')}>
              AI 解决方案助手问答
            </Button>
            <Button icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              快捷新建评估案卷
            </Button>
            <Button icon={<ReloadOutlined />} onClick={fetchProjects}>
              刷新
            </Button>
          </Space>
        }
        metrics={metrics}
      />

      <AsyncState
        loading={loading}
        error={loadError}
        isEmpty={projects.length === 0}
        emptyText="暂无系统建设评估卷宗。您可以前往「AI 解决方案助手」聊天生成方案，点击一键转化为交付卷宗。"
        onRetry={fetchProjects}
      >
        <Card className="consulting-table-card" title="客户需求评估与人才打法卷宗一览" extra={<Text type="secondary">{summary}</Text>}>
          <ResponsiveDataView
            desktopView={
              <Table<CustomerProject>
                rowKey="id"
                dataSource={projects}
                pagination={{ pageSize: 8, showSizeChanger: true }}
              >
                <Table.Column<CustomerProject>
                  title="案卷编号"
                  key="dossier_code"
                  width={140}
                  render={(_, record) => <span className="dossier-code">{formatDossierCode(record.created_at)}</span>}
                />
                <Table.Column<CustomerProject>
                  title="评估系统 / 方案名称"
                  dataIndex="name"
                  key="name"
                  render={(value, record) => (
                    <div>
                      <strong style={{ fontSize: '14px' }}>{value}</strong>
                      {record.solution_document?.title && (
                        <div style={{ fontSize: '11.5px', color: '#8c8c8c', marginTop: 2 }}>
                          📄 文档: {record.solution_document.title}
                        </div>
                      )}
                    </div>
                  )}
                />
                <Table.Column<CustomerProject>
                  title="目标行业 / 领域"
                  dataIndex="industry"
                  key="industry"
                  width={130}
                  render={value => <Tag color="gold">{value || '通用业务领域'}</Tag>}
                />
                <Table.Column<CustomerProject>
                  title="人才经验线索"
                  key="expert_match"
                  width={160}
                  render={() => (
                    <Tag color="purple" icon={<ReadOutlined />}>
                      人才库专家打法匹配
                    </Tag>
                  )}
                />
                <Table.Column<CustomerProject>
                  title="可行性状态"
                  dataIndex="status"
                  key="status"
                  width={140}
                  render={value => (
                    <Tag color={value === 'ready' ? 'success' : 'processing'}>
                      {statusLabel[value] || value}
                    </Tag>
                  )}
                />
                <Table.Column<CustomerProject>
                  title="操作"
                  key="actions"
                  width={130}
                  render={(_, record) => (
                    <Button
                      type="primary"
                      size="small"
                      icon={<EyeOutlined />}
                      onClick={() => navigate(`/customer-projects/${record.id}`)}
                    >
                      查看卷宗
                    </Button>
                  )}
                />
              </Table>
            }
            mobileView={
              <div>
                <div className="mobile-record-grid">
                  {projects.slice((mobilePage - 1) * 6, mobilePage * 6).map(item => (
                    <div className="mobile-record-card" key={item.id}>
                      <div className="mobile-record-head">
                        <div className="mobile-record-title">
                          <span className="dossier-code">{formatDossierCode(item.created_at)}</span>
                          <strong>{item.name}</strong>
                        </div>
                        <Tag color={item.status === 'ready' ? 'success' : 'processing'}>
                          {statusLabel[item.status] || item.status}
                        </Tag>
                      </div>
                      <div className="mobile-record-summary">
                        领域：{item.industry || '通用业务'} | 痛点数：{(item.pain_points || []).length}
                      </div>
                      <div className="mobile-record-actions">
                        <Button
                          type="primary"
                          size="small"
                          icon={<EyeOutlined />}
                          onClick={() => navigate(`/customer-projects/${item.id}`)}
                        >
                          查看评估卷宗
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                {projects.length > 6 && (
                  <div style={{ marginTop: 16, textAlign: 'center' }}>
                    <Pagination
                      simple
                      current={mobilePage}
                      total={projects.length}
                      pageSize={6}
                      onChange={setMobilePage}
                    />
                  </div>
                )}
              </div>
            }
          />
        </Card>
      </AsyncState>

      <Modal
        title="快捷新建系统评估案卷"
        open={modalOpen}
        onOk={createProject}
        confirmLoading={creating}
        onCancel={() => setModalOpen(false)}
        okText="创建案卷"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="评估系统 / 方案名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例如：零售私域与电商自动化营销系统可行性评估" />
          </Form.Item>
          <Form.Item name="industry" label="目标行业领域">
            <Input placeholder="例如：零售电商、金融风控、制造业" />
          </Form.Item>
          <Form.Item name="pain_points" label="希望解决的技术/业务痛点 (换行分隔)">
            <Input.TextArea rows={3} placeholder="例如：数据孤岛严重\n营销转化率低\n缺乏离线自动化分发" />
          </Form.Item>
          <Form.Item name="goals" label="期望达到的系统效果与目标 (换行分隔)">
            <Input.TextArea rows={3} placeholder="例如：实现全渠道自动化打标\n系统吞吐提升 300%\n客户 ROI 提升 4 倍" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CustomerProjectsList;
