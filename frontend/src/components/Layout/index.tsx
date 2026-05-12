import React from 'react';
import { Layout, Menu, Button, Avatar, Space, Dropdown, Badge, Tag, Popover, Spin, Empty, Typography } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  FileTextOutlined,
  TeamOutlined,
  BankOutlined,
  CodeOutlined,
  LogoutOutlined,
  BellOutlined,
  SettingOutlined,
  FileAddOutlined,
  ApartmentOutlined,
  MoonOutlined,
  SunOutlined,
  WarningOutlined,
  CalendarOutlined,
  SolutionOutlined,
  MailOutlined,
  ReloadOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useThemeMode } from '../../contexts/ThemeContext';
import request from '../../utils/request';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

type NotificationTone = 'danger' | 'warning' | 'info' | 'success';

type NotificationItem = {
  key: string;
  title: string;
  description: string;
  count: number;
  path: string;
  tone: NotificationTone;
  icon: React.ReactNode;
};

const isSameDay = (value?: string | null) => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
};

const isWithinNext24Hours = (value?: string | null) => {
  if (!value) return false;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return false;
  const diff = time - Date.now();
  return diff >= 0 && diff <= 24 * 60 * 60 * 1000;
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
    hr: 'HR',
    interviewer: '面试官',
    executive: '管理层'
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
      const [resumesResult, interviewsResult, offersResult, systemResult, mailResult] = await Promise.allSettled([
        request.get('/resumes', {
          params: role === 'interviewer' ? { reviewer_id: (user as any).id } : undefined,
        }),
        request.get('/interviews'),
        role === 'admin' || role === 'hr'
          ? request.get('/offers?page=1&page_size=100')
          : Promise.resolve({ items: [] }),
        role === 'admin' ? request.get('/settings/system') : Promise.resolve(null),
        role === 'admin' ? request.get('/settings/mail') : Promise.resolve(null),
      ]);

      const resumes = resumesResult.status === 'fulfilled' && Array.isArray(resumesResult.value)
        ? resumesResult.value as any[]
        : [];
      const interviews = interviewsResult.status === 'fulfilled' && Array.isArray(interviewsResult.value)
        ? interviewsResult.value as any[]
        : [];
      const offerPayload = offersResult.status === 'fulfilled' ? offersResult.value as any : null;
      const offers = Array.isArray(offerPayload?.items) ? offerPayload.items as any[] : [];
      const systemSettings = systemResult.status === 'fulfilled' ? systemResult.value as any : null;
      const mailSettings = mailResult.status === 'fulfilled' ? mailResult.value as any : null;

      const nextItems: NotificationItem[] = [];
      const pendingReviewStatuses = [
        'pending_review',
        'pending_dept_review',
        'pending_hr_decision',
        'auto_rejected_pending_review',
      ];

      addNotification(nextItems, {
        key: 'system-api-key',
        title: '模型 API Key 未配置',
        description: 'AI 简历解析、题目生成和评价能力会不可用',
        count: systemSettings && !systemSettings.llm_api_key_set ? 1 : 0,
        path: '/settings/system',
        tone: 'danger',
        icon: <WarningOutlined />,
      });
      addNotification(nextItems, {
        key: 'resume-parse-failed',
        title: '简历解析失败',
        description: '需要重新解析或检查文件内容',
        count: resumes.filter(item => item.parse_status === 'failed').length,
        path: '/resumes',
        tone: 'danger',
        icon: <WarningOutlined />,
      });
      addNotification(nextItems, {
        key: 'resume-review',
        title: '待人工评审简历',
        description: '包含部门评审、HR 决策和 AI 建议淘汰确认',
        count: resumes.filter(item => pendingReviewStatuses.includes(item.status)).length,
        path: '/resumes',
        tone: 'warning',
        icon: <SolutionOutlined />,
      });
      addNotification(nextItems, {
        key: 'resume-interview',
        title: '可安排面试候选人',
        description: '已通过筛选，等待安排面试',
        count: resumes.filter(item => item.status === 'pending_interview').length,
        path: '/interviews',
        tone: 'info',
        icon: <CalendarOutlined />,
      });
      addNotification(nextItems, {
        key: 'interview-today',
        title: '今日面试',
        description: '今天需要开始或跟进的面试',
        count: interviews.filter(item => ['scheduled', 'in_progress'].includes(item.status) && isSameDay(item.interview_time)).length,
        path: '/interviews',
        tone: 'warning',
        icon: <CalendarOutlined />,
      });
      addNotification(nextItems, {
        key: 'interview-confirm',
        title: '待确认面试结果',
        description: '已有评分或评语，需要进入结果确认',
        count: interviews.filter(item => (
          item.status !== 'completed' &&
          item.scores &&
          Object.keys(item.scores || {}).length > 0
        )).length,
        path: '/interviews',
        tone: 'warning',
        icon: <CheckCircleOutlined />,
      });
      addNotification(nextItems, {
        key: 'interview-upcoming',
        title: '24小时内面试',
        description: '近期将开始的面试安排',
        count: interviews.filter(item => item.status === 'scheduled' && isWithinNext24Hours(item.interview_time)).length,
        path: '/interviews',
        tone: 'info',
        icon: <CalendarOutlined />,
      });
      addNotification(nextItems, {
        key: 'offer-pending',
        title: 'Offer 待发送',
        description: '草稿或待发送 Offer 需要处理',
        count: offers.filter(item => ['draft', 'pending'].includes(item.status)).length,
        path: '/offers',
        tone: 'warning',
        icon: <MailOutlined />,
      });
      addNotification(nextItems, {
        key: 'offer-sent',
        title: 'Offer 等待候选人确认',
        description: '已发送但候选人尚未反馈',
        count: offers.filter(item => item.status === 'sent').length,
        path: '/offers',
        tone: 'info',
        icon: <MailOutlined />,
      });
      addNotification(nextItems, {
        key: 'mail-disabled',
        title: '邮件通知未启用',
        description: '面试通知和 Offer 链接不会自动发出',
        count: mailSettings && !mailSettings.mail_enabled ? 1 : 0,
        path: '/settings/system',
        tone: 'info',
        icon: <MailOutlined />,
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

  const notificationPanel = (
    <div className="notification-panel">
      <div className="notification-panel-head">
        <div>
          <strong>通知中心</strong>
          <span>{lastNotificationSync ? `更新于 ${lastNotificationSync}` : '实时待办聚合'}</span>
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
              onClick={() => {
                setNotificationOpen(false);
                navigate(item.path);
              }}
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
      label: '仪表盘',
    },
    {
      key: '/positions',
      icon: <UserOutlined />,
      label: '岗位管理',
      roles: ['admin', 'hr'],
    },
    {
      key: '/question-banks',
      icon: <BankOutlined />,
      label: '题库管理',
      roles: ['admin', 'hr'],
    },
    {
      key: '/resumes',
      icon: <FileTextOutlined />,
      label: '简历管理',
    },
    {
      key: '/interviews',
      icon: <TeamOutlined />,
      label: '面试管理',
    },
    {
      key: '/coding-tests',
      icon: <CodeOutlined />,
      label: '笔试管理',
      roles: ['admin', 'hr'],
    },
    {
      key: '/offers',
      icon: <FileAddOutlined />,
      label: 'Offer管理',
      roles: ['admin', 'hr'],
    },
    {
      key: '/offers/templates',
      icon: <FileTextOutlined />,
      label: 'Offer模板',
      roles: ['admin', 'hr'],
    },
    {
      key: '/workflows',
      icon: <ApartmentOutlined />,
      label: '工作流',
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

  const selectedKey = filteredMenuItems.find(item =>
    location.pathname === item.key || location.pathname.startsWith(`${item.key}/`)
  )?.key || '/dashboard';

  const pageTitle =
    location.pathname.startsWith('/settings/profile')
      ? '个人设置'
      : location.pathname.startsWith('/settings/system')
        ? '系统设置'
        : location.pathname.startsWith('/workflows/')
          ? '工作流编辑'
          : menuItems.find(item => item.key === selectedKey)?.label || 'AI 面试助手';

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

  const userMenu = { items: userMenuItems };

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
            <img src="/logo.svg" alt="QylinHR OS" />
          </div>
          {!collapsed && (
            <div className="brand-copy">
              <div className="brand-name"><span>Qylin</span>HR OS</div>
              <div className="brand-subtitle">Hiring Intelligence</div>
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
              <strong>系统运行中</strong>
              <span>本地演示环境</span>
            </div>
          </div>
        )}
      </Sider>
      <Layout className="app-main" style={{ marginLeft: collapsed ? 76 : 240 }}>
        <Header className="app-header">
          <Space size="middle" className="page-title-group">
            <div>
              <h2>{pageTitle}</h2>
              <span>招聘流程、候选人体验与面试效率管理</span>
            </div>
            <Tag color="processing" className="env-tag">演示环境</Tag>
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
            <Dropdown menu={userMenu}>
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
