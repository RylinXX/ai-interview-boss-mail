import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Empty, Space, Spin, Tag, Typography } from 'antd';
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  PlayCircleOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import request, { getApiErrorMessage } from '../../utils/request';
import '../BusinessWorkbench.css';

const { Title, Text, Paragraph } = Typography;

type AIEmployee = {
  employee_type: string;
  display_name: string;
  responsibility: string;
  output_template: string;
  status: string;
  ready_task_count: number;
  accepted_run_count: number;
  next_task_id?: string;
  next_project_id?: string;
  latest_project_name?: string;
};

const AIEmployeesList: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<AIEmployee[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request.get('/ai-employees');
      setEmployees(res as AIEmployee[]);
    } catch (error) {
      message.error(getApiErrorMessage(error, '获取 AI 员工失败'));
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const totalReadyTasks = employees.reduce((sum, item) => sum + (item.ready_task_count || 0), 0);
  const totalAcceptedRuns = employees.reduce((sum, item) => sum + (item.accepted_run_count || 0), 0);
  const activeEmployeeCount = employees.filter(item => (item.ready_task_count || 0) > 0).length;

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '70vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="ai-employees-page workbench-page">
      <section className="consulting-hero employee-hero">
        <div className="consulting-hero-copy">
          <span className="dossier-code">Delivery Roles</span>
          <Title level={1}>AI 员工交付编队</Title>
          <Text>每个 AI 员工对应一个咨询交付角色，从诊断、研究、方案到实施拆解，并直接连接客户项目任务板。</Text>
        </div>
        <Space className="consulting-hero-actions">
          <Button onClick={fetchEmployees}>刷新状态</Button>
          <Button type="primary" icon={<ArrowRightOutlined />} onClick={() => navigate('/customer-projects')}>
            查看客户项目
          </Button>
        </Space>
      </section>

      <div className="consulting-metric-grid employee-metric-grid">
        <Card className="consulting-metric-card">
          <span className="metric-icon"><RobotOutlined /></span>
          <Text type="secondary">AI 员工</Text>
          <strong>{employees.length}</strong>
          <span>覆盖诊断、研究、方案、指标与实施角色</span>
        </Card>
        <Card className="consulting-metric-card">
          <span className="metric-icon"><PlayCircleOutlined /></span>
          <Text type="secondary">待执行任务</Text>
          <strong>{totalReadyTasks}</strong>
          <span>来自客户项目执行任务板</span>
        </Card>
        <Card className="consulting-metric-card">
          <span className="metric-icon"><CheckCircleOutlined /></span>
          <Text type="secondary">已验收输出</Text>
          <strong>{totalAcceptedRuns}</strong>
          <span>已写入客户方案文档</span>
        </Card>
        <Card className="consulting-metric-card">
          <span className="metric-icon"><SafetyCertificateOutlined /></span>
          <Text type="secondary">活跃角色</Text>
          <strong>{activeEmployeeCount}</strong>
          <span>当前有可推进任务的员工</span>
        </Card>
      </div>

      {employees.length ? (
        <div className="employee-registry-grid">
          {employees.map(employee => (
            <Card className="employee-role-card" key={employee.employee_type}>
              <div className="employee-role-head">
                <span className="employee-role-badge"><RobotOutlined /></span>
                <div>
                  <Text strong>{employee.display_name}</Text>
                  <div><Tag color="green">{employee.status === 'available' ? 'MVP 可用' : employee.status}</Tag></div>
                </div>
              </div>
              <Paragraph>{employee.responsibility}</Paragraph>
              <div className="employee-role-stats">
                <span>
                  <strong>{employee.ready_task_count || 0}</strong>
                  待执行任务
                </span>
                <span>
                  <strong>{employee.accepted_run_count || 0}</strong>
                  已验收输出
                </span>
              </div>
              <div className="employee-role-template">
                <FileTextOutlined />
                <span>{employee.output_template}</span>
              </div>
              <div className="employee-role-footer">
                <SafetyCertificateOutlined />
                <span>{employee.latest_project_name || '等待客户项目任务'}</span>
                <Button
                  size="small"
                  type={employee.next_project_id ? 'primary' : 'default'}
                  disabled={!employee.next_project_id}
                  onClick={() => employee.next_project_id && navigate(`/customer-projects/${employee.next_project_id}`)}
                >
                  进入执行
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 AI 员工" />
      )}
    </div>
  );
};

export default AIEmployeesList;
