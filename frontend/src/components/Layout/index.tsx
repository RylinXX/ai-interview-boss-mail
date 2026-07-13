import React from 'react';
import { Layout, Menu, Button, Avatar, Space, Dropdown, Badge, Tag, Popover, Spin, Empty, Typography, Modal, message } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  FileTextOutlined,
  LogoutOutlined,
  BellOutlined,
  SettingOutlined,
  MoonOutlined,
  SunOutlined,
  WarningOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  UploadOutlined,
  RobotOutlined,
  SolutionOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useThemeMode } from '../../contexts/ThemeContext';
import request, { getApiErrorMessage } from '../../utils/request';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const shellProductLine = 'Business Transformation OS';
const shellModuleLine = '知识资产与能力样本';
const headerSubtitle = '简历样本、结构化解析、知识资产同步与数据复核';
const headerTag = 'Data Workbench';

type NotificationTone = 'danger' | 'warning' | 'info' | 'success';

type NotificationItem = {
  key: string;
  title: string;
  description: string;
  count: number;
  path: string;
  tone: NotificationTone;
  icon: React.ReactNode;
  action?: 'reparse-failed-resumes';
};

const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user } = useAuth();
  const { isDark, toggleTheme } = useThemeMode();
  const [collapsed, setCollapsed] = React.useState(false);
  const [notificationOpen, setNotificationOpen] = React.useState(false);
  const [notificationLoading, setNotificationLoading] = React.useState(false);
  const [notificationItems, setNotificationItems] = React.useState<NotificationItem[]>([]);
  const [lastNotificationSync, setLastNotificationSync] = React.useState<string | null>(null);
  const role = (user as any)?.role?.value ?? (user as any)?.role;
  const roleLabelMap: Record<string, string> = {
    admin: '管理员',
    hr: '成员',
    interviewer: '成员',
    executive: '管理层',
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const addNotification = (
    list: NotificationItem[],
    item: Omit<NotificationItem, 'count'> & { count: number }
  ) => {
    if (item.count > 0) list.push(item);
  };

  const fetchNotifications = React.useCallback(async () => {
    if (!user) return;

    setNotificationLoading(true);
    try {
      const [resumesResult, systemResult, mailResult] = await Promise.allSettled([
        request.get('/resumes'),
        role === 'admin' ? request.get('/settings/system') : Promise.resolve(null),
        role === 'admin' ? request.get('/settings/mail') : Promise.resolve(null),
      ]);

      const resumes = resumesResult.status === 'fulfilled' && Array.isArray(resumesResult.value)
        ? resumesResult.value as any[]
        : [];
      const systemSettings = systemResult.status === 'fulfilled' ? systemResult.value as any : null;
      const mailSettings = mailResult.status === 'fulfilled' ? mailResult.value as any : null;

      const nextItems: NotificationItem[] = [];

      addNotification(nextItems, {
        key: 'system-api-key',
        title: '模型 API Key 未配置',
        description: '能力样本解析和知识资产同步会不可用',
        count: systemSettings && !systemSettings.llm_api_key_set ? 1 : 0,
        path: '/settings/system',
        tone: 'danger',
        icon: <WarningOutlined />,
      });
      addNotification(nextItems, {
        key: 'resume-parse-failed',
        title: '能力样本解析失败',
        description: '点击批量重新提交到模型解析队列',
        count: resumes.filter(item => item.parse_status === 'failed').length,
        path: '/resumes',
        tone: 'danger',
        icon: <WarningOutlined />,
        action: role === 'admin' || role === 'hr' ? 'reparse-failed-resumes' : undefined,
      });
      addNotification(nextItems, {
        key: 'resume-processing',
        title: '能力样本分析中',
        description: '模型正在读取文件并整理行业、项目和方法论',
        count: resumes.filter(item => item.parse_status === 'processing').length,
        path: '/resumes',
        tone: 'info',
        icon: <ReloadOutlined />,
      });
      addNotification(nextItems, {
        key: 'resume-analyzed',
        title: '邮箱样本已完成',
        description: '已同步为能力证据，可进入知识资产库复核',
        count: resumes.filter(item => item.parse_status === 'success').length,
        path: '/resumes',
        tone: 'success',
        icon: <CheckCircleOutlined />,
      });
      addNotification(nextItems, {
        key: 'mail-disabled',
        title: '样本邮箱导入未启用',
        description: '外部能力样本附件不会自动进入样本库',
        count: mailSettings && !mailSettings.mail_enabled ? 1 : 0,
        path: '/settings/system',
        tone: 'info',
        icon: <UploadOutlined />,
      });

      setNotificationItems(nextItems);
      setLastNotificationSync(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } finally {
      setNotificationLoading(false);
    }
  }, [role, user]);

  React.useEffect(() => {
    if (!user) return;
    fetchNotifications();
    const timer = window.setInterval(fetchNotifications, 60 * 1000);
    return () => window.clearInterval(timer);
  }, [fetchNotifications, user]);

  const notificationCount = notificationItems.reduce((sum, item) => sum + item.count, 0);

  const handleNotificationClick = React.useCallback((item: NotificationItem) => {
    if (item.action === 'reparse-failed-resumes') {
      setNotificationOpen(false);
      Modal.confirm({
        title: '批量重新解析失败样本',
        content: `将把当前 ${item.count} 份解析失败的能力样本重新提交到模型解析队列。`,
        okText: '开始重新解析',
        cancelText: '取消',
        onOk: async () => {
          try {
            const res = await request.post('/resumes/reparse-failed', undefined, {
              params: { limit: item.count },
            }) as any;
            message.success(`已提交 ${res.queued_count || 0} 份能力样本重新解析`);
            navigate('/resumes');
            await fetchNotifications();
          } catch (error) {
            message.error(getApiErrorMessage(error, '批量重新解析失败'));
            throw error;
          }
        },
      });
      return;
    }
    setNotificationOpen(false);
    navigate(item.path);
  }, [fetchNotifications, navigate]);

  const notificationPanel = (
    <div className="notification-panel">
      <div className="notification-panel-head">
        <div>
          <strong>通知中心</strong>
          <span>{lastNotificationSync ? `更新于 ${lastNotificationSync}` : '能力样本与交付状态'}</span>
        </div>
        <Button
          type="text"
          size="small"
          icon={<ReloadOutlined />}
          loading={notificationLoading}
          onClick={fetchNotifications}
        />
      </div>
      {notificationLoading && notificationItems.length === 0 ? (
        <div className="notification-loading">
          <Spin size="small" />
        </div>
      ) : notificationItems.length ? (
        <div className="notification-list">
          {notificationItems.map(item => (
            <button
              type="button"
              key={item.key}
              className={`notification-item notification-item-${item.tone}`}
              onClick={() => handleNotificationClick(item)}
            >
              <span className="notification-item-icon">{item.icon}</span>
              <span className="notification-item-body">
                <strong>{item.title}</strong>
                <Text type="secondary">{item.description}</Text>
              </span>
              <Badge count={item.count} />
            </button>
          ))}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待处理事项" />
      )}
    </div>
  );

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: '业务总览',
      className: 'workflow-nav-item workflow-nav-item-first',
    },
    {
      key: '/knowledge-assets',
      icon: <AppstoreOutlined />,
      label: '知识资产库',
    },
    {
      key: '/resumes',
      icon: <FileTextOutlined />,
      label: '邮箱样本',
    },
    {
      key: '/customer-projects',
      icon: <SolutionOutlined />,
      label: '客户项目',
    },
    {
      key: '/ai-employees',
      icon: <RobotOutlined />,
      label: 'AI 员工',
      className: 'workflow-nav-item workflow-nav-item-last',
    },
    {
      key: '/settings/users',
      icon: <SettingOutlined />,
      label: '用户管理',
      roles: ['admin'],
    },
  ];

  const filteredMenuItems = menuItems.filter(item => {
    if (!item.roles) return true;
    return item.roles.includes(role);
  });

  const selectedKey = [...filteredMenuItems].sort((a, b) => b.key.length - a.key.length).find(item =>
    location.pathname === item.key || location.pathname.startsWith(`${item.key}/`)
  )?.key || '/dashboard';

  const pageTitle =
    location.pathname.startsWith('/settings/profile')
      ? '个人设置'
      : location.pathname.startsWith('/settings/system')
        ? '系统设置'
        : menuItems.find(item => item.key === selectedKey)?.label || '数据资产工作台';

  const userMenuItems: any[] = [
    {
      key: 'profile',
      label: '个人中心',
      icon: <UserOutlined />,
      onClick: () => navigate('/settings/profile'),
    },
  ];

  if (role === 'admin') {
    userMenuItems.push({
      key: 'settings',
      label: '系统设置',
      icon: <SettingOutlined />,
      onClick: () => navigate('/settings/system'),
    });
  }

  userMenuItems.push(
    { type: 'divider' },
    {
      key: 'logout',
      label: '退出登录',
      icon: <LogoutOutlined />,
      onClick: handleLogout,
    }
  );

  return (
    <Layout className="app-shell" style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={240}
        collapsedWidth={76}
        theme={isDark ? 'dark' : 'light'}
        className="app-sidebar"
      >
        <div className="brand-lockup">
          <div className="brand-mark">
            <img src="/logo.svg" alt="Qylin Intelligence" />
          </div>
          {!collapsed && (
            <div className="brand-copy">
              <div className="brand-name"><span>Qylin</span>Intel</div>
              <div className="brand-subtitle">{shellProductLine}</div>
            </div>
          )}
        </div>
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={filteredMenuItems}
          onClick={({ key }) => navigate(key)}
          className="sidebar-menu"
        />
        {!collapsed && (
          <div className="sidebar-status">
            <span className="status-dot" />
            <div>
              <strong>{shellModuleLine}</strong>
              <span>样本数据与资产沉淀</span>
            </div>
          </div>
        )}
      </Sider>
      <Layout className="app-main" style={{ marginLeft: collapsed ? 76 : 240 }}>
        <Header className="app-header">
          <Space size="middle" className="page-title-group">
            <div>
              <h2>{pageTitle}</h2>
              <span>{headerSubtitle}</span>
            </div>
            <Tag color="processing" className="env-tag">{headerTag}</Tag>
          </Space>
          <Space size="large">
            <Button
              type="text"
              className="header-icon-button theme-toggle-button"
              icon={isDark ? <SunOutlined /> : <MoonOutlined />}
              onClick={toggleTheme}
              aria-label={isDark ? '切换到浅色模式' : '切换到深色模式'}
            />
            <Popover
              trigger="click"
              placement="bottomRight"
              open={notificationOpen}
              onOpenChange={(open) => {
                setNotificationOpen(open);
                if (open) fetchNotifications();
              }}
              content={notificationPanel}
              overlayClassName="notification-popover"
            >
              <Badge count={notificationCount} size="small" offset={[-4, 4]}>
                <Button
                  type="text"
                  className="header-icon-button"
                  icon={<BellOutlined />}
                  aria-label="打开通知中心"
                />
              </Badge>
            </Popover>
            <Dropdown menu={{ items: userMenuItems }}>
              <Space className="user-trigger">
                <Avatar className="user-avatar" icon={<UserOutlined />} />
                <span className="user-copy">
                  <strong>{user?.full_name || user?.email}</strong>
                  <small>{roleLabelMap[role] || '成员'}</small>
                </span>
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content className="app-content">
          <div className="page-container">
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
