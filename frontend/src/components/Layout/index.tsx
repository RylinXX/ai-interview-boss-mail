import React from 'react';
import { Layout, Menu, Button, Avatar, Space, Dropdown, Badge, Tag, Popover, Spin, Empty, Typography, Modal, message, Drawer } from 'antd';
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
  MenuOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useThemeMode } from '../../contexts/ThemeContext';
import request, { getApiErrorMessage } from '../../utils/request';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const shellProductLine = 'Business Transformation OS';
const shellModuleLine = '知识资产与能力样本';

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
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
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
        request.get('/resumes/metrics'),
        role === 'admin' ? request.get('/settings/system') : Promise.resolve(null),
        role === 'admin' ? request.get('/settings/mail') : Promise.resolve(null),
      ]);

      const resumeMetrics = resumesResult.status === 'fulfilled'
        ? resumesResult.value as { success?: number; processing?: number; failed?: number }
        : {};
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
        count: resumeMetrics.failed || 0,
        path: '/resumes',
        tone: 'danger',
        icon: <WarningOutlined />,
        action: role === 'admin' || role === 'hr' ? 'reparse-failed-resumes' : undefined,
      });
      addNotification(nextItems, {
        key: 'resume-processing',
        title: '能力样本分析中',
        description: '模型正在读取文件并整理行业、项目和方法论',
        count: resumeMetrics.processing || 0,
        path: '/resumes',
        tone: 'info',
        icon: <ReloadOutlined />,
      });
      addNotification(nextItems, {
        key: 'resume-analyzed',
        title: '邮箱样本已完成',
        description: '已同步为能力证据，可进入知识资产库复核',
        count: resumeMetrics.success || 0,
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

  const notificationCount = notificationItems
    .filter(item => item.tone === 'danger' || item.tone === 'warning')
    .reduce((sum, item) => sum + item.count, 0);

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
              params: { limit: Math.min(item.count, 100) },
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
      description: '经营指标、异常提醒与近期业务变化',
      tag: '经营总览',
      className: 'workflow-nav-item workflow-nav-item-first',
    },
    {
      key: '/knowledge-assets',
      icon: <AppstoreOutlined />,
      label: '知识资产库',
      description: '资产检索、证据质量与人工复核',
      tag: '知识治理',
    },
    {
      key: '/resumes',
      icon: <FileTextOutlined />,
      label: '人才样本',
      description: '导入、解析状态与匿名能力档案',
      tag: '能力样本',
    },
    {
      key: '/customer-projects',
      icon: <SolutionOutlined />,
      label: '客户项目',
      description: '客户需求、项目方案与交付进度',
      tag: '项目交付',
    },
    {
      key: '/ai-solution-assistant',
      icon: <RobotOutlined />,
      label: 'AI 解决方案助手',
      description: '基于人才样本、项目打法与知识资产的 RAG 智能体对话与问答溯源',
      tag: '智能助手',
      className: 'workflow-nav-item workflow-nav-item-last',
    },
    {
      key: '/settings/users',
      icon: <SettingOutlined />,
      label: '用户管理',
      description: '内部成员、角色与访问权限',
      tag: '访问控制',
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

  const selectedMenuItem = menuItems.find(item => item.key === selectedKey);
  const pageMeta = location.pathname.startsWith('/settings/profile')
    ? { title: '个人设置', description: '账号信息与个人偏好', tag: '个人中心' }
    : location.pathname.startsWith('/settings/system')
      ? { title: '系统设置', description: '模型、邮箱导入与系统运行配置', tag: '系统配置' }
      : {
          title: selectedMenuItem?.label || '数据资产工作台',
          description: selectedMenuItem?.description || '业务数据与知识资产协同管理',
          tag: selectedMenuItem?.tag || '业务工作台',
        };

  const renderedMenuItems = filteredMenuItems.map(({ key, icon, label, className }) => ({
    key,
    icon,
    label,
    className,
  }));

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
      <Drawer
        title="业务导航"
        placement="left"
        size={280}
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        className="mobile-nav-drawer"
        styles={{ body: { padding: 0 } }}
      >
        <div className="mobile-brand-lockup">
          <img src="/logo.png" alt="Qylin Intelligence" />
          <div><strong>QylinIntel</strong><span>{shellProductLine}</span></div>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={renderedMenuItems}
          onClick={({ key }) => {
            navigate(key);
            setMobileNavOpen(false);
          }}
          className="mobile-sidebar-menu"
        />
      </Drawer>
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
            <img src="/logo.png" alt="Qylin Intelligence" />
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
          items={renderedMenuItems}
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
          <Button
            type="text"
            className="header-icon-button mobile-nav-button"
            icon={<MenuOutlined />}
            onClick={() => setMobileNavOpen(true)}
            aria-label="打开业务导航"
          />
          <Space size="middle" className="page-title-group">
            <div>
              <h2>{pageMeta.title}</h2>
              <span>{pageMeta.description}</span>
            </div>
            <Tag color="processing" className="env-tag">{pageMeta.tag}</Tag>
          </Space>
          <Space size="large" className="app-header-actions">
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
              <Badge count={notificationCount} overflowCount={9} size="small" offset={[-4, 4]}>
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
