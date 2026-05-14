import React, { useCallback, useEffect, useState } from 'react';
import { App, Card, Empty, Space, Spin, Tag, Typography } from 'antd';
import { FileTextOutlined, RobotOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import request, { getApiErrorMessage } from '../../utils/request';
import '../BusinessWorkbench.css';

const { Title, Text, Paragraph } = Typography;

type AIEmployee = {
  employee_type: string;
  display_name: string;
  responsibility: string;
  output_template: string;
  status: string;
};

const AIEmployeesList: React.FC = () => {
  const { message } = App.useApp();
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
          <Text>每个 AI 员工对应一个咨询交付角色，从诊断、研究、方案到实施拆解。</Text>
        </div>
      </section>

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
              <div className="employee-role-template">
                <FileTextOutlined />
                <span>{employee.output_template}</span>
              </div>
              <div className="employee-role-footer">
                <SafetyCertificateOutlined />
                <span>可在客户项目任务板中调用</span>
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
