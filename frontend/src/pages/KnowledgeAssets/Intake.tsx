import React, { useState } from 'react';
import { App, Button, Card, Form, Input, Select, Space, Typography, Upload } from 'antd';
import { ArrowLeftOutlined, DatabaseOutlined, InboxOutlined, SaveOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import request, { getApiErrorMessage } from '../../utils/request';
import { useKnowledgeAssetsStore } from '../../store/useKnowledgeAssetsStore';
import '../BusinessWorkbench.css';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Dragger } = Upload;

type IntakeFormValues = {
  title: string;
  source_type?: string;
  source_name?: string;
  source_url?: string;
  source_file_path?: string;
  source_confidentiality?: string;
  raw_text: string;
  industry_tags?: string[];
  business_topic_tags?: string[];
  scenario_tags?: string[];
  evidence_type_tags?: string[];
  capability_tags?: string[];
  methodology_tags?: string[];
  customer_type_tags?: string[];
  value_tags?: string[];
};

const sourceTypeOptions = [
  { value: 'manual_note', label: '人工资料' },
  { value: 'company_case', label: '案例资料' },
  { value: 'official_document', label: '官方资料' },
  { value: 'official_database', label: '官方数据库' },
  { value: 'third_party_data', label: '三方数据' },
  { value: 'competitor_product', label: '竞品资料' },
  { value: 'open_source_project', label: '开源项目' },
  { value: 'commercial_product', label: '商业产品' },
  { value: 'sop', label: 'SOP/方法论' },
];

const confidentialityOptions = [
  { value: 'internal', label: '内部' },
  { value: 'anonymized', label: '匿名化' },
  { value: 'public', label: '公开' },
  { value: 'restricted', label: '受限' },
];

const tagFieldProps = {
  mode: 'tags' as const,
  tokenSeparators: [',', '，', ';', '；', '、'],
  allowClear: true,
};

const normalizeList = (value?: string[]) => (Array.isArray(value) ? value.filter(Boolean) : []);

const KnowledgeAssetIntakePage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm<IntakeFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [fileList, setFileList] = useState<any[]>([]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (!fileList.length && !values.raw_text?.trim()) {
      message.error('请上传资料文件或粘贴资料正文');
      return;
    }
    setSubmitting(true);
    try {
      if (fileList.length) {
        const formData = new FormData();
        formData.append('file', fileList[0]);
        formData.append('title', values.title);
        formData.append('source_type', values.source_type || 'manual_note');
        formData.append('source_confidentiality', values.source_confidentiality || 'internal');
        if (values.source_name) formData.append('source_name', values.source_name);
        if (values.source_url) formData.append('source_url', values.source_url);
        if (values.industry_tags?.length) formData.append('industry_tags', normalizeList(values.industry_tags).join(','));
        if (values.business_topic_tags?.length) formData.append('business_topic_tags', normalizeList(values.business_topic_tags).join(','));
        if (values.scenario_tags?.length) formData.append('scenario_tags', normalizeList(values.scenario_tags).join(','));
        if (values.evidence_type_tags?.length) formData.append('evidence_type_tags', normalizeList(values.evidence_type_tags).join(','));
        if (values.capability_tags?.length) formData.append('capability_tags', normalizeList(values.capability_tags).join(','));
        if (values.methodology_tags?.length) formData.append('methodology_tags', normalizeList(values.methodology_tags).join(','));
        if (values.customer_type_tags?.length) formData.append('customer_type_tags', normalizeList(values.customer_type_tags).join(','));
        if (values.value_tags?.length) formData.append('value_tags', normalizeList(values.value_tags).join(','));
        await request.post('/knowledge-assets/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120000,
        });
      } else {
        await request.post('/knowledge-assets/intake', {
          title: values.title,
          source_type: values.source_type || 'manual_note',
          source_name: values.source_name,
          source_url: values.source_url,
          source_file_path: values.source_file_path,
          source_confidentiality: values.source_confidentiality || 'internal',
          raw_text: values.raw_text,
          industry_tags: normalizeList(values.industry_tags),
          business_topic_tags: normalizeList(values.business_topic_tags),
          scenario_tags: normalizeList(values.scenario_tags),
          evidence_type_tags: normalizeList(values.evidence_type_tags),
          capability_tags: normalizeList(values.capability_tags),
          methodology_tags: normalizeList(values.methodology_tags),
          customer_type_tags: normalizeList(values.customer_type_tags),
          value_tags: normalizeList(values.value_tags),
        });
      }
      useKnowledgeAssetsStore.getState().invalidateCache();
      message.success('知识资产已入库');
      navigate('/knowledge-assets');
    } catch (error) {
      message.error(getApiErrorMessage(error, '知识资产入库失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const uploadProps = {
    beforeUpload: (file: any) => {
      const allowed = /\.(pdf|docx|txt|md|markdown)$/i.test(file.name || '');
      if (!allowed) {
        message.error('仅支持 PDF、DOCX、TXT、Markdown 资料');
        return Upload.LIST_IGNORE;
      }
      setFileList([file]);
      return false;
    },
    onRemove: () => {
      setFileList([]);
    },
    fileList,
    maxCount: 1,
    accept: '.pdf,.docx,.txt,.md,.markdown',
  };

  return (
    <div className="knowledge-assets-page workbench-page">
      <section className="workbench-module-hero">
        <div className="workbench-module-copy">
          <Button className="dossier-back" type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/knowledge-assets')} />
          <span className="module-eyebrow"><DatabaseOutlined /> 资料入库</span>
          <Title level={2}>资料入库</Title>
          <Text type="secondary">把案例、数据源、方法论和内部纪要归档成可复核、可引用的知识资产。</Text>
        </div>
        <Space wrap className="workbench-module-actions">
          <Button onClick={() => navigate('/knowledge-assets')}>取消</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>
            保存入库
          </Button>
        </Space>
        <div className="workbench-module-steps" aria-label="资料入库工作步骤">
          <span><strong>01</strong> 上传或粘贴</span>
          <span><strong>02</strong> 自动切片</span>
          <span><strong>03</strong> 标签评分</span>
          <span><strong>04</strong> 方案引用</span>
        </div>
      </section>

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          source_type: 'manual_note',
          source_confidentiality: 'internal',
          evidence_type_tags: ['待验证线索'],
        }}
      >
        <div className="knowledge-intake-grid">
          <Card className="consulting-table-card" title="基础资料">
            <Form.Item label="标题" name="title" rules={[{ required: true, message: '请输入标题' }]}>
              <Input placeholder="例如：工程咨询公司招投标资料平台案例" />
            </Form.Item>
            <Form.Item label="资料文件">
              <Dragger {...uploadProps}>
                <p className="ant-upload-drag-icon">
                  <InboxOutlined />
                </p>
                <p className="ant-upload-text">拖拽 PDF、DOCX、TXT 或 Markdown 到这里</p>
                <p className="ant-upload-hint">
                  <Text type="secondary">上传后会自动抽取正文并按片段进入知识资产库</Text>
                </p>
              </Dragger>
            </Form.Item>
            <Form.Item label="资料正文" name="raw_text" extra="没有文件时可以直接粘贴正文；有文件时正文可留空。">
              <TextArea rows={10} placeholder="粘贴案例、官方资料、三方数据摘要、竞品分析、开源项目说明或内部访谈纪要" />
            </Form.Item>
          </Card>

          <Card className="consulting-table-card" title="来源与标签">
            <div className="knowledge-source-grid">
              <Form.Item label="来源类型" name="source_type">
                <Select options={sourceTypeOptions} />
              </Form.Item>
              <Form.Item label="保密级别" name="source_confidentiality">
                <Select options={confidentialityOptions} />
              </Form.Item>
            </div>
            <Form.Item label="来源名称" name="source_name">
              <Input placeholder="例如：内部访谈、某官方数据库、GitHub 项目" />
            </Form.Item>
            <Form.Item label="来源链接" name="source_url">
              <Input placeholder="https://example.com/source" />
            </Form.Item>
            <Form.Item label="本地文件路径" name="source_file_path">
              <Input placeholder="uploads/knowledge/..." />
            </Form.Item>

            <div className="knowledge-tag-form-grid">
              <Form.Item label="行业标签" name="industry_tags">
                <Select {...tagFieldProps} placeholder="工程建设、旅游文娱、计算机/AI" />
              </Form.Item>
              <Form.Item label="业务主题" name="business_topic_tags">
                <Select {...tagFieldProps} placeholder="招投标、人员资质库、AI影视" />
              </Form.Item>
              <Form.Item label="场景标签" name="scenario_tags">
                <Select {...tagFieldProps} placeholder="客户增长、流程自动化、资料管理" />
              </Form.Item>
              <Form.Item label="证据类型" name="evidence_type_tags">
                <Select {...tagFieldProps} placeholder="真实项目经验、官方资料、三方数据" />
              </Form.Item>
              <Form.Item label="能力标签" name="capability_tags">
                <Select {...tagFieldProps} placeholder="系统建设、内容运营、数据分析" />
              </Form.Item>
              <Form.Item label="方法论标签" name="methodology_tags">
                <Select {...tagFieldProps} placeholder="SOP、PRD、竞品对标" />
              </Form.Item>
              <Form.Item label="客户类型" name="customer_type_tags">
                <Select {...tagFieldProps} placeholder="工程咨询公司、影视公司、中小企业" />
              </Form.Item>
              <Form.Item label="可用价值" name="value_tags">
                <Select {...tagFieldProps} placeholder="验证可行性、提供模块参考、可复用流程" />
              </Form.Item>
            </div>
          </Card>
        </div>
      </Form>

      <Card className="knowledge-intake-side-note">
        <Space>
          <DatabaseOutlined />
          <Text>保存后系统会生成基础标签、证据评分和资料片段，方案 Agent 会从这里检索证据。</Text>
        </Space>
      </Card>
    </div>
  );
};

export default KnowledgeAssetIntakePage;
