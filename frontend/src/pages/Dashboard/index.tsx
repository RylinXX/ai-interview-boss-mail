import React, { useEffect, useState } from 'react';
import { App, Card, Row, Col, List, Avatar, Typography, Spin, Table, Tag, Progress, Tabs, Select, Empty } from 'antd';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, LineChart, Line
} from 'recharts';
import { 
  UserOutlined, FileTextOutlined, TeamOutlined, BankOutlined,
  ArrowUpOutlined, ClockCircleOutlined, ArrowDownOutlined,
  CheckCircleOutlined,
  TrophyOutlined, RiseOutlined
} from '@ant-design/icons';
import request from '../../utils/request';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const { Title, Text } = Typography;
const { Option } = Select;

interface DashboardStats {
  active_positions: number;
  pending_resumes: number;
  today_interviews: number;
  total_questions: number;
  trends: {
    active_positions: number;
    pending_resumes: number;
    today_interviews: number;
    total_questions: number;
  };
}

interface Activity {
  id: string;
  title: string;
  time: string;
  status: string;
  avatar_color: string;
  type: string;
}

interface FunnelStage {
  stage: string;
  stage_name: string;
  count: number;
  percentage: number;
}

interface RecruitmentFunnel {
  stages: FunnelStage[];
  total_resumes: number;
  conversion_rate: number;
}

interface PositionAnalytics {
  id: string;
  title: string;
  department: string;
  status: string;
  total_resumes: number;
  pending_screening: number;
  pending_interview: number;
  interview_completed: number;
  offer_sent: number;
  hired: number;
  rejected: number;
  avg_match_score: number | null;
  avg_processing_days: number | null;
  conversion_rate: number;
}

interface InterviewerStats {
  id: string;
  name: string;
  total_interviews: number;
  completed_interviews: number;
  pending_interviews: number;
  completion_rate: number;
  avg_score: number | null;
  score_std: number | null;
  consistency_rating: string;
}

interface TimelineDataPoint {
  date: string;
  resumes_received: number;
  interviews_scheduled: number;
  interviews_completed: number;
  offers_sent: number;
  hires: number;
}

interface OverviewMetrics {
  total_positions: number;
  active_positions: number;
  total_resumes: number;
  pending_resumes: number;
  total_interviews: number;
  completed_interviews: number;
  total_offers: number;
  accepted_offers: number;
  avg_time_to_hire: number | null;
  avg_match_score: number | null;
  interview_pass_rate: number;
  offer_accept_rate: number;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

const Dashboard: React.FC = () => {
  const { message } = App.useApp();
  const [statsData, setStatsData] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [funnel, setFunnel] = useState<RecruitmentFunnel | null>(null);
  const [positions, setPositions] = useState<PositionAnalytics[]>([]);
  const [interviewers, setInterviewers] = useState<InterviewerStats[]>([]);
  const [timeline, setTimeline] = useState<TimelineDataPoint[]>([]);
  const [overview, setOverview] = useState<OverviewMetrics | null>(null);
  const [timelineDays, setTimelineDays] = useState(30);

  useEffect(() => {
    fetchAllData();
  }, []);

  useEffect(() => {
    fetchTimelineData(timelineDays);
  }, [timelineDays]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [statsRes, funnelRes, positionsRes, interviewersRes, overviewRes] = await Promise.all([
        request.get('/dashboard/stats'),
        request.get('/dashboard/funnel'),
        request.get('/dashboard/positions'),
        request.get('/dashboard/interviewers'),
        request.get('/dashboard/overview')
      ]);
      
      setStatsData(statsRes.stats);
      setActivities(statsRes.recent_activities);
      setFunnel(funnelRes);
      setPositions(positionsRes.positions);
      setInterviewers(interviewersRes.interviewers);
      setOverview(overviewRes.metrics);
    } catch (error) {
      console.error(error);
      message.error('获取仪表盘数据失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchTimelineData = async (days: number) => {
    try {
      const res = await request.get(`/dashboard/timeline?days=${days}`);
      setTimeline(res.timeline);
    } catch (error) {
      console.error(error);
    }
  };

  const stats = [
    {
      title: "招聘中岗位",
      value: statsData?.active_positions || 0,
      icon: <UserOutlined style={{ fontSize: '20px', color: '#3B82F6' }} />,
      color: '#EFF6FF',
      trend: statsData?.trends.active_positions || 0
    },
    {
      title: "待筛选简历",
      value: statsData?.pending_resumes || 0,
      icon: <FileTextOutlined style={{ fontSize: '20px', color: '#EF4444' }} />,
      color: '#FEF2F2',
      trend: statsData?.trends.pending_resumes || 0
    },
    {
      title: "今日面试",
      value: statsData?.today_interviews || 0,
      icon: <TeamOutlined style={{ fontSize: '20px', color: '#10B981' }} />,
      color: '#ECFDF5',
      trend: statsData?.trends.today_interviews || 0
    },
    {
      title: "面试题库",
      value: statsData?.total_questions || 0,
      icon: <BankOutlined style={{ fontSize: '20px', color: '#8B5CF6' }} />,
      color: '#F5F3FF',
      trend: statsData?.trends.total_questions || 0
    }
  ];

  const positionColumns = [
    {
      title: '岗位名称',
      dataIndex: 'title',
      key: 'title',
      width: 250,
      render: (text: string, record: PositionAnalytics) => (
        <div>
          <Text strong>{text}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>{record.department}</Text>
        </div>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: string) => {
        const colorMap: Record<string, string> = {
          'open': 'blue',
          'published': 'green',
          'closed': 'default'
        };
        const textMap: Record<string, string> = {
          'open': '开放中',
          'published': '已发布',
          'closed': '已关闭'
        };
        return <Tag color={colorMap[status] || 'default'}>{textMap[status] || status}</Tag>;
      }
    },
    {
      title: '简历数',
      dataIndex: 'total_resumes',
      key: 'total_resumes',
      width: 80,
      sorter: (a: PositionAnalytics, b: PositionAnalytics) => a.total_resumes - b.total_resumes
    },
    {
      title: '待初筛',
      dataIndex: 'pending_screening',
      key: 'pending_screening',
      width: 80,
      render: (val: number, record: PositionAnalytics) => (
        <Text type={val > 0 ? 'warning' : 'secondary'}>{val}</Text>
      )
    },
    {
      title: '待面试',
      dataIndex: 'pending_interview',
      key: 'pending_interview',
      width: 80,
      render: (val: number) => (
        <Text type={val > 0 ? 'warning' : 'secondary'}>{val}</Text>
      )
    },
    {
      title: '已录用',
      dataIndex: 'hired',
      key: 'hired',
      width: 80,
      render: (val: number) => (
        <Text type="success" strong>{val}</Text>
      )
    },
    {
      title: '转化率',
      dataIndex: 'conversion_rate',
      key: 'conversion_rate',
      width: 150,
      render: (rate: number) => (
        <div className="rate-cell">
          <Progress
            percent={rate}
            size="small"
            showInfo={false}
            strokeColor={rate >= 20 ? '#10B981' : rate >= 10 ? '#F59E0B' : '#EF4444'}
          />
          <Text>{rate.toFixed(1)}%</Text>
        </div>
      )
    }
  ];

  const interviewerColumns = [
    {
      title: '面试官',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#3B82F6' }} />
          <Text strong>{text}</Text>
        </div>
      )
    },
    {
      title: '总面试数',
      dataIndex: 'total_interviews',
      key: 'total_interviews',
      sorter: (a: InterviewerStats, b: InterviewerStats) => a.total_interviews - b.total_interviews
    },
    {
      title: '已完成',
      dataIndex: 'completed_interviews',
      key: 'completed_interviews'
    },
    {
      title: '完成率',
      dataIndex: 'completion_rate',
      key: 'completion_rate',
      render: (rate: number) => (
        <Progress 
          percent={rate} 
          size="small" 
          format={(percent) => `${percent?.toFixed(1)}%`}
          strokeColor={rate >= 80 ? '#10B981' : rate >= 50 ? '#F59E0B' : '#EF4444'}
        />
      )
    },
    {
      title: '平均评分',
      dataIndex: 'avg_score',
      key: 'avg_score',
      render: (score: number | null) => score ? <Text strong>{score.toFixed(1)}</Text> : <Text type="secondary">-</Text>
    },
    {
      title: '评分一致性',
      dataIndex: 'consistency_rating',
      key: 'consistency_rating',
      render: (rating: string) => {
        const colorMap: Record<string, string> = {
          '非常一致': 'success',
          '较为一致': 'warning',
          '波动较大': 'error',
          '数据不足': 'default'
        };
        return <Tag color={colorMap[rating] || 'default'}>{rating}</Tag>;
      }
    }
  ];

  if (loading) {
    return (
      <div className="loading-state">
        <Spin size="large" />
        <Text type="secondary">正在加载招聘工作台</Text>
      </div>
    );
  }

  const coreMetrics = [
    {
      label: '面试通过率',
      value: `${overview?.interview_pass_rate || 0}%`,
      tone: overview?.interview_pass_rate && overview.interview_pass_rate >= 50 ? 'success' : 'danger',
      icon: <CheckCircleOutlined />
    },
    {
      label: 'Offer 接受率',
      value: `${overview?.offer_accept_rate || 0}%`,
      tone: overview?.offer_accept_rate && overview.offer_accept_rate >= 70 ? 'success' : 'warning',
      icon: <TrophyOutlined />
    },
    {
      label: '平均招聘周期',
      value: overview?.avg_time_to_hire ? `${overview.avg_time_to_hire} 天` : '-',
      tone: 'neutral',
      icon: <ClockCircleOutlined />
    },
    {
      label: '平均匹配分',
      value: overview?.avg_match_score ? overview.avg_match_score.toFixed(1) : '-',
      tone: overview?.avg_match_score && overview.avg_match_score >= 70 ? 'success' : 'warning',
      icon: <RiseOutlined />
    }
  ];

  const tabItems = [
    {
      key: 'positions',
      label: '岗位分析',
      children: (
        <Card variant="borderless" className="analysis-card">
          <Table
            className="compact-table"
            dataSource={positions}
            columns={positionColumns}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            scroll={{ x: 840 }}
            locale={{ emptyText: '暂无岗位数据' }}
          />
        </Card>
      )
    },
    {
      key: 'interviewers',
      label: '面试官分析',
      children: (
        <Card variant="borderless" className="analysis-card">
          <Table
            className="compact-table"
            dataSource={interviewers}
            columns={interviewerColumns}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            scroll={{ x: 840 }}
            locale={{ emptyText: '暂无面试官数据' }}
          />
        </Card>
      )
    },
    {
      key: 'activities',
      label: '最新动态',
      children: (
        <Card variant="borderless" className="analysis-card">
          <List
            className="activity-list"
            itemLayout="horizontal"
            dataSource={activities}
            locale={{ emptyText: '暂无动态' }}
            renderItem={item => (
              <List.Item>
                <List.Item.Meta
                  avatar={
                    <Avatar
                      icon={<UserOutlined />}
                      style={{ backgroundColor: item.avatar_color, color: '#fff' }}
                    />
                  }
                  title={<span>{item.title}</span>}
                  description={
                    <div className="activity-meta">
                      <ClockCircleOutlined />
                      <span>{dayjs(item.time).fromNow()}</span>
                      <Tag color={item.avatar_color}>{item.status}</Tag>
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        </Card>
      )
    }
  ];

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <Text className="eyebrow">Recruiting Operations</Text>
          <Title level={1}>招聘运营工作台</Title>
          <Text>
            集中查看岗位进展、候选人流转、面试执行和 Offer 转化，让招聘团队以统一数据推进决策。
          </Text>
        </div>
        <div className="dashboard-hero-panel">
          <div>
            <span>总候选人</span>
            <strong>{overview?.total_resumes || 0}</strong>
          </div>
          <div>
            <span>进行中岗位</span>
            <strong>{overview?.active_positions || statsData?.active_positions || 0}</strong>
          </div>
          <div>
            <span>已完成面试</span>
            <strong>{overview?.completed_interviews || 0}</strong>
          </div>
        </div>
      </section>

      <Row gutter={[16, 16]} className="kpi-grid">
        {stats.map((stat, index) => (
          <Col xs={24} sm={12} lg={6} key={stat.title}>
            <Card variant="borderless" className="metric-card">
              <div className="metric-card-head">
                <span className="metric-icon" style={{ background: stat.color }}>
                  {stat.icon}
                </span>
                <Tag color={stat.trend > 0 ? 'success' : stat.trend < 0 ? 'error' : 'default'}>
                  {stat.trend > 0 ? <ArrowUpOutlined /> : stat.trend < 0 ? <ArrowDownOutlined /> : null}
                  {stat.trend !== 0 ? `${Math.abs(stat.trend)} 本周新增` : '无变化'}
                </Tag>
              </div>
              <Text>{stat.title}</Text>
              <strong>{stat.value}</strong>
              <div className="metric-baseline">指标 {index + 1} / 4</div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} className="dashboard-section">
        <Col xs={24} xl={8}>
          <Card variant="borderless" className="executive-card">
            <div className="section-card-head">
              <div>
                <Text className="eyebrow">Performance</Text>
                <Title level={4}>核心转化指标</Title>
              </div>
            </div>
            <div className="core-metric-grid">
              {coreMetrics.map(metric => (
                <div className={`core-metric ${metric.tone}`} key={metric.label}>
                  <span>{metric.icon}</span>
                  <Text>{metric.label}</Text>
                  <strong>{metric.value}</strong>
                </div>
              ))}
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={16}>
          <Card variant="borderless" className="executive-card">
            <div className="section-card-head">
              <div>
                <Text className="eyebrow">Pipeline</Text>
                <Title level={4}>招聘漏斗</Title>
              </div>
              <div className="section-summary">
                <span>整体转化率</span>
                <strong>{funnel?.conversion_rate || 0}%</strong>
              </div>
            </div>
            {funnel && funnel.stages.length > 0 ? (
              <div className="funnel-list">
                {funnel.stages.map((stage, index) => (
                  <div key={stage.stage} className="funnel-row">
                    <div className="funnel-stage">
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <strong>{stage.stage_name}</strong>
                    </div>
                    <Progress
                      percent={stage.percentage}
                      strokeColor={COLORS[index % COLORS.length]}
                      format={() => `${stage.count} 人`}
                    />
                  </div>
                ))}
                <div className="funnel-footer">
                  <span>总简历数</span>
                  <strong>{funnel.total_resumes}</strong>
                </div>
              </div>
            ) : (
              <Empty description="暂无数据" />
            )}
          </Card>
        </Col>
      </Row>

      <Card variant="borderless" className="timeline-card">
        <div className="section-card-head">
          <div>
            <Text className="eyebrow">Trend</Text>
            <Title level={4}>时间趋势分析</Title>
          </div>
          <Select value={timelineDays} onChange={setTimelineDays} className="period-select">
            <Option value={7}>近7天</Option>
            <Option value={14}>近14天</Option>
            <Option value={30}>近30天</Option>
            <Option value={60}>近60天</Option>
            <Option value={90}>近90天</Option>
          </Select>
        </div>
        <div className="chart-panel">
          <ResponsiveContainer width="100%" height={350} minWidth={280}>
            <LineChart data={timeline} margin={{ top: 12, right: 8, left: -8, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
              <XAxis
                dataKey="date"
                tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => dayjs(value).format('MM-DD')}
              />
              <YAxis
                tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--surface-elevated)',
                  color: 'var(--text-primary)',
                  boxShadow: 'var(--shadow-md)'
                }}
                labelFormatter={(label) => dayjs(label).format('YYYY年MM月DD日')}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
              <Line type="monotone" dataKey="resumes_received" name="简历接收" stroke="#2563EB" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="interviews_scheduled" name="面试安排" stroke="#D97706" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="interviews_completed" name="面试完成" stroke="#059669" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="hires" name="入职" stroke="#7C3AED" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Tabs defaultActiveKey="positions" className="dashboard-tabs" items={tabItems} />
    </div>
  );
};

export default Dashboard;
