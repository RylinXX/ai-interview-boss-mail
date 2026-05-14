import React, { useCallback, useEffect, useState } from 'react';
import { App, Card, Col, Empty, Row, Space, Spin, Tag, Typography } from 'antd';
import { RobotOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
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
      <div className="page-header">
        <div>
          <Title level={2}>AI 员工</Title>
          <Text type="secondary">一期作为任务板入口使用：每个 AI 员工负责生成可审阅的任务草稿，由顾问验收后写入方案。</Text>
        </div>
      </div>

      {employees.length ? (
        <Row gutter={[16, 16]}>
          {employees.map(employee => (
            <Col xs={24} md={12} xl={8} key={employee.employee_type}>
              <Card className="ai-employee-card">
                <Space orientation="vertical" size={12}>
                  <Space>
                    <span className="ai-employee-icon"><RobotOutlined /></span>
                    <div>
                      <Text strong>{employee.display_name}</Text>
                      <div><Tag color="green">{employee.status === 'available' ? '可用' : employee.status}</Tag></div>
                    </div>
                  </Space>
                  <Paragraph>{employee.responsibility}</Paragraph>
                  <div className="ai-employee-template">
                    <SafetyCertificateOutlined />
                    <span>{employee.output_template}</span>
                  </div>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 AI 员工" />
      )}
    </div>
  );
};

export default AIEmployeesList;
