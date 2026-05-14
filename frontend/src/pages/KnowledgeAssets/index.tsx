import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Col, Empty, Row, Space, Spin, Tag, Typography } from 'antd';
import {
  AppstoreOutlined,
  ArrowRightOutlined,
  BookOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  ProfileOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import request, { getApiErrorMessage } from '../../utils/request';
import '../BusinessWorkbench.css';

const { Title, Text, Paragraph } = Typography;

type KnowledgeAsset = {
  asset_type: string;
  title: string;
  description: string;
  value: string;
  source: string;
  count: number;
  route?: string;
  maturity: string;
  sample_items: Array<{
    title: string;
    description?: string;
    route?: string;
  }>;
};

const assetIcon: Record<string, React.ReactNode> = {
  talent_capabilities: <SafetyCertificateOutlined />,
  project_cases: <FolderOpenOutlined />,
  template_materials: <ProfileOutlined />,
  solution_library: <FileTextOutlined />,
  execution_sops: <BookOutlined />,
};

const maturityLabel: Record<string, string> = {
  available: '已接入',
  mvp: 'MVP',
};

const KnowledgeAssetsPage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<KnowledgeAsset[]>([]);

  useEffect(() => {
    const fetchAssets = async () => {
      setLoading(true);
      try {
        const res = await request.get('/knowledge-assets');
        setAssets(res as KnowledgeAsset[]);
      } catch (error) {
        message.error(getApiErrorMessage(error, '获取业务样本库失败'));
      } finally {
        setLoading(false);
      }
    };
    fetchAssets();
  }, [message]);

  const totals = useMemo(() => {
    return {
      assetTypes: assets.length,
      totalSamples: assets.reduce((sum, item) => sum + (item.count || 0), 0),
      activeTypes: assets.filter(item => (item.count || 0) > 0).length,
    };
  }, [assets]);

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '70vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="knowledge-assets-page workbench-page">
      <section className="consulting-hero knowledge-hero">
        <div className="consulting-hero-copy">
          <span className="dossier-code">Knowledge Asset Hub</span>
          <Title level={1}>业务样本库</Title>
          <Text>
            把简历能力、客户案例、行业模板、方案文档和执行 SOP 统一沉淀成 AI 产品经理的知识资产。简历负责背书，案例负责方法，模板和 SOP 负责让 AI 员工真正干活。
          </Text>
        </div>
        <Space className="consulting-hero-actions">
          <Button icon={<SafetyCertificateOutlined />} onClick={() => navigate('/resumes')}>
            高级人才能力样本
          </Button>
          <Button type="primary" icon={<ArrowRightOutlined />} onClick={() => navigate('/ai-employees')}>
            AI 员工工作台
          </Button>
        </Space>
      </section>

      <div className="consulting-metric-grid knowledge-metric-grid">
        <Card className="consulting-metric-card">
          <span className="metric-icon"><AppstoreOutlined /></span>
          <Text type="secondary">样本库类型</Text>
          <strong>{totals.assetTypes}</strong>
          <span>能力、案例、模板、方案、SOP</span>
        </Card>
        <Card className="consulting-metric-card">
          <span className="metric-icon"><DatabaseOutlined /></span>
          <Text type="secondary">已沉淀资产</Text>
          <strong>{totals.totalSamples}</strong>
          <span>来自当前系统已有数据</span>
        </Card>
        <Card className="consulting-metric-card">
          <span className="metric-icon"><FolderOpenOutlined /></span>
          <Text type="secondary">有数据类型</Text>
          <strong>{totals.activeTypes}</strong>
          <span>可直接参与方案生成</span>
        </Card>
        <Card className="consulting-metric-card">
          <span className="metric-icon"><BookOutlined /></span>
          <Text type="secondary">下一阶段</Text>
          <strong>SOP</strong>
          <span>让 AI 员工按步骤执行而不是泛聊</span>
        </Card>
      </div>

      {assets.length ? (
        <Row gutter={[16, 16]}>
          {assets.map(asset => (
            <Col xs={24} xl={12} key={asset.asset_type}>
              <Card className="knowledge-asset-card">
                <div className="knowledge-asset-head">
                  <span className="knowledge-asset-icon">{assetIcon[asset.asset_type] || <DatabaseOutlined />}</span>
                  <div>
                    <Space wrap>
                      <Title level={3}>{asset.title}</Title>
                      <Tag color={asset.maturity === 'available' ? 'green' : 'gold'}>
                        {maturityLabel[asset.maturity] || asset.maturity}
                      </Tag>
                    </Space>
                    <Text type="secondary">{asset.source}</Text>
                  </div>
                  <strong>{asset.count}</strong>
                </div>

                <Paragraph>{asset.description}</Paragraph>
                <div className="knowledge-asset-value">{asset.value}</div>

                <div className="knowledge-sample-list">
                  {asset.sample_items.length ? asset.sample_items.map(item => (
                    <button
                      type="button"
                      key={`${asset.asset_type}-${item.title}-${item.route || ''}`}
                      onClick={() => item.route && navigate(item.route)}
                    >
                      <span>{item.title}</span>
                      <small>{item.description || '已沉淀为可引用样本'}</small>
                    </button>
                  )) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无样本，后续可从客户项目或上传资料中沉淀" />
                  )}
                </div>

                <Button
                  type="link"
                  icon={<ArrowRightOutlined />}
                  onClick={() => asset.route && navigate(asset.route)}
                  disabled={!asset.route}
                >
                  进入来源
                </Button>
              </Card>
            </Col>
          ))}
        </Row>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无业务样本库数据" />
      )}
    </div>
  );
};

export default KnowledgeAssetsPage;
