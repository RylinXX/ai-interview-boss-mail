import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Col, Empty, Input, Modal, Row, Space, Spin, Tag, Typography } from 'antd';
import { ArrowLeftOutlined, CheckCircleOutlined, PlayCircleOutlined, ReloadOutlined, RobotOutlined } from '@ant-design/icons';
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
      <div className="page-header">
        <div>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/customer-projects')} />
          <Title level={2}>{project.name}</Title>
          <Text type="secondary">内部方案工作台：诊断、任务、AI 员工草稿和方案文档在这里汇总。</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchProject}>刷新</Button>
          <Button onClick={generateDiagnosis}>生成诊断</Button>
          <Button type="primary" onClick={generateTasks}>生成任务板</Button>
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        <Col span={8}>
          <Card title="客户背景">
            <Space orientation="vertical" size={12}>
              <Text>行业：{project.industry || '待补充'}</Text>
              <Text>规模：{project.company_scale || '待补充'}</Text>
              <Paragraph>{project.business_model || '业务模式待补充'}</Paragraph>
              <div>
                <Text type="secondary">痛点</Text>
                <Space wrap style={{ display: 'flex', marginTop: 8 }}>
                  {(project.pain_points || []).map(item => <Tag key={item}>{item}</Tag>)}
                </Space>
              </div>
              <div>
                <Text type="secondary">目标</Text>
                <Space wrap style={{ display: 'flex', marginTop: 8 }}>
                  {(project.goals || []).map(item => <Tag color="blue" key={item}>{item}</Tag>)}
                </Space>
              </div>
            </Space>
          </Card>
        </Col>

        <Col span={16}>
          <Card title="业务诊断">
            {project.diagnosis && Object.keys(project.diagnosis).length ? (
              <Row gutter={[12, 12]}>
                {(project.diagnosis.problem_categories || []).map((item: string) => (
                  <Col key={item}><Tag color="purple">{item}</Tag></Col>
                ))}
                <Col span={24}>
                  <Text type="secondary">根因假设</Text>
                  <ul>
                    {(project.diagnosis.root_cause_hypotheses || []).map((item: string) => <li key={item}>{item}</li>)}
                  </ul>
                </Col>
                <Col span={24}>
                  <Text type="secondary">下一步问题</Text>
                  <ul>
                    {(project.diagnosis.next_questions || []).map((item: string) => <li key={item}>{item}</li>)}
                  </ul>
                </Col>
              </Row>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未生成诊断" />
            )}
          </Card>
        </Col>

        <Col span={14}>
          <Card title="执行任务板">
            {tasks.length ? (
              <div className="project-task-board">
                {Object.entries(groupedTasks).map(([stage, stageTasks]) => (
                  <div className="project-task-stage" key={stage}>
                    <div className="project-task-stage-title">{stageLabel[stage] || stage}</div>
                    {stageTasks.map(task => (
                      <div className="project-task-card" key={task.id}>
                        <Space orientation="vertical" size={8} style={{ width: '100%' }}>
                          <Space wrap>
                            <Text strong>{task.title}</Text>
                            <Tag color={statusColor[task.status] || 'default'}>{task.status}</Tag>
                            <Tag icon={<RobotOutlined />}>{employeeLabel[task.ai_employee_type || ''] || 'AI 员工'}</Tag>
                          </Space>
                          <Text type="secondary">{task.description}</Text>
                          <Text>{task.expected_output}</Text>
                          {task.output?.draft && <Paragraph className="task-output-preview">{task.output.draft}</Paragraph>}
                          <Button
                            size="small"
                            icon={<PlayCircleOutlined />}
                            loading={runningTaskId === task.id}
                            onClick={() => runEmployee(task.id)}
                          >
                            让 AI 员工生成草稿
                          </Button>
                        </Space>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未生成任务板" />
            )}
          </Card>
        </Col>

        <Col span={10}>
          <Card
            title={document?.title || '方案文档'}
            extra={
              <Space>
                <Button size="small" onClick={exportDocument}>导出 Markdown</Button>
                <Button size="small" type="primary" loading={savingDocument} onClick={saveDocument}>保存</Button>
              </Space>
            }
          >
            <Input.TextArea
              className="solution-document-editor"
              rows={22}
              value={documentDraft}
              onChange={event => setDocumentDraft(event.target.value)}
            />
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
