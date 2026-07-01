import React from 'react';
import { App, Form, Input, Button, Card, Typography } from 'antd';
import {
  UserOutlined,
  LockOutlined,
  CheckCircleOutlined,
  ClusterOutlined,
  LineChartOutlined,
  SafetyCertificateOutlined,
  MoonOutlined,
  SunOutlined
} from '@ant-design/icons';
import request from '../../utils/request';
import { useAuth } from '../../contexts/AuthContext';
import { useThemeMode } from '../../contexts/ThemeContext';
import { useNavigate, useLocation } from 'react-router-dom';

const { Title, Text } = Typography;

const Login: React.FC = () => {
  const { login, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useThemeMode();
  const { message } = App.useApp();
  useLocation();
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate('/knowledge-assets', { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      // Use URLSearchParams to send form data as application/x-www-form-urlencoded
      const formData = new URLSearchParams();
      formData.append('username', values.email);
      formData.append('password', values.password);

      const res = await request.post('/auth/token', formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      await login((res as any).access_token);
      message.success('登录成功');
      navigate('/knowledge-assets', { replace: true });
    } catch (error) {
      message.error('登录失败，请检查账号密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <Button
        type="text"
        className="login-theme-toggle theme-toggle-button"
        icon={isDark ? <SunOutlined /> : <MoonOutlined />}
        onClick={toggleTheme}
        aria-label={isDark ? '切换到浅色模式' : '切换到深色模式'}
      />
      <section className="login-product-panel">
        <div className="login-brand-line">
          <div className="login-brand-mark">
            <img src="/logo.svg" alt="Qylin Intelligence" />
          </div>
          <span>Qylin Intelligence</span>
        </div>
        <div className="login-copy">
          <Text className="eyebrow">Business Transformation OS</Text>
          <Title level={1}>知识资产与能力样本库</Title>
          <Text>
            集中管理简历样本、行业经验和可复用项目证据，让新读取的样本持续沉淀，不覆盖历史资产。
          </Text>
        </div>

        <div className="login-preview">
          <div className="preview-toolbar">
            <span />
            <span />
            <span />
          </div>
          <div className="preview-grid">
            <div className="preview-kpi">
              <span>知识资产</span>
              <strong>128</strong>
              <em>持续沉淀</em>
            </div>
            <div className="preview-kpi accent">
              <span>能力样本</span>
              <strong>346</strong>
              <em>可背书</em>
            </div>
          </div>
          <div className="preview-chart" aria-hidden="true">
            <i style={{ height: '42%' }} />
            <i style={{ height: '56%' }} />
            <i style={{ height: '34%' }} />
            <i style={{ height: '72%' }} />
            <i style={{ height: '64%' }} />
            <i style={{ height: '82%' }} />
          </div>
          <div className="preview-pipeline">
            {['样本导入', '结构解析', '资产同步', '数据复核'].map((item, index) => (
              <div key={item}>
                <span>{index + 1}</span>
                <strong>{item}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="login-trust-row">
          <span><SafetyCertificateOutlined /> 证据资产背书</span>
          <span><LineChartOutlined /> 样本数据看板</span>
          <span><ClusterOutlined /> 知识资产同步</span>
        </div>
      </section>

      <section className="login-form-panel">
        <Card className="login-card" variant="borderless">
          <div className="login-card-head">
            <Text className="eyebrow">Secure Access</Text>
            <Title level={2}>登录工作台</Title>
            <Text type="secondary">使用管理员演示账号进入系统</Text>
          </div>

        <Form
          name="login"
          initialValues={{ remember: true }}
          onFinish={onFinish}
          size="large"
          layout="vertical"
          className="login-form"
        >
          <Form.Item
            name="email"
            label="邮箱"
            rules={[{ required: true, message: '请输入邮箱' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="邮箱 (admin@example.com)" autoComplete="username" />
          </Form.Item>

          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码 (admin123)" autoComplete="current-password" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              进入系统
            </Button>
          </Form.Item>

          <div className="demo-account">
            <CheckCircleOutlined />
            <Text>默认账号：admin@example.com / admin123</Text>
          </div>
        </Form>
      </Card>
      </section>
    </div>
  );
};

export default Login;
