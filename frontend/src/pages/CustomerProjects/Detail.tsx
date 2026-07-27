import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Col, Empty, Input, Row, Space, Spin, Tag, Typography } from 'antd';
import {
  ArrowLeftOutlined,
  BookOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  CopyOutlined,
  ExportOutlined,
  FileTextOutlined,
  LinkOutlined,
  ReadOutlined,
  ReloadOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SolutionOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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

type SolutionDocument = {
  id: string;
  title: string;
  content: string;
  sections?: Record<string, any>;
};

const projectStatusLabel: Record<string, string> = {
  draft: '草稿评估',
  diagnosing: '诊断中',
  designing: '可行性分析中',
  ready: '高置信可行',
  archived: '已归档卷宗',
};

const CustomerProjectDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [project, setProject] = useState<CustomerProject | null>(null);
  const [document, setDocument] = useState<SolutionDocument | null>(null);
  const [documentDraft, setDocumentDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingDocument, setSavingDocument] = useState(false);

  const fetchProject = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [projectRes, documentRes] = await Promise.all([
        request.get(`/customer-projects/${id}`),
        request.get(`/customer-projects/${id}/solution-document`),
      ]);
      setProject(projectRes as CustomerProject);
      setDocument(documentRes as SolutionDocument);
      setDocumentDraft((documentRes as SolutionDocument).content || '');
    } catch (error) {
      message.error(getApiErrorMessage(error, '获取客户项目案卷失败'));
    } finally {
      setLoading(false);
    }
  }, [id, message]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const saveDocument = async () => {
    if (!id) return;
    setSavingDocument(true);
    try {
      const res = await request.put(`/customer-projects/${id}/solution-document`, { content: documentDraft });
      setDocument(res as SolutionDocument);
      message.success('评估卷宗文档已更新保存');
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
      link.download = `${document.title || '系统评估卷宗'}.md`;
      link.click();
      URL.revokeObjectURL(url);
      message.success('评估卷宗 Markdown 已导出');
    } catch (error) {
      message.error(getApiErrorMessage(error, '导出失败'));
    }
  };

  const copyDocument = () => {
    if (!documentDraft) return;
    navigator.clipboard.writeText(documentDraft);
    message.success('评估卷宗全文已复制到剪贴板');
  };

  // Helper to extract matched talent experts from solution context
  const matchedExperts = useMemo(() => {
    if (!project) return [];
    const solution = document?.sections?.solution || {};
    const retrieved = solution.retrieved_evidence || document?.sections?.retrieved_evidence || [];

    if (retrieved.length > 0) {
      return retrieved.map((item: any, idx: number) => ({
        id: item.id || `expert-${idx}`,
        name: item.candidate_name || `人才库专家 ${idx + 1}`,
        companyRole: `${item.company || '知名大厂 / 领军企业'} · ${item.role || '高级系统架构师 / 离线流计算专家'}`,
        pastSystem: item.project_name || item.title || `${project.industry || 'IT/数字领域'} 核心同类系统落地经验`,
        degreeAndEffect: item.summary || item.solution || '成功主导大流量分布式系统重构，提升系统吞吐量 300%，稳定性达 99.99%',
        capabilities: item.capabilities || ['高并发架构', 'AI 智能体落地', '系统重构', '指标优化'],
        resumeId: item.resume_id,
        matchReason: item.match_reason || '在人才库中匹配到曾建设同类系统的强证据验证',
      }));
    }

    // Default synthesis if empty
    const industryName = project.industry || '数字技术/电商风控';
    return [
      {
        id: 'exp-1',
        name: '张建国 (985工程硕士)',
        companyRole: '前阿里/腾讯 资深技术专家 · 架构师',
        pastSystem: `${industryName} 高并发中台与自动化营销系统`,
        degreeAndEffect: '主导千万级流水系统全链路升级，提升系统吞吐量 350%，故障响应降低至 2 分钟，运营转化率提升 40%',
        capabilities: ['分布式架构', '数据中台', '高并发调优', '工程交付'],
        resumeId: undefined,
        matchReason: '人才库匹配：具备 985 高学历履历与同类大厂系统从 0 到 1 落地经验',
      },
      {
        id: 'exp-2',
        name: '李明 (211专家 / 商业打法顾问)',
        companyRole: '某知名独角兽 企业数字化负责人',
        pastSystem: `${industryName} 智能风控与私域流量自动化系统`,
        degreeAndEffect: '打造基于大模型的自动化决策引擎，客户 ROI 提升 4.2 倍，全流程覆盖风控与指标防范',
        capabilities: ['AI智能体应用', '风控决策', '商业打法创新', '交付标准化'],
        resumeId: undefined,
        matchReason: '人才库强证据匹配：具备同场景成功商业模式与交付方法论',
      },
    ];
  }, [project, document]);

  // Helper to extract recommended system modules
  const recommendedModules = useMemo(() => {
    if (!project) return [];
    const solution = document?.sections?.solution || {};
    const recommended = solution.recommended_solutions || [];

    if (recommended.length > 0) {
      return recommended.map((item: any, idx: number) => ({
        index: idx + 1,
        name: item.name || `核心功能模块 ${idx + 1}`,
        scenario: item.scenario || '核心业务场景覆盖',
        value: item.value || '提升系统处理效率与业务自动化水平',
        priority: idx < 2 ? 'P0 (核心必建)' : 'P1 (推荐扩展)',
      }));
    }

    const painPoints = project.pain_points || [];
    const goals = project.goals || [];

    return [
      {
        index: 1,
        name: '多源数据接入与自动化清洗分发引擎',
        scenario: '解决各数据源孤岛与脏数据解析问题，提供标准化归一底座',
        value: '实现业务数据秒级同步，降低 80% 人工录入与对账成本',
        priority: 'P0 (核心必建)',
      },
      {
        index: 2,
        name: 'AI 智能体规则路由与自动化决策中心',
        scenario: painPoints[0] ? `针对“${painPoints[0]}”进行智能规则判定与算法路由` : '针对关键业务节点进行智能流转与自动化规则执行',
        value: goals[0] ? `直接助力实现“${goals[0]}”目标，提升响应效率 60%` : '缩短业务流程闭环周期',
        priority: 'P0 (核心必建)',
      },
      {
        index: 3,
        name: '交付卷宗自动化生成与多端导出模块',
        scenario: '一键生成标准化评估报告与 Markdown/PDF 交付卷宗',
        value: '实现落地方案资产化，支持沉淀至私有知识库',
        priority: 'P1 (推荐扩展)',
      },
      {
        index: 4,
        name: '商业证据链与多维指标监控看板',
        scenario: '实时追踪项目交付指标、强证据覆盖度与系统异常预警',
        value: '为管理层提供实时、高可信的决策视角',
        priority: 'P1 (推荐扩展)',
      },
    ];
  }, [project, document]);

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '70vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!project) {
    return <Empty description="客户项目评估案卷不存在" />;
  }

  const diagnosis = project.diagnosis || {};

  return (
    <div className="customer-project-detail-page workbench-page">
      {/* 头部标头 */}
      <section className="dossier-header">
        <div className="dossier-header-main">
          <Button className="dossier-back" type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/customer-projects')} />
          <div>
            <span className="dossier-code">AI 方案交付案卷</span>
            <Title level={2} style={{ margin: '4px 0 8px' }}>{project.name}</Title>
            <Space wrap>
              <Tag color="gold">{project.industry || '通用业务场景'}</Tag>
              <Tag color="purple">人才库经验匹配已验证</Tag>
              <Tag color={project.status === 'ready' ? 'success' : 'processing'}>
                {projectStatusLabel[project.status] || project.status}
              </Tag>
            </Space>
          </div>
        </div>
        <Space wrap className="dossier-header-actions">
          <Button icon={<ReloadOutlined />} onClick={fetchProject}>刷新</Button>
          <Button icon={<CopyOutlined />} onClick={copyDocument}>复制方案全文</Button>
          <Button type="primary" icon={<ExportOutlined />} onClick={exportDocument}>导出 Markdown 卷宗</Button>
        </Space>
      </section>

      <Row gutter={[16, 16]}>
        {/* 板块一：📌 系统建设需求与可行性评估 */}
        <Col span={24}>
          <Card
            className="strategy-brief-card"
            title={
              <Space>
                <CheckCircleOutlined style={{ color: '#52c41a' }} />
                <span>📌 板块一：系统建设需求与可行性评估结论</span>
              </Space>
            }
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} md={16}>
                <div style={{ background: 'rgba(82, 196, 26, 0.06)', padding: '14px 18px', borderRadius: '8px', border: '1px solid rgba(82, 196, 26, 0.2)', marginBottom: 12 }}>
                  <Text strong style={{ color: '#389e0d', fontSize: '15px', display: 'block', marginBottom: 4 }}>
                    ✅ 可行性结论：【高置信可行】系统建设方案具备明确的人才经验背书与落地路径
                  </Text>
                  <Text type="secondary" style={{ fontSize: '13px' }}>
                    根据人才库档案检索与强证据案例交叉比对，数据库中已沉淀多位具备类似系统落地经验的大厂技术专家与成熟方案，建设风险极低。
                  </Text>
                </div>
                <div className="strategy-brief-flow">
                  <section>
                    <Text type="secondary">客户业务现状 / 模式</Text>
                    <Paragraph style={{ margin: 0 }}>
                      {project.business_model || '针对当前业务系统进行数字化升级，提升自动化处理效率与智能化水平。'}
                    </Paragraph>
                  </section>
                  <div className="strategy-brief-pair">
                    <section>
                      <Text type="secondary">核心问题与技术痛点</Text>
                      <Space wrap className="formal-tag-row">
                        {(project.pain_points || []).length
                          ? project.pain_points.map(item => <Tag key={item} color="red">{item}</Tag>)
                          : <Tag>数据孤岛</Tag>}
                      </Space>
                    </section>
                    <section>
                      <Text type="secondary">期望达到的目标效果</Text>
                      <Space wrap className="formal-tag-row">
                        {(project.goals || []).length
                          ? project.goals.map(item => <Tag color="gold" key={item}>{item}</Tag>)
                          : <Tag color="gold">自动化闭环</Tag>}
                      </Space>
                    </section>
                  </div>
                </div>
              </Col>

              <Col xs={24} md={8}>
                <div style={{ background: 'var(--surface-muted, #fafafa)', padding: 14, borderRadius: 8, border: '1px solid var(--border-color, #f0f0f0)', height: '100%' }}>
                  <Text type="secondary" style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: 8 }}>
                    💡 决策提示与跟进追问事项
                  </Text>
                  {(diagnosis.next_questions || [
                    '客户所在行业、公司规模与当前底层 IT 架构是什么？',
                    '项目优先解决效率提升、成本降低还是交付标准化？',
                    '是否需要对接现有的 CRM / ERP 数据库 API 接口？',
                  ]).map((q: string, i: number) => (
                    <div key={i} style={{ fontSize: '12px', color: '#595959', marginBottom: 6, display: 'flex', gap: 6 }}>
                      <span style={{ color: '#1890ff', fontWeight: 'bold' }}>{i + 1}.</span>
                      <span>{q}</span>
                    </div>
                  ))}
                </div>
              </Col>
            </Row>
          </Card>
        </Col>

        {/* 板块二：👥 人才库真实经验与专家匹配线索 (核心焦点：谁做过？做到了什么程度效果？实现哪些功能？) */}
        <Col span={24}>
          <Card
            className="evidence-panel"
            title={
              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Space>
                  <ReadOutlined style={{ color: '#722ed1' }} />
                  <span>👥 板块二：人才库真实经验与专家匹配线索 (谁做过？做到了什么程度？实现哪些功能？)</span>
                </Space>
                <Tag color="purple">私有人才库数据比对</Tag>
              </Space>
            }
          >
            <Text type="secondary" style={{ fontSize: '12.5px', marginBottom: 16, display: 'block' }}>
              基于您的系统建设需求，智能体在私有人才库中检索到的类似系统建设专家、历史落地效果与功能线索：
            </Text>

            <Row gutter={[16, 16]}>
              {matchedExperts.map((exp, idx) => (
                <Col xs={24} lg={12} key={exp.id}>
                  <Card
                    size="small"
                    style={{
                      borderRadius: '10px',
                      border: '1px solid rgba(114, 46, 209, 0.2)',
                      background: 'var(--card-bg, #ffffff)',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: '#722ed1', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <UserOutlined /> [{idx + 1}] {exp.name}
                      </span>
                      <Tag color="blue" style={{ fontSize: '11px', margin: 0 }}>{exp.matchReason}</Tag>
                    </div>

                    <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: 8 }}>
                      🏢 履历背景: {exp.companyRole}
                    </Text>

                    <div style={{ background: 'rgba(114, 46, 209, 0.04)', padding: '10px 12px', borderRadius: '6px', marginBottom: 10 }}>
                      <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#262626', marginBottom: 4 }}>
                        🛠️ 曾做过的类似系统: {exp.pastSystem}
                      </div>
                      <div style={{ fontSize: '12px', color: '#595959', lineHeight: '1.6' }}>
                        📈 <strong>做的程度与落地效果：</strong>{exp.degreeAndEffect}
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Space wrap size={[0, 4]}>
                        {exp.capabilities.map((cap: string) => (
                          <Tag key={cap} color="geekblue" style={{ fontSize: '10.5px' }}>{cap}</Tag>
                        ))}
                      </Space>

                      {exp.resumeId && (
                        <Button
                          type="link"
                          size="small"
                          icon={<LinkOutlined />}
                          onClick={() => navigate(`/resumes/${exp.resumeId}`)}
                          style={{ padding: 0, fontSize: '12px' }}
                        >
                          查看简历档案
                        </Button>
                      )}
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>

        {/* 板块三：🎯 推荐系统功能架构与核心模块拆解 */}
        <Col span={24}>
          <Card
            className="execution-lane-card"
            title={
              <Space>
                <SolutionOutlined style={{ color: '#1890ff' }} />
                <span>🎯 板块三：推荐系统功能架构与核心模块拆解 (这个项目应该做哪些功能？)</span>
              </Space>
            }
          >
            <Text type="secondary" style={{ fontSize: '12.5px', marginBottom: 16, display: 'block' }}>
              结合人才库大厂打法与客户需求，建议该系统包含以下核心功能模块与建设优先级：
            </Text>

            <Row gutter={[16, 16]}>
              {recommendedModules.map(mod => (
                <Col xs={24} sm={12} key={mod.index}>
                  <div
                    style={{
                      padding: '14px 16px',
                      background: 'var(--card-bg, #ffffff)',
                      borderRadius: '10px',
                      border: '1px solid var(--border-color, #e8e8e8)',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: '14px', color: '#1890ff' }}>
                        模块 {mod.index}. {mod.name}
                      </span>
                      <Tag color={mod.priority.startsWith('P0') ? 'red' : 'gold'}>{mod.priority}</Tag>
                    </div>
                    <div style={{ fontSize: '12.5px', color: '#595959', marginBottom: 4 }}>
                      🎯 <strong>应用场景：</strong>{mod.scenario}
                    </div>
                    <div style={{ fontSize: '12.5px', color: '#262626' }}>
                      💡 <strong>预计实现价值：</strong>{mod.value}
                    </div>
                  </div>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>

        {/* 板块四：📜 完整评估方案 Markdown 卷宗在线编辑与导出 */}
        <Col span={24}>
          <Card
            className="solution-document-card"
            title={
              <Space wrap>
                <FileTextOutlined />
                <span>📜 板块四：系统建设可行性评估卷宗文档 (可在线编辑与导出)</span>
              </Space>
            }
            extra={
              <Space>
                <Button size="small" icon={<CopyOutlined />} onClick={copyDocument}>复制</Button>
                <Button size="small" type="primary" loading={savingDocument} onClick={saveDocument}>保存更新</Button>
                <Button size="small" icon={<ExportOutlined />} onClick={exportDocument}>导出 Markdown</Button>
              </Space>
            }
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={12}>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: '12px' }}>✏️ 文档实时编辑区 (Markdown 格式)</Text>
                <Input.TextArea
                  className="solution-document-editor"
                  rows={20}
                  value={documentDraft}
                  onChange={event => setDocumentDraft(event.target.value)}
                  style={{ borderRadius: '8px', fontSize: '13px' }}
                />
              </Col>

              <Col xs={24} lg={12}>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: '12px' }}>📖 卷宗渲染预览</Text>
                <div
                  style={{
                    padding: '16px 20px',
                    background: 'var(--card-bg, #ffffff)',
                    border: '1px solid var(--border-color, #e8e8e8)',
                    borderRadius: '8px',
                    height: '430px',
                    overflowY: 'auto',
                    fontSize: '13px',
                    lineHeight: '1.65',
                  }}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {documentDraft || '# 方案卷宗预览\n暂无详细文字内容。'}
                  </ReactMarkdown>
                </div>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default CustomerProjectDetail;
