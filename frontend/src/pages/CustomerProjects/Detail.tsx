import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Col, Empty, Input, Modal, Progress, Row, Space, Spin, Tag, Typography } from 'antd';
import {
  ArrowLeftOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import request, { getApiErrorMessage } from '../../utils/request';
import '../BusinessWorkbench.css';

const { Title, Text, Paragraph } = Typography;

type CustomerProject = {
  id: string;
  name: string;
  industry?: string;
  company_scale?: string;
  business_model?: string;
  pain_points: string[];
  goals: string[];
  status: string;
  diagnosis: Record<string, any>;
  solution_document?: SolutionDocument;
};

type ProjectTask = {
  id: string;
  stage: string;
  title: string;
  description?: string;
  expected_output?: string;
  status: string;
  ai_employee_type?: string;
  output?: Record<string, any>;
};

type SolutionDocument = {
  id: string;
  title: string;
  content: string;
};

type AIEmployeeRun = {
  id: string;
  task_id: string;
  employee_type: string;
  status: string;
  output: {
    draft?: string;
    assumptions?: string[];
    follow_up_questions?: string[];
    suggested_document_updates?: string[];
  };
};

const stageLabel: Record<string, string> = {
  source_collection: '资料收集',
  diagnosis: '诊断分析',
  capability_matching: '能力匹配',
  solution_design: '方案设计',
  metrics: '指标验证',
  roadmap: '执行拆解',
};

const employeeLabel: Record<string, string> = {
  business_analyst: '业务分析师',
  industry_researcher: '行业研究员',
  product_manager: 'AI 产品经理',
  operations_consultant: '运营顾问',
  data_analyst: '数据分析师',
  implementation_planner: '实施规划师',
};

const statusColor: Record<string, string> = {
  todo: 'default',
  in_progress: 'processing',
  review: 'warning',
  done: 'success',
  blocked: 'error',
};

const taskStatusLabel: Record<string, string> = {
  todo: '待执行',
  in_progress: '执行中',
  review: '待验收',
  done: '已完成',
  blocked: '已阻塞',
};

const projectStatusLabel: Record<string, string> = {
  draft: '草稿',
  diagnosing: '诊断中',
  designing: '方案设计',
  ready: '可交付',
  archived: '已归档',
};

const stageOrder = ['source_collection', 'diagnosis', 'capability_matching', 'solution_design', 'metrics', 'roadmap'];

const CustomerProjectDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [project, setProject] = useState<CustomerProject | null>(null);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [document, setDocument] = useState<SolutionDocument | null>(null);
  const [documentDraft, setDocumentDraft] = useState('');
  const [selectedRun, setSelectedRun] = useState<AIEmployeeRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [savingDocument, setSavingDocument] = useState(false);

  const fetchProject = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [projectRes, tasksRes, documentRes] = await Promise.all([
        request.get(`/customer-projects/${id}`),
        request.get(`/customer-projects/${id}/tasks`),
        request.get(`/customer-projects/${id}/solution-document`),
      ]);
      setProject(projectRes as CustomerProject);
      setTasks(tasksRes as ProjectTask[]);
      setDocument(documentRes as SolutionDocument);
      setDocumentDraft((documentRes as SolutionDocument).content || '');
    } catch (error) {
      message.error(getApiErrorMessage(error, '获取客户项目失败'));
    } finally {
      setLoading(false);
    }
  }, [id, message]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const groupedTasks = useMemo(() => {
    return tasks.reduce<Record<string, ProjectTask[]>>((groups, task) => {
      if (!groups[task.stage]) groups[task.stage] = [];
      groups[task.stage].push(task);
      return groups;
    }, {});
  }, [tasks]);

  const orderedTaskStages = useMemo(() => {
    return Object.entries(groupedTasks).sort(([stageA], [stageB]) => {
      const indexA = stageOrder.includes(stageA) ? stageOrder.indexOf(stageA) : stageOrder.length;
      const indexB = stageOrder.includes(stageB) ? stageOrder.indexOf(stageB) : stageOrder.length;
      return indexA - indexB;
    });
  }, [groupedTasks]);

  const diagnosis = project?.diagnosis || {};
  const completedTasks = tasks.filter(task => task.status === 'done').length;
  const progressPercent = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;
  const diagnosisReady = Object.keys(diagnosis).length > 0;
  const nextAction = !diagnosisReady
    ? '先生成业务诊断'
    : tasks.length === 0
      ? '生成执行任务板'
      : '推进 AI 员工草稿验收';

  const generateDiagnosis = async () => {
    if (!id) return;
    try {
      const res = await request.post(`/customer-projects/${id}/diagnose`);
      setProject(res as CustomerProject);
      message.success('诊断已生成');
    } catch (error) {
      message.error(getApiErrorMessage(error, '生成诊断失败'));
    }
  };

  const generateTasks = async () => {
    if (!id) return;
    try {
      const res = await request.post(`/customer-projects/${id}/tasks/generate`);
      setTasks(res as ProjectTask[]);
      message.success('任务板已生成');
    } catch (error) {
      message.error(getApiErrorMessage(error, '生成任务失败'));
    }
  };

  const runEmployee = async (taskId: string) => {
    setRunningTaskId(taskId);
    try {
      const run = await request.post(`/project-tasks/${taskId}/ai-runs`);
      setSelectedRun(run as AIEmployeeRun);
      setTasks(prev => prev.map(task => (
        task.id === taskId ? { ...task, status: 'in_progress' } : task
      )));
      message.success('AI 员工已生成草稿');
    } catch (error) {
      message.error(getApiErrorMessage(error, 'AI 员工执行失败'));
    } finally {
      setRunningTaskId(null);
    }
  };

  const acceptRun = async () => {
    if (!selectedRun) return;
    try {
      await request.post(`/ai-runs/${selectedRun.id}/accept`);
      setSelectedRun(null);
      message.success('AI 员工输出已验收');
      await fetchProject();
    } catch (error) {
      message.error(getApiErrorMessage(error, '验收失败'));
    }
  };

  const discardRun = async () => {
    if (!selectedRun) return;
    try {
      await request.post(`/ai-runs/${selectedRun.id}/discard`);
      setSelectedRun(null);
      message.success('已丢弃 AI 员工草稿');
    } catch (error) {
      message.error(getApiErrorMessage(error, '丢弃失败'));
    }
  };

  const saveDocument = async () => {
    if (!id) return;
    setSavingDocument(true);
    try {
      const res = await request.put(`/customer-projects/${id}/solution-document`, { content: documentDraft });
      setDocument(res as SolutionDocument);
      message.success('方案文档已保存');
    } catch (error) {
      message.error(getApiErrorMessage(error, '保存方案文档失败'));
    } finally {
      setSavingDocument(false);
    }
  };

  const exportDocument = async () => {
    if (!id || !document) return;
    try {
      const content = await request.post(`/customer-projects/${id}/solution-document/export`);
      const blob = new Blob([String(content)], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = `${document.title}.md`;
      link.click();
      URL.revokeObjectURL(url);
      message.success('方案文档已导出');
    } catch (error) {
      message.error(getApiErrorMessage(error, '导出失败'));
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '70vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!project) {
    return <Empty description="客户项目不存在" />;
  }

  return (
    <div className="customer-project-detail-page workbench-page">
      <section className="dossier-header">
        <div className="dossier-header-main">
          <Button className="dossier-back" type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/customer-projects')} />
          <div>
            <span className="dossier-code">客户方案案卷</span>
            <Title level={1}>{project.name}</Title>
            <Space wrap>
              <Tag color="gold">{project.industry || '行业待补充'}</Tag>
              <Tag>{project.company_scale || '规模待补充'}</Tag>
              <Tag color={project.status === 'ready' ? 'success' : 'processing'}>
                {projectStatusLabel[project.status] || project.status}
              </Tag>
            </Space>
          </div>
        </div>
        <Space className="dossier-header-actions">
          <Button icon={<ReloadOutlined />} onClick={fetchProject}>刷新</Button>
          <Button onClick={generateDiagnosis}>生成诊断</Button>
          <Button type="primary" onClick={generateTasks}>生成任务板</Button>
        </Space>
      </section>

      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card className="dossier-progress-card">
            <Row gutter={[18, 18]} align="middle">
              <Col xs={24} md={8}>
                <Text type="secondary">下一步建议</Text>
                <Title level={4}>{nextAction}</Title>
              </Col>
              <Col xs={24} md={8}>
                <Text type="secondary">执行进度</Text>
                <Progress percent={progressPercent} strokeColor="#b88a3b" />
              </Col>
              <Col xs={24} md={8}>
                <Text type="secondary">案卷状态</Text>
                <div className="dossier-progress-meta">
                  <span>{diagnosisReady ? '诊断已生成' : '诊断待生成'}</span>
                  <span>{tasks.length} 个任务</span>
                  <span>{document?.title ? '方案文档已建立' : '文档待建立'}</span>
                </div>
              </Col>
            </Row>
          </Card>
        </Col>

        <Col span={14}>
          <Card
            className="strategy-brief-card"
            title={
              <Space>
                <BulbOutlined />
                <span>策略简报</span>
              </Space>
            }
          >
            <div className="strategy-brief-grid">
              <section>
                <Text type="secondary">客户背景</Text>
                <Paragraph>{project.business_model || '业务模式待补充。建议先补齐客户获客、交付、收费和组织协同方式。'}</Paragraph>
              </section>
              <section>
                <Text type="secondary">核心问题</Text>
                <Space wrap className="formal-tag-row">
                  {(project.pain_points || []).length
                    ? project.pain_points.map(item => <Tag key={item}>{item}</Tag>)
                    : <Tag>痛点待补充</Tag>}
                </Space>
              </section>
              <section>
                <Text type="secondary">业务目标</Text>
                <Space wrap className="formal-tag-row">
                  {(project.goals || []).length
                    ? project.goals.map(item => <Tag color="gold" key={item}>{item}</Tag>)
                    : <Tag color="gold">目标待补充</Tag>}
                </Space>
              </section>
              <section>
                <Text type="secondary">诊断标签</Text>
                {diagnosisReady ? (
                  <Space wrap className="formal-tag-row">
                    {(diagnosis.problem_categories || []).map((item: string) => (
                      <Tag color="purple" key={item}>{item}</Tag>
                    ))}
                  </Space>
                ) : (
                  <Paragraph>尚未生成诊断。先用当前客户背景生成根因假设和追问清单。</Paragraph>
                )}
              </section>
              <section className="strategy-brief-wide">
                <Text type="secondary">根因假设</Text>
                {diagnosisReady ? (
                  <ul className="formal-list">
                    {(diagnosis.root_cause_hypotheses || []).map((item: string) => <li key={item}>{item}</li>)}
                  </ul>
                ) : (
                  <Paragraph>生成诊断后，这里会展示可验证的业务根因假设。</Paragraph>
                )}
              </section>
              <section className="strategy-brief-wide">
                <Text type="secondary">下一步问题</Text>
                {diagnosisReady ? (
                  <ul className="formal-list">
                    {(diagnosis.next_questions || []).map((item: string) => <li key={item}>{item}</li>)}
                  </ul>
                ) : (
                  <Paragraph>生成诊断后，这里会变成客户访谈和方案确认的问题清单。</Paragraph>
                )}
              </section>
            </div>
          </Card>
        </Col>

        <Col span={10}>
          <Card
            className="solution-document-card"
            title={
              <Space>
                <FileTextOutlined />
                <span>{document?.title || '方案文档'}</span>
              </Space>
            }
            extra={
              <Space>
                <Button size="small" onClick={exportDocument}>导出 Markdown</Button>
                <Button size="small" type="primary" loading={savingDocument} onClick={saveDocument}>保存</Button>
              </Space>
            }
          >
            <Input.TextArea
              className="solution-document-editor"
              rows={24}
              value={documentDraft}
              onChange={event => setDocumentDraft(event.target.value)}
            />
          </Card>
        </Col>

        <Col span={24}>
          <Card
            className="evidence-panel"
            title={
              <Space>
                <SafetyCertificateOutlined />
                <span>能力样本背书</span>
              </Space>
            }
          >
            <Row gutter={[14, 14]}>
              <Col xs={24} md={8}>
                <Text type="secondary">样本来源</Text>
                <Paragraph>高级白领能力样本与项目经历库，用于沉淀行业打法、组织经验和可复用业务方法。</Paragraph>
              </Col>
              <Col xs={24} md={8}>
                <Text type="secondary">当前项目行业</Text>
                <Title level={5}>{project.industry || '通用业务场景'}</Title>
              </Col>
              <Col xs={24} md={8}>
                <Text type="secondary">使用方式</Text>
                <Paragraph>在方案设计和 AI 员工任务中引用为能力背书，不作为招聘筛选依据。</Paragraph>
              </Col>
            </Row>
          </Card>
        </Col>

        <Col span={24}>
          <Card
            className="execution-lane-card"
            title={
              <Space>
                <RobotOutlined />
                <span>AI 员工执行线</span>
              </Space>
            }
          >
            {tasks.length ? (
              <div className="project-task-board">
                {orderedTaskStages.map(([stage, stageTasks]) => (
                  <div className="project-task-stage" key={stage}>
                    <div className="project-task-stage-title">
                      <span>{stageLabel[stage] || stage}</span>
                      <Tag>{stageTasks.length} 项</Tag>
                    </div>
                    {stageTasks.map(task => (
                      <div className="project-task-card" key={task.id}>
                        <div className="task-card-head">
                          <div>
                            <Text strong>{task.title}</Text>
                            <Text type="secondary">{task.description}</Text>
                          </div>
                          <Space wrap>
                            <Tag color={statusColor[task.status] || 'default'}>
                              {taskStatusLabel[task.status] || task.status}
                            </Tag>
                            <Tag icon={<RobotOutlined />}>{employeeLabel[task.ai_employee_type || ''] || 'AI 员工'}</Tag>
                          </Space>
                        </div>
                        <Paragraph className="task-expected-output">{task.expected_output}</Paragraph>
                        {task.output?.draft && <Paragraph className="task-output-preview">{task.output.draft}</Paragraph>}
                        <Button
                          size="small"
                          icon={<PlayCircleOutlined />}
                          loading={runningTaskId === task.id}
                          disabled={task.status === 'done'}
                          onClick={() => runEmployee(task.id)}
                        >
                          {task.status === 'done' ? '已验收写入方案' : task.output?.draft ? '重新生成草稿' : '生成交付草稿'}
                        </Button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未生成执行任务。生成任务板后，AI 员工会按交付阶段产出草稿。" />
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        title="AI 员工草稿"
        open={!!selectedRun}
        onCancel={() => setSelectedRun(null)}
        footer={[
          <Button key="discard" onClick={discardRun}>丢弃</Button>,
          <Button key="accept" type="primary" icon={<CheckCircleOutlined />} onClick={acceptRun}>验收并写入方案</Button>,
        ]}
      >
        <Space orientation="vertical" size={12}>
          <Tag icon={<RobotOutlined />}>{employeeLabel[selectedRun?.employee_type || ''] || selectedRun?.employee_type}</Tag>
          <Paragraph>{selectedRun?.output?.draft}</Paragraph>
          <Text type="secondary">后续问题</Text>
          <ul>
            {(selectedRun?.output?.follow_up_questions || []).map(item => <li key={item}>{item}</li>)}
          </ul>
        </Space>
      </Modal>
    </div>
  );
};

export default CustomerProjectDetail;
