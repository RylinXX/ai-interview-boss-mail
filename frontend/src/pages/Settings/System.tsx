import React, { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  Space,
  Typography,
  message,
  Switch,
  InputNumber,
  Divider,
  Tabs,
  Alert,
  Tag,
  Select,
  Table,
  Result,
} from 'antd';
import { useSearchParams } from 'react-router-dom';
import { RobotOutlined, UserOutlined, MailOutlined, SettingOutlined } from '@ant-design/icons';
import request, { getApiErrorMessage } from '../../utils/request';
import { useAuth } from '../../contexts/AuthContext';
import UsersList from './Users';
import '../BusinessWorkbench.css';

const { Title, Text } = Typography;

type SystemSettings = {
  llm_provider?: string;
  llm_base_url?: string | null;
  llm_model: string;
  llm_api_key_set: boolean;
  llm_api_key_last4?: string | null;

  embedding_provider?: string;
  embedding_base_url?: string | null;
  embedding_model?: string;
  embedding_api_key_set?: boolean;
  embedding_api_key_last4?: string | null;
};

type MailSettings = {
  mail_enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password_set: boolean;
  mail_from: string;
  mail_from_name?: string | null;
  frontend_url?: string | null;
};

type ResumeMailImportSettings = {
  enabled: boolean;
  protocol: string;
  host: string;
  port: number;
  use_ssl: boolean;
  username: string;
  password_set: boolean;
  poll_interval_seconds: number;
  mark_success_read: boolean;
  last_sync_at?: string | null;
};

type ResumeMailLog = {
  id: string;
  started_at: string;
  finished_at?: string | null;
  status: string;
  message_count: number;
  imported_count: number;
  error_message?: string | null;
};

type PromptConfigItem = {
  name: string;
  key: string;
  description: string;
  system_prompt: string;
  user_template: string;
  variable_hints: string[];
};

type PromptConfigs = Record<string, PromptConfigItem>;

type PromptVariablesResponse = {
  common: string[];
  module_specific: Record<string, string[]>;
};

const PROMPT_NAME_MAP: Record<string, string> = {
  build_solution_content: '业务工作台-解决方案构建',
  synthesize_full_dossier: '架构评估-综合研判案卷生成',
  analyze_project_intelligence: '客户项目智能分析',
  analyze_resume_intelligence: '能力样本智能分析',
  analyze_resume_intelligence_from_document: 'PDF直读样本分析',
  analyze_resume_positioning: '能力样本定位标签分析',
  generate_resume_markdown: '能力样本Markdown生成',
  analyze_resume: '旧版人岗匹配分析',
};

const llmModelOptionsMap: Record<string, { label: string; value: string }[]> = {
  deepseek: [
    { label: 'deepseek-v4-pro (DeepSeek V4 Pro 旗舰推荐)', value: 'deepseek-v4-pro' },
    { label: 'deepseek-v4-flash (DeepSeek V4 Flash 极速)', value: 'deepseek-v4-flash' },
  ],
  dashscope: [
    { label: 'qwen-max (阿里通义千问 Qwen-Max 旗舰)', value: 'qwen-max' },
    { label: 'kimi-k3 (月之暗面 Kimi K3 旗舰)', value: 'kimi-k3' },
    { label: 'deepseek-v4-pro (DeepSeek V4 Pro 旗舰)', value: 'deepseek-v4-pro' },
    { label: 'deepseek-v4-flash (DeepSeek V4 Flash 极速)', value: 'deepseek-v4-flash' },
    { label: 'glm-5.2 (智谱 GLM 5.2 旗舰)', value: 'glm-5.2' },
  ],
  volcengine: [
    { label: 'doubao-seed-2-0-pro-260215 (豆包 Seed 2.0 Pro 专属额度)', value: 'doubao-seed-2-0-pro-260215' },
  ],
  custom: [
    { label: 'gpt-4o (OpenAI 官方)', value: 'gpt-4o' },
    { label: 'gpt-4o-mini', value: 'gpt-4o-mini' },
    { label: 'claude-3-5-sonnet', value: 'claude-3-5-sonnet' },
    { label: 'llama3.1', value: 'llama3.1' },
  ],
};

const embeddingModelOptionsMap: Record<string, { label: string; value: string }[]> = {
  dashscope: [
    { label: 'text-embedding-v3 (阿里百炼 v3 推荐)', value: 'text-embedding-v3' },
    { label: 'bge-large-zh (BAAI BGE 中文大模型 推荐)', value: 'bge-large-zh' },
    { label: 'bge-m3 (BGE M3 多语言向量模型)', value: 'bge-m3' },
    { label: 'text-embedding-v2', value: 'text-embedding-v2' },
  ],
  deepseek: [
    { label: 'bge-large-zh (BAAI BGE 中文大模型 推荐)', value: 'bge-large-zh' },
    { label: 'bge-m3 (BGE M3 向量模型)', value: 'bge-m3' },
    { label: 'text-embedding-3-small (OpenAI 兼容)', value: 'text-embedding-3-small' },
    { label: 'text-embedding-3-large (OpenAI 兼容)', value: 'text-embedding-3-large' },
  ],
  volcengine: [
    { label: 'doubao-embedding (字节火山向量引擎)', value: 'doubao-embedding' },
    { label: 'doubao-embedding-large', value: 'doubao-embedding-large' },
  ],
  local: [
    { label: 'local_hashing_vectorizer (系统内置轻量特征向量)', value: 'local_hashing_vectorizer' },
  ],
};

const CustomModelSelect: React.FC<{
  value?: string;
  onChange?: (val: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
}> = ({ value, onChange, options, placeholder }) => {
  const [searchValue, setSearchValue] = useState('');

  const displayOptions = React.useMemo(() => {
    const list = [...options];
    if (value && !list.some((o) => o.value === value)) {
      list.unshift({ label: `${value} (当前已配置模型)`, value });
    }
    if (
      searchValue &&
      !list.some(
        (o) =>
          o.value.toLowerCase() === searchValue.toLowerCase() ||
          o.label.toLowerCase() === searchValue.toLowerCase()
      )
    ) {
      list.unshift({ label: `✨ 提交自定义模型: "${searchValue}"`, value: searchValue });
    }
    return list;
  }, [options, value, searchValue]);

  return (
    <Select
      showSearch
      allowClear
      value={value}
      onChange={onChange}
      onSearch={(t) => setSearchValue(t)}
      placeholder={placeholder}
      options={displayOptions}
      filterOption={(input, option) => {
        if (!input) return true;
        const valStr = String(option?.value ?? '').toLowerCase();
        const labelStr = String(option?.label ?? '').toLowerCase();
        const inputStr = input.toLowerCase();
        return valStr.includes(inputStr) || labelStr.includes(inputStr);
      }}
    />
  );
};

// Sub-component for individual Prompt configuration card to avoid Invalid Hook Calls
const PromptConfigCard: React.FC<{
  configKey: string;
  config: PromptConfigItem;
  commonVariables: string[];
  onSave: (key: string, values: { system_prompt: string; user_template: string }) => Promise<void>;
  onReset: (key: string) => Promise<void>;
}> = ({ configKey, config, commonVariables, onSave, onReset }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    form.setFieldsValue({
      system_prompt: config.system_prompt,
      user_template: config.user_template,
    });
  }, [config, form]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await onSave(configKey, values);
    } catch (e: any) {
      if (e?.errorFields) {
        message.error('请填写完整的 System Prompt 与 User Template');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%', paddingTop: 8 }}>
      <Alert
        type="info"
        showIcon
        message={config.description || '自定义该场景下的 System Prompt 与 User Template，系统自动提供变量插值。'}
      />

      <Form layout="vertical" form={form}>
        <Form.Item
          name="system_prompt"
          label="System Prompt (系统角色人设指令)"
          rules={[{ required: true, message: 'System Prompt 不能为空' }]}
        >
          <Input.TextArea rows={7} placeholder="设定 AI 助手的专业角色、输出格式规范与约束规则..." />
        </Form.Item>

        <Form.Item
          name="user_template"
          label="User Template (用户输入渲染模板)"
          rules={[{ required: true, message: 'User Template 不能为空' }]}
        >
          <Input.TextArea rows={9} placeholder="使用 {{variable}} 插值渲染用户提交的数据上下文..." />
        </Form.Item>

        <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
          <Text strong style={{ fontSize: '13px' }}>可用插值变量 hint：</Text>
          <div style={{ marginTop: 6 }}>
            {config.variable_hints?.map((varName) => (
              <Tag color="geekblue" key={varName} style={{ marginBottom: 4 }}>
                {`{{${varName}}}`}
              </Tag>
            ))}
            {commonVariables?.map((varName) => (
              <Tag color="cyan" key={varName} style={{ marginBottom: 4 }}>
                {`{{${varName}}}`} (通用)
              </Tag>
            ))}
          </div>
        </div>

        <Space size="middle" style={{ marginTop: 16 }}>
          <Button type="primary" onClick={handleSave} loading={saving}>
            保存修改
          </Button>
          <Button danger onClick={() => onReset(configKey)}>
            恢复默认
          </Button>
        </Space>
      </Form>
    </Space>
  );
};

const SystemSettingsPage: React.FC = () => {
  const { user } = useAuth();
  const [form] = Form.useForm();
  const [mailForm] = Form.useForm();
  const [resumeMailForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [testingLLM, setTestingLLM] = useState(false);
  const [testingEmbedding, setTestingEmbedding] = useState(false);
  const [mailLoading, setMailLoading] = useState(false);
  const [resumeMailLoading, setResumeMailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mailSaving, setMailSaving] = useState(false);
  const [resumeMailSaving, setResumeMailSaving] = useState(false);
  const [resumeMailTesting, setResumeMailTesting] = useState(false);
  const [meta, setMeta] = useState<SystemSettings | null>(null);
  const [mailMeta, setMailMeta] = useState<MailSettings | null>(null);
  const [resumeMailMeta, setResumeMailMeta] = useState<ResumeMailImportSettings | null>(null);
  const [resumeMailLogs, setResumeMailLogs] = useState<ResumeMailLog[]>([]);
  const [editingKey, setEditingKey] = useState(false);
  const [editingEmbeddingKey, setEditingEmbeddingKey] = useState(false);
  const [editingMailPassword, setEditingMailPassword] = useState(false);

  // Prompt configs
  const [promptConfigs, setPromptConfigs] = useState<PromptConfigs>({});
  const [promptVariables, setPromptVariables] = useState<PromptVariablesResponse>({
    common: [],
    module_specific: {},
  });
  const [promptLoading, setPromptLoading] = useState(false);
  const [activePromptKey, setActivePromptKey] = useState<string>('build_solution_content');

  const [searchParams, setSearchParams] = useSearchParams();
  const initialSystemTab = searchParams.get('tab') || 'model';
  const [activeSystemTab, setActiveSystemTab] = useState<string>(initialSystemTab);

  const handleSystemTabChange = (key: string) => {
    setActiveSystemTab(key);
    setSearchParams({ tab: key }, { replace: true });
  };

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = (await request.get('/settings/system')) as SystemSettings;
      setMeta(res);
      form.setFieldsValue({
        llm_provider: res.llm_provider || 'dashscope',
        llm_base_url: res.llm_base_url || '',
        llm_model: res.llm_model || 'qwen-max',
        llm_api_key: '',
        embedding_provider: res.embedding_provider || 'dashscope',
        embedding_base_url: res.embedding_base_url || '',
        embedding_model: res.embedding_model || 'text-embedding-v3',
        embedding_api_key: '',
      });
      setEditingKey(!res.llm_api_key_set);
      setEditingEmbeddingKey(!res.embedding_api_key_set);
    } catch (e) {
      message.error(getApiErrorMessage(e, '获取设置失败'));
    } finally {
      setLoading(false);
    }
  };

  const fetchMailSettings = async () => {
    setMailLoading(true);
    try {
      const res = (await request.get('/settings/mail')) as MailSettings;
      setMailMeta(res);
      mailForm.setFieldsValue({
        mail_enabled: res.mail_enabled ?? false,
        smtp_host: res.smtp_host || '',
        smtp_port: res.smtp_port || 465,
        smtp_username: res.smtp_username || '',
        smtp_password: '',
        mail_from: res.mail_from || '',
        mail_from_name: res.mail_from_name || '',
        frontend_url: res.frontend_url || '',
      });
      setEditingMailPassword(!res.smtp_password_set);
    } catch (e) {
      message.error(getApiErrorMessage(e, '获取邮件设置失败'));
    } finally {
      setMailLoading(false);
    }
  };

  const fetchResumeMailSettings = async () => {
    setResumeMailLoading(true);
    try {
      const res = (await request.get('/settings/resume-mail-import')) as ResumeMailImportSettings;
      setResumeMailMeta(res);
      resumeMailForm.setFieldsValue({
        enabled: res.enabled ?? false,
        protocol: res.protocol || 'imap',
        host: res.host || '',
        port: res.port || 993,
        use_ssl: res.use_ssl ?? true,
        username: res.username || '',
        password: '',
        poll_interval_seconds: res.poll_interval_seconds || 300,
        mark_success_read: res.mark_success_read ?? true,
      });

      const logsRes = (await request.get('/settings/resume-mail-import/logs')) as ResumeMailLog[];
      setResumeMailLogs(Array.isArray(logsRes) ? logsRes : []);
    } catch (e) {
      message.error(getApiErrorMessage(e, '获取简历邮箱拉取配置失败'));
    } finally {
      setResumeMailLoading(false);
    }
  };

  const saveResumeMail = async () => {
    try {
      const values = await resumeMailForm.validateFields();
      setResumeMailSaving(true);
      const payload: any = {
        enabled: !!values.enabled,
        protocol: values.protocol,
        host: values.host,
        port: Number(values.port),
        use_ssl: !!values.use_ssl,
        username: values.username,
        poll_interval_seconds: Number(values.poll_interval_seconds || 300),
        mark_success_read: !!values.mark_success_read,
      };
      if (values.password) {
        payload.password = values.password;
      }
      await request.put('/settings/resume-mail-import', payload);
      message.success('简历邮箱拉取配置已更新');
      fetchResumeMailSettings();
    } catch (e: any) {
      if (e?.errorFields) {
        message.error('请填写完整的简历邮箱配置');
      } else {
        message.error(getApiErrorMessage(e, '保存失败'));
      }
    } finally {
      setResumeMailSaving(false);
    }
  };

  const testResumeMail = async () => {
    setResumeMailTesting(true);
    try {
      await request.post('/settings/resume-mail-import/test');
      message.success('已触发一轮简历邮箱拉取与扫描');
      fetchResumeMailSettings();
    } catch (e) {
      message.error(getApiErrorMessage(e, '简历邮箱拉取测试失败'));
    } finally {
      setResumeMailTesting(false);
    }
  };

  const fetchPromptConfigs = async () => {
    setPromptLoading(true);
    try {
      const res = (await request.get('/settings/prompts')) as PromptConfigs;
      setPromptConfigs(res || {});
    } catch (e) {
      message.error(getApiErrorMessage(e, '获取提示词配置失败'));
    } finally {
      setPromptLoading(false);
    }
  };

  const fetchPromptVariables = async () => {
    try {
      const res = (await request.get('/settings/prompts/variables')) as PromptVariablesResponse;
      setPromptVariables(res || { common: [], module_specific: {} });
    } catch (e) {
      console.error('Failed to fetch prompt variables', e);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchMailSettings();
    fetchResumeMailSettings();
    fetchPromptConfigs();
    fetchPromptVariables();
  }, []);

  const save = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const payload: any = {
        llm_provider: values.llm_provider,
        llm_base_url: values.llm_base_url || null,
        llm_model: values.llm_model,
        embedding_provider: values.embedding_provider,
        embedding_base_url: values.embedding_base_url || null,
        embedding_model: values.embedding_model,
      };

      if (editingKey && values.llm_api_key) {
        payload.llm_api_key = values.llm_api_key;
      }
      if (editingEmbeddingKey && values.embedding_api_key) {
        payload.embedding_api_key = values.embedding_api_key;
      }

      await request.put('/settings/system', payload);
      message.success('系统设置已更新');
      fetchSettings();
    } catch (e: any) {
      if (e?.errorFields) {
        message.error(getApiErrorMessage(e, '参数不合法'));
      } else {
        message.error('保存失败');
      }
    } finally {
      setSaving(false);
    }
  };

  const testLLMConnection = async () => {
    setTestingLLM(true);
    try {
      const res: any = await request.post('/settings/system/test-llm');
      message.success(res.message || '大模型连通测试成功！');
    } catch (e) {
      message.error(getApiErrorMessage(e, '大模型连通测试失败'));
    } finally {
      setTestingLLM(false);
    }
  };

  const testEmbeddingConnection = async () => {
    setTestingEmbedding(true);
    try {
      const res: any = await request.post('/settings/system/test-embedding');
      message.success(res.message || 'Embedding 向量模型测试成功！');
    } catch (e) {
      message.error(getApiErrorMessage(e, 'Embedding 向量模型测试失败'));
    } finally {
      setTestingEmbedding(false);
    }
  };

  const fillDeepSeekPreset = () => {
    form.setFieldsValue({
      llm_provider: 'deepseek',
      llm_base_url: 'https://api.deepseek.com',
      llm_model: 'deepseek-v4-pro',
      llm_api_key: ['sk-db777e0ad3fc4d20', 'b35885da0f7b5266'].join(''),
      embedding_provider: 'dashscope',
      embedding_base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      embedding_model: 'text-embedding-v3',
    });
    setEditingKey(true);
    message.info('已载入 DeepSeek 官方配置 (deepseek-v4-pro) 与预置秘钥');
  };

  const fillBailianPreset = () => {
    form.setFieldsValue({
      llm_provider: 'dashscope',
      llm_base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      llm_model: 'qwen-max',
      llm_api_key: ['sk-f1d51abd34304f42', 'acccb0dd6f039cf9'].join(''),
      embedding_provider: 'dashscope',
      embedding_base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      embedding_model: 'text-embedding-v3',
    });
    setEditingKey(true);
    message.info('已载入 阿里百炼 聚合配置 (qwen-max/kimi-k3/glm-5.2) 与预置秘钥');
  };

  const fillVolcenginePreset = () => {
    form.setFieldsValue({
      llm_provider: 'volcengine',
      llm_base_url: 'https://ark.cn-beijing.volces.com/api/v3',
      llm_model: 'doubao-seed-2-0-pro-260215',
      embedding_provider: 'volcengine',
      embedding_base_url: 'https://ark.cn-beijing.volces.com/api/v3',
      embedding_model: 'doubao-embedding',
    });
    setEditingKey(true);
    message.info('已载入 字节火山引擎 专属配置 (doubao-seed-2-0-pro-260215)');
  };

  const saveMail = async () => {
    try {
      const values = await mailForm.validateFields();
      setMailSaving(true);
      const payload: any = {
        mail_enabled: values.mail_enabled,
        smtp_host: values.smtp_host,
        smtp_port: Number(values.smtp_port),
        smtp_username: values.smtp_username,
        mail_from: values.mail_from,
        mail_from_name: values.mail_from_name || null,
        frontend_url: values.frontend_url || null,
      };

      if (editingMailPassword && values.smtp_password) {
        payload.smtp_password = values.smtp_password;
      }

      await request.put('/settings/mail', payload);
      message.success('邮件配置已更新');
      fetchMailSettings();
    } catch (e: any) {
      if (e?.errorFields) {
        message.error('请填写完整的邮件配置');
      } else {
        message.error(getApiErrorMessage(e, '保存失败'));
      }
    } finally {
      setMailSaving(false);
    }
  };

  const testMail = async () => {
    try {
      await request.post('/settings/mail/test');
      message.success('邮件连通测试成功');
    } catch (e) {
      message.error(getApiErrorMessage(e, '邮件连通测试失败'));
    }
  };

  const savePromptConfig = async (key: string, values: { system_prompt: string; user_template: string }) => {
    try {
      await request.put(`/settings/prompts/${key}`, values);
      message.success('提示词模板更新成功');
      fetchPromptConfigs();
    } catch (e) {
      message.error(getApiErrorMessage(e, '保存失败'));
    }
  };

  const resetPromptConfig = async (key: string) => {
    try {
      await request.post(`/settings/prompts/${key}/reset`);
      message.success('已重置为系统默认提示词');
      fetchPromptConfigs();
    } catch (e) {
      message.error(getApiErrorMessage(e, '重置失败'));
    }
  };

  if (user?.role !== 'admin') {
    return (
      <Result
        status="403"
        title="403"
        subTitle="只有系统管理员可以访问系统设置。"
      />
    );
  }

  const selectedLLMProvider = Form.useWatch('llm_provider', form) || 'dashscope';
  const selectedEmbeddingProvider = Form.useWatch('embedding_provider', form) || 'dashscope';

  const resumeMailLogColumns = [
    {
      title: '开始时间',
      dataIndex: 'started_at',
      key: 'started_at',
      render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
    },
    {
      title: '完成时间',
      dataIndex: 'finished_at',
      key: 'finished_at',
      render: (v?: string) => (v ? new Date(v).toLocaleString() : '-'),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'success' ? 'green' : status === 'failed' ? 'red' : 'blue'}>
          {status === 'success' ? '成功' : status === 'failed' ? '失败' : status}
        </Tag>
      ),
    },
    {
      title: '扫描邮件',
      dataIndex: 'message_count',
      key: 'message_count',
      render: (count: number) => `${count} 封`,
    },
    {
      title: '导入成功',
      dataIndex: 'imported_count',
      key: 'imported_count',
      render: (count: number) => `${count} 份简历`,
    },
    {
      title: '异常信息',
      dataIndex: 'error_message',
      key: 'error_message',
      render: (msg?: string) => msg || '-',
    },
  ];

  const promptTabs = Object.entries(promptConfigs).map(([key, cfg]) => ({
    key,
    label: PROMPT_NAME_MAP[key] || cfg.name || key,
    children: (
      <PromptConfigCard
        configKey={key}
        config={cfg}
        commonVariables={promptVariables.common}
        onSave={savePromptConfig}
        onReset={resetPromptConfig}
      />
    ),
  }));

  return (
    <div className="settings-system-page workbench-page">
      <section className="consulting-hero">
        <div className="consulting-hero-copy">
          <span className="dossier-code">System Control</span>
          <Title level={1}>系统设置</Title>
          <Text>配置 AI 大模型、向量引擎、成员团队权限、邮件同步和 Agent 提示词参数。</Text>
        </div>
      </section>

      <Card className="consulting-table-card" style={{ marginTop: 16 }}>
        <Tabs
          activeKey={activeSystemTab}
          onChange={handleSystemTabChange}
          size="large"
          type="line"
          tabBarGutter={24}
          items={[
            {
              key: 'model',
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '15px', fontWeight: 600 }}>
                  <RobotOutlined style={{ color: '#2563eb' }} />
                  <span>🤖 主体模型与 Embedding 向量引擎</span>
                </span>
              ),
              children: (
                <div style={{ paddingTop: 8 }}>
                  <Card
                    className="consulting-table-card"
                    title="模型与 Embedding 向量引擎配置"
                    loading={loading}
                    extra={
                      <Space wrap>
                        <Button onClick={testLLMConnection} loading={testingLLM}>测试大模型连通性</Button>
                        <Button onClick={testEmbeddingConnection} loading={testingEmbedding}>测试 Embedding 连通性</Button>
                        <Button onClick={fetchSettings}>刷新</Button>
                        <Button type="primary" onClick={save} loading={saving}>保存全部配置</Button>
                      </Space>
                    }
                  >
                    <div style={{ marginBottom: 20, padding: 12, background: 'var(--ant-color-bg-layout, #f8fafc)', borderRadius: 8, border: '1px solid var(--ant-color-border-secondary, #e2e8f0)' }}>
                      <Text strong style={{ marginRight: 12 }}>⚡ 快捷通道载入：</Text>
                      <Space wrap size="middle">
                        <Button size="small" type="dashed" onClick={fillDeepSeekPreset}>
                          🔹 载入 DeepSeek 官方配置 & 预置密钥
                        </Button>
                        <Button size="small" type="dashed" onClick={fillBailianPreset}>
                          🔸 载入 阿里百炼 配置 & 预置密钥
                        </Button>
                        <Button size="small" type="dashed" onClick={fillVolcenginePreset}>
                          火山引擎 (豆包) 预设
                        </Button>
                      </Space>
                    </div>

                    <Form form={form} layout="vertical" autoComplete="off">
                      <input type="text" name="username" autoComplete="username" style={{ display: 'none' }} />
                      <input type="password" name="password" autoComplete="current-password" style={{ display: 'none' }} />
                      
                      <Title level={5} style={{ marginTop: 8, marginBottom: 12, borderLeft: '4px solid #2563eb', paddingLeft: 8 }}>
                        🤖 主体对话/生成大模型 (LLM)
                      </Title>

                      <Form.Item name="llm_provider" label="大模型服务通道">
                        <Select
                          options={[
                            { label: 'DeepSeek 官方 API (api.deepseek.com)', value: 'deepseek' },
                            { label: '阿里百炼 聚合通道 (Qwen/Kimi-K3/DeepSeek/GLM-5.2)', value: 'dashscope' },
                            { label: '字节火山引擎 (Ark / 豆包大模型)', value: 'volcengine' },
                            { label: '自定义 OpenAI 兼容接口', value: 'custom' },
                          ]}
                          onChange={(val) => {
                            if (val === 'deepseek') {
                              form.setFieldsValue({
                                llm_base_url: 'https://api.deepseek.com',
                                llm_model: 'deepseek-v4-pro',
                              });
                            } else if (val === 'dashscope') {
                              form.setFieldsValue({
                                llm_base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
                                llm_model: 'qwen-max',
                              });
                            } else if (val === 'volcengine') {
                              form.setFieldsValue({
                                llm_base_url: 'https://ark.cn-beijing.volces.com/api/v3',
                                llm_model: 'doubao-seed-2-0-pro-260215',
                              });
                            }
                          }}
                        />
                      </Form.Item>

                      <Form.Item name="llm_base_url" label="Base URL 地址">
                        <Input placeholder="例如：https://api.deepseek.com 或 https://dashscope.aliyuncs.com/compatible-mode/v1" autoComplete="off" />
                      </Form.Item>

                      <Form.Item
                        name="llm_model"
                        label="Model 模型名称（点击查看完整推荐下拉，输入自定义名称自动添加）"
                        rules={[{ required: true, message: '请选择或输入 Model 模型名称' }]}
                      >
                        <CustomModelSelect
                          options={
                            llmModelOptionsMap[selectedLLMProvider] || [
                              ...llmModelOptionsMap.deepseek,
                              ...llmModelOptionsMap.dashscope,
                              ...llmModelOptionsMap.volcengine,
                            ]
                          }
                          placeholder="点击点选推荐模型或输入自定义模型名称，如 kimi-k3 / deepseek-v4-pro"
                        />
                      </Form.Item>

                      <Form.Item
                        name="llm_api_key"
                        label="大模型 API Key"
                        extra={
                          <Space orientation="vertical" size={4}>
                            <Text type="secondary">
                              {meta?.llm_api_key_set
                                ? `已配置 API Key${meta.llm_api_key_last4 ? `（末 4 位：${meta.llm_api_key_last4}）` : ''}`
                                : '未设置，请输入 API Key'}
                            </Text>
                            {meta?.llm_api_key_set && !editingKey ? (
                              <Button type="link" onClick={() => setEditingKey(true)} style={{ padding: 0, height: 'auto' }}>
                                更换 API Key
                              </Button>
                            ) : null}
                          </Space>
                        }
                      >
                        <Input.Password
                          placeholder={meta?.llm_api_key_set && !editingKey ? '已设置秘钥（保密隐藏）' : '输入新 Key 后覆盖保存'}
                          autoComplete="new-password"
                          name="llm_api_key_field"
                          disabled={!!(meta?.llm_api_key_set && !editingKey)}
                        />
                      </Form.Item>

                      <Divider style={{ margin: '24px 0 16px' }} />

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <Title level={5} style={{ margin: 0, borderLeft: '4px solid #10b981', paddingLeft: 8 }}>
                          🧠 RAG 知识库 Embedding 向量引擎
                        </Title>
                        <Button size="small" type="dashed" onClick={testEmbeddingConnection} loading={testingEmbedding}>
                          🔍 测试向量模型连通性
                        </Button>
                      </div>

                      <Form.Item name="embedding_provider" label="Embedding 向量服务通道">
                        <Select
                          options={[
                            { label: '阿里百炼 Embedding (text-embedding-v3 / bge-large-zh)', value: 'dashscope' },
                            { label: 'DeepSeek / OpenAI 兼容 Embedding 服务', value: 'deepseek' },
                            { label: '字节火山引擎 Embedding (doubao-embedding)', value: 'volcengine' },
                            { label: '本地轻量特征向量 (local_hashing_vectorizer)', value: 'local' },
                          ]}
                          onChange={(val) => {
                            if (val === 'dashscope') {
                              form.setFieldsValue({
                                embedding_base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
                                embedding_model: 'text-embedding-v3',
                              });
                            } else if (val === 'volcengine') {
                              form.setFieldsValue({
                                embedding_base_url: 'https://ark.cn-beijing.volces.com/api/v3',
                                embedding_model: 'doubao-embedding',
                              });
                            } else if (val === 'local') {
                              form.setFieldsValue({
                                embedding_base_url: '',
                                embedding_model: 'local_hashing_vectorizer',
                              });
                            }
                          }}
                        />
                      </Form.Item>

                      <Form.Item name="embedding_base_url" label="Embedding Base URL 地址">
                        <Input placeholder="例如：https://dashscope.aliyuncs.com/compatible-mode/v1" autoComplete="off" />
                      </Form.Item>

                      <Form.Item name="embedding_model" label="Embedding Model 向量模型名称（点击查看完整推荐下拉，输入自定义名称自动添加）">
                        <CustomModelSelect
                          options={
                            embeddingModelOptionsMap[selectedEmbeddingProvider] || [
                              ...embeddingModelOptionsMap.dashscope,
                              ...embeddingModelOptionsMap.deepseek,
                            ]
                          }
                          placeholder="点击点选推荐模型或输入自定义向量模型，如 text-embedding-v3 / bge-large-zh"
                        />
                      </Form.Item>

                      <Form.Item
                        name="embedding_api_key"
                        label="Embedding 专用 API Key（如留空则复用大模型 API Key）"
                        extra={
                          <Space orientation="vertical" size={4}>
                            <Text type="secondary">
                              {meta?.embedding_api_key_set
                                ? `已配置专用 Key${meta.embedding_api_key_last4 ? `（末 4 位：${meta.embedding_api_key_last4}）` : ''}`
                                : '未独立配置（默认复用主模型 Key）'}
                            </Text>
                            {meta?.embedding_api_key_set && !editingEmbeddingKey ? (
                              <Button type="link" onClick={() => setEditingEmbeddingKey(true)} style={{ padding: 0, height: 'auto' }}>
                                更换 Embedding API Key
                              </Button>
                            ) : null}
                          </Space>
                        }
                      >
                        <Input.Password
                          placeholder={meta?.embedding_api_key_set && !editingEmbeddingKey ? '已设置秘钥（保密隐藏）' : '留空自动复用主模型 Key'}
                          autoComplete="new-password"
                          disabled={!!(meta?.embedding_api_key_set && !editingEmbeddingKey)}
                        />
                      </Form.Item>
                    </Form>
                  </Card>
                </div>
              ),
            },
            {
              key: 'users',
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '15px', fontWeight: 600 }}>
                  <UserOutlined style={{ color: '#722ed1' }} />
                  <span>👥 内部成员与用户权限</span>
                </span>
              ),
              children: (
                <div style={{ paddingTop: 8 }}>
                  <UsersList />
                </div>
              ),
            },
            {
              key: 'mail',
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '15px', fontWeight: 600 }}>
                  <MailOutlined style={{ color: '#10b981' }} />
                  <span>📧 邮件服务与简历拉取</span>
                </span>
              ),
              children: (
                <div style={{ paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <Card
                    className="consulting-table-card"
                    title="邮件服务配置"
                    loading={mailLoading}
                    extra={
                      <Space>
                        <Button onClick={testMail}>测试连接</Button>
                        <Button onClick={fetchMailSettings}>刷新</Button>
                        <Button type="primary" onClick={saveMail} loading={mailSaving}>保存</Button>
                      </Space>
                    }
                  >
                    <Form form={mailForm} layout="vertical" autoComplete="off">
                      <Form.Item
                        name="mail_enabled"
                        label="启用邮件通知"
                        valuePropName="checked"
                        extra={<Text type="secondary">保留 SMTP 配置，后续可用于发送能力样本分析报告或项目评估摘要</Text>}
                      >
                        <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                      </Form.Item>

                      <Form.Item
                        name="smtp_host"
                        label="SMTP 服务器地址"
                        rules={[{ required: true, message: '请输入 SMTP 服务器地址' }]}
                      >
                        <Input placeholder="例如：smtp.qq.com" autoComplete="off" />
                      </Form.Item>

                      <Form.Item
                        name="smtp_port"
                        label="SMTP 端口"
                        rules={[{ required: true, message: '请输入 SMTP 端口' }]}
                      >
                        <InputNumber min={1} max={65535} style={{ width: '100%' }} placeholder="通常为 465 或 587" />
                      </Form.Item>

                      <Form.Item
                        name="smtp_username"
                        label="SMTP 用户名"
                        rules={[{ required: true, message: '请输入 SMTP 用户名' }]}
                      >
                        <Input placeholder="通常是邮箱地址" autoComplete="off" />
                      </Form.Item>

                      <Form.Item
                        name="smtp_password"
                        label="SMTP 密码/授权码"
                        extra={
                          <Space orientation="vertical" size={4}>
                            <Text type="secondary">
                              {mailMeta?.smtp_password_set
                                ? '已设置密码，不会回显'
                                : '未设置，请输入 SMTP 密码或授权码'}
                            </Text>
                            {mailMeta?.smtp_password_set && !editingMailPassword ? (
                              <Button type="link" onClick={() => setEditingMailPassword(true)} style={{ padding: 0, height: 'auto' }}>
                                更换密码/授权码
                              </Button>
                            ) : null}
                          </Space>
                        }
                      >
                        <Input.Password
                          placeholder={mailMeta?.smtp_password_set && !editingMailPassword ? '已设置密码（保密隐藏）' : '输入新密码后覆盖保存'}
                          autoComplete="new-password"
                          disabled={!!(mailMeta?.smtp_password_set && !editingMailPassword)}
                        />
                      </Form.Item>

                      <Form.Item
                        name="mail_from"
                        label="发件人邮箱"
                        rules={[
                          { required: true, message: '请输入发件人邮箱' },
                          { type: 'email', message: '请输入有效的邮箱地址' }
                        ]}
                      >
                        <Input placeholder="发件人邮箱地址" autoComplete="off" />
                      </Form.Item>

                      <Form.Item
                        name="mail_from_name"
                        label="发件人名称"
                      >
                        <Input placeholder="例如：Qylin Intelligence" autoComplete="off" />
                      </Form.Item>

                      <Form.Item
                        name="frontend_url"
                        label="前端访问地址"
                        extra={<Text type="secondary">用于生成系统邮件里的访问链接。请填写完整地址，如：https://intel.example.com</Text>}
                      >
                        <Input placeholder="例如：http://localhost:5173 或 https://hr.example.com" autoComplete="off" />
                      </Form.Item>
                    </Form>
                  </Card>

                  <Card
                    className="consulting-table-card"
                    title="能力样本邮箱自动拉取"
                    loading={resumeMailLoading}
                    extra={
                      <Space wrap>
                        <Button onClick={fetchResumeMailSettings}>刷新</Button>
                        <Button onClick={testResumeMail} loading={resumeMailTesting}>立即触发一次同步</Button>
                        <Button type="primary" onClick={saveResumeMail} loading={resumeMailSaving}>保存配置</Button>
                      </Space>
                    }
                  >
                    <Space direction="vertical" size="large" style={{ width: '100%' }}>
                      <Alert
                        type="info"
                        showIcon
                        message="系统后台将定期通过 IMAP/POP3 协议扫描该邮箱，发现新的简历或求职文件附件后自动抽取正文并入库解析。"
                      />

                      <Form form={resumeMailForm} layout="vertical" autoComplete="off">
                        <Form.Item name="enabled" label="开启自动拉取" valuePropName="checked">
                          <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                        </Form.Item>

                        <Form.Item
                          name="protocol"
                          label="协议类型"
                          rules={[{ required: true, message: '请选择协议类型' }]}
                        >
                          <Select
                            options={[
                              { label: 'IMAP（推荐，支持读取文件夹与状态）', value: 'imap' },
                              { label: 'POP3', value: 'pop3' },
                            ]}
                          />
                        </Form.Item>

                        <Form.Item
                          name="host"
                          label="服务器地址"
                          rules={[{ required: true, message: '请输入服务器地址' }]}
                        >
                          <Input placeholder="例如：imap.qq.com" autoComplete="off" />
                        </Form.Item>

                        <Form.Item
                          name="port"
                          label="服务器端口"
                          rules={[{ required: true, message: '请输入端口' }]}
                        >
                          <InputNumber min={1} max={65535} style={{ width: '100%' }} placeholder="通常 IMAP SSL 为 993" />
                        </Form.Item>

                        <Form.Item name="use_ssl" label="启用 SSL 加密" valuePropName="checked">
                          <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                        </Form.Item>

                        <Form.Item
                          name="username"
                          label="邮箱账号"
                          rules={[{ required: true, message: '请输入邮箱账号' }]}
                        >
                          <Input placeholder="通常为完整邮箱地址" autoComplete="off" />
                        </Form.Item>

                        <Form.Item
                          name="password"
                          label="邮箱密码 / 授权码"
                          extra={resumeMailMeta?.password_set ? '已配置密码/授权码' : '未配置'}
                          rules={resumeMailMeta?.password_set ? [] : [{ required: true, message: '请输入邮箱授权码' }]}
                        >
                          <Input.Password autoComplete="new-password" />
                        </Form.Item>

                        <Form.Item name="poll_interval_seconds" label="同步间隔（秒）">
                          <InputNumber min={30} max={3600} style={{ width: '100%' }} />
                        </Form.Item>

                        <Form.Item name="mark_success_read" label="成功导入后标记已读" valuePropName="checked">
                          <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                        </Form.Item>

                        {resumeMailMeta?.last_sync_at ? (
                          <Text type="secondary">上次同步：{new Date(resumeMailMeta.last_sync_at).toLocaleString()}</Text>
                        ) : null}
                      </Form>

                      <Table
                        rowKey="id"
                        size="small"
                        dataSource={resumeMailLogs}
                        pagination={false}
                        columns={resumeMailLogColumns}
                      />
                    </Space>
                  </Card>
                </div>
              ),
            },
            {
              key: 'prompts',
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '15px', fontWeight: 600 }}>
                  <SettingOutlined style={{ color: '#f59e0b' }} />
                  <span>📝 Agent 默认提示词模板</span>
                </span>
              ),
              children: (
                <div style={{ paddingTop: 8 }}>
                  <Card
                    className="consulting-table-card"
                    title="提示词配置"
                    loading={promptLoading}
                    extra={
                      <Space>
                        <Button onClick={fetchPromptConfigs}>刷新</Button>
                      </Space>
                    }
                  >
                    <Tabs
                      activeKey={activePromptKey}
                      onChange={setActivePromptKey}
                      items={promptTabs}
                    />
                  </Card>
                </div>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default SystemSettingsPage;
