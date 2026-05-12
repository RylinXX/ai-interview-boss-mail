import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Descriptions, Dropdown, Empty, Form, Input, List, message, Modal, Progress, Row, Space, Spin, Tag, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { ArrowLeftOutlined, DownOutlined, EditOutlined, FileMarkdownOutlined, FilePdfOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import request, { getApiErrorMessage } from '../../utils/request';
import { getMaximizedPdfPreviewUrl } from '../../utils/pdfPreview';
// @ts-ignore
import html2pdf from 'html2pdf.js';

const { Title, Text, Paragraph } = Typography;

const statusInfo = (parseStatus?: string) => {
  if (parseStatus === 'failed') return { text: '分析失败', color: 'error' };
  if (parseStatus === 'processing') return { text: '分析中', color: 'processing' };
  if (parseStatus === 'success') return { text: '已分析', color: 'success' };
  return { text: '待处理', color: 'default' };
};

const asArray = (value: any) => Array.isArray(value) ? value : [];

const QuestionList = ({ title, data }: { title: string; data: any[] }) => (
  <Card title={title} style={{ marginBottom: 16 }}>
    {data.length ? (
      <List
        dataSource={data}
        renderItem={(item: any) => (
          <List.Item>
            <List.Item.Meta
              title={item.question || item.title || '问题'}
              description={
                <Space direction="vertical" size={4}>
                  {item.target_experience && <Text type="secondary">关联经历：{item.target_experience}</Text>}
                  {item.target_project && <Text type="secondary">关联项目：{item.target_project}</Text>}
                  {item.purpose && <Text>{item.purpose}</Text>}
                  {item.missing_context && <Text type="secondary">缺失信息：{item.missing_context}</Text>}
                </Space>
              }
            />
          </List.Item>
        )}
      />
    ) : (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无内容" />
    )}
  </Card>
);

const ResumeDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [resume, setResume] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [form] = Form.useForm();

  const fetchResume = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await request.get(`/resumes/${id}`) as any;
      setResume(res);
      form.setFieldsValue({
        candidate_name: res.candidate_name,
        email: res.email,
        contact: res.contact,
      });
    } catch (error) {
      message.error('获取简历详情失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResume();
  }, [id]);

  const handleUpdate = async () => {
    try {
      const values = await form.validateFields();
      await request.put(`/resumes/${id}`, values);
      message.success('更新成功');
      setIsEditing(false);
      fetchResume();
    } catch (error) {
      message.error(getApiErrorMessage(error, '更新失败'));
    }
  };

  const handleReparse = () => {
    Modal.confirm({
      title: '重新分析简历',
      content: '将重新调用模型读取简历，并覆盖现有经历抽取、问题和评估结果。',
      okText: '重新分析',
      cancelText: '取消',
      onOk: async () => {
        try {
          await request.post(`/resumes/${id}/reparse`);
          message.success('已提交重新分析');
          fetchResume();
        } catch (error) {
          message.error(getApiErrorMessage(error, '重新分析失败'));
        }
      },
    });
  };

  const handleExport = async (format: string = 'markdown') => {
    if (!resume || !id) return;

    if (format === 'pdf') {
      const element = document.getElementById('resume-analysis-report-content');
      if (!element) return;

      const opt = {
        margin: [15, 15, 15, 15],
        filename: `简历分析报告_${resume.candidate_name || '候选人'}_${resume.id}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      } as any;

      try {
        await html2pdf().from(element).set(opt).save();
        message.success('导出 PDF 成功');
      } catch (error) {
        message.error('导出 PDF 失败');
      }
      return;
    }

    try {
      const response = await request.get(`/resumes/${id}/export`, {
        params: { format },
        responseType: 'blob',
      });

      const blob = new Blob([response as any], { type: 'text/markdown' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `简历分析报告_${resume.candidate_name || '候选人'}_${resume.id}.md`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch (error) {
      message.error(getApiErrorMessage(error, '导出失败'));
    }
  };

  if (loading || !resume) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '70vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  const parsedData = resume.parsed_data || {};
  const fileUrl = resume.file_path ? (resume.file_path.startsWith('/') ? resume.file_path : `/${resume.file_path}`) : '';
  const isPdf = fileUrl.toLowerCase().endsWith('.pdf');
  const pdfPreviewUrl = isPdf ? getMaximizedPdfPreviewUrl(fileUrl) : '';
  const status = statusInfo(resume.parse_status);
  const workExperiences = asArray(parsedData.work_experiences);
  const projectExperiences = asArray(parsedData.project_experiences);
  const interviewQuestions = asArray(parsedData.interview_questions);
  const businessQuestions = asArray(parsedData.business_model_questions);
  const completionQuestions = asArray(parsedData.experience_completion_questions);
  const canExportReport = resume.parse_status === 'success' && (resume.ai_review || Object.keys(parsedData).length > 0);
  const exportItems: MenuProps['items'] = [
    {
      key: 'markdown',
      label: '导出 Markdown',
      icon: <FileMarkdownOutlined />,
      onClick: () => handleExport('markdown'),
    },
    {
      key: 'pdf',
      label: '导出 PDF',
      icon: <FilePdfOutlined />,
      onClick: () => handleExport('pdf'),
    },
  ];

  return (
    <div className="resume-detail-page">
      <div className="resume-detail-toolbar">
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/resumes')}>返回</Button>
            <Tag color={status.color}>{status.text}</Tag>
          </Space>
          <Space>
            {isEditing ? (
              <>
                <Button type="primary" icon={<SaveOutlined />} onClick={handleUpdate}>保存</Button>
                <Button onClick={() => setIsEditing(false)}>取消</Button>
              </>
            ) : (
              <>
                <Dropdown menu={{ items: exportItems }} disabled={!canExportReport}>
                  <Button icon={<FilePdfOutlined />} disabled={!canExportReport}>
                    导出报告 <DownOutlined />
                  </Button>
                </Dropdown>
                <Button icon={<ReloadOutlined />} onClick={handleReparse} disabled={resume.parse_status === 'processing'}>重新分析</Button>
                <Button icon={<EditOutlined />} onClick={() => setIsEditing(true)}>编辑信息</Button>
              </>
            )}
          </Space>
        </Space>
      </div>

      <div className="resume-detail-shell">
        <Card className="resume-preview-pane" styles={{ body: { padding: 0 } }}>
          <div className="resume-preview-head">
            <div>
              <Text type="secondary">原始简历</Text>
              <Title level={5}>{resume.candidate_name || '未识别候选人'}</Title>
            </div>
            <FilePdfOutlined />
          </div>
          <div className="resume-preview-body">
            {isPdf && pdfPreviewUrl ? (
              <iframe title="resume-preview" src={pdfPreviewUrl} />
            ) : (
              <div className="resume-preview-empty">
                <FilePdfOutlined />
                <Text type="secondary">暂无可预览文件</Text>
              </div>
            )}
          </div>
        </Card>

        <div className="resume-analysis-pane" id="resume-analysis-report-content">
          <Card className="resume-profile-card" style={{ marginBottom: 16 }}>
            <div className="resume-profile-hero">
              <Space align="start" style={{ justifyContent: 'space-between', width: '100%' }}>
                <div>
                  <Text type="secondary">候选人</Text>
                  <Title level={2} style={{ margin: 0 }}>{resume.candidate_name || '未识别'}</Title>
                  <Text type="secondary">{resume.email || resume.contact || '暂无联系方式'}</Text>
                </div>
                {resume.match_score != null && (
                  <Progress
                    type="circle"
                    percent={resume.match_score}
                    size={72}
                    strokeColor={resume.match_score >= 80 ? '#059669' : resume.match_score >= 60 ? '#D97706' : '#DC2626'}
                    format={() => resume.match_score}
                  />
                )}
              </Space>
            </div>

            {isEditing ? (
              <Form form={form} layout="vertical">
                <Form.Item label="姓名" name="candidate_name">
                  <Input />
                </Form.Item>
                <Form.Item label="邮箱" name="email">
                  <Input />
                </Form.Item>
                <Form.Item label="联系方式" name="contact">
                  <Input />
                </Form.Item>
              </Form>
            ) : (
              <Descriptions column={1} size="small">
                <Descriptions.Item label="工作年限">{parsedData.years_of_experience ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="最近公司">{parsedData.recent_company || '-'}</Descriptions.Item>
                <Descriptions.Item label="学历">{parsedData.highest_degree || '-'}</Descriptions.Item>
                <Descriptions.Item label="学校">{parsedData.school || '-'}</Descriptions.Item>
              </Descriptions>
            )}
          </Card>

          {resume.parse_status === 'failed' && (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
              title="模型分析失败"
              description={resume.parse_error || '请检查模型配置后重新分析'}
            />
          )}

          <Card title="综合分析" style={{ marginBottom: 16 }}>
            {resume.ai_review ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{resume.ai_review}</ReactMarkdown>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无分析结果" />
            )}
          </Card>

          <Card title="工作经历" style={{ marginBottom: 16 }}>
            {workExperiences.length ? (
              <List
                dataSource={workExperiences}
                renderItem={(item: any) => (
                  <List.Item>
                    <List.Item.Meta
                      title={<Space><span>{item.company || '未命名公司'}</span><Tag>{item.role || '角色未明'}</Tag></Space>}
                      description={
                        <Space direction="vertical" size={4}>
                          {item.period && <Text type="secondary">{item.period}</Text>}
                          <Paragraph>{item.summary}</Paragraph>
                          {asArray(item.capabilities).length > 0 && (
                            <Space wrap>{asArray(item.capabilities).map((capability: string) => <Tag key={capability}>{capability}</Tag>)}</Space>
                          )}
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无工作经历" />
            )}
          </Card>

          <Card title="项目经历与商业模式" style={{ marginBottom: 16 }}>
            {projectExperiences.length ? (
              <List
                dataSource={projectExperiences}
                renderItem={(item: any) => (
                  <List.Item>
                    <List.Item.Meta
                      title={item.name || '未命名项目'}
                      description={
                        <Space direction="vertical" size={6}>
                          {item.role && <Text type="secondary">角色：{item.role}</Text>}
                          {item.problem && <Text>问题：{item.problem}</Text>}
                          {item.solution && <Text>方案：{item.solution}</Text>}
                          {item.business_model && <Text>商业模式：{item.business_model}</Text>}
                          {asArray(item.missing_evidence).length > 0 && (
                            <Space wrap>
                              {asArray(item.missing_evidence).map((evidence: string) => <Tag color="warning" key={evidence}>{evidence}</Tag>)}
                            </Space>
                          )}
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无项目经历" />
            )}
          </Card>

          <Row gutter={16}>
            <Col span={24}>
              <QuestionList title="针对经历的面试追问" data={interviewQuestions} />
            </Col>
            <Col span={24}>
              <QuestionList title="商业模式解释问题" data={businessQuestions} />
            </Col>
            <Col span={24}>
              <QuestionList title="经历补全问题" data={completionQuestions} />
            </Col>
          </Row>
        </div>
      </div>
    </div>
  );
};

export default ResumeDetail;
