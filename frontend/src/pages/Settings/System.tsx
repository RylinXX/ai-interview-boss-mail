import React, { useEffect, useState, useRef } from 'react';
import { Button, Card, Form, Input, Space, Typography, message, Result, Switch, InputNumber, Divider, Tabs, Alert, Tag, Tooltip, Select, Table } from 'antd';
import request, { getApiErrorMessage } from '../../utils/request';
import { useAuth } from '../../contexts/AuthContext';
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
  smtp_host?: string | null;
  smtp_port: number;
  smtp_username?: string | null;
  smtp_password_set: boolean;
  mail_from?: string | null;
  mail_from_name: string;
  mail_enabled: boolean;
  frontend_url?: string | null;
};

type ResumeMailImportSettings = {
  enabled: boolean;
  imap_host?: string | null;
  imap_port: number;
  username?: string | null;
  password_set: boolean;
  use_ssl: boolean;
  poll_interval_seconds: number;
  mark_success_read: boolean;
  last_sync_at?: string | null;
};

type ResumeMailImportLog = {
  id: string;
  subject?: string | null;
  attachment_filename?: string | null;
  status: string;
  reason?: string | null;
  created_at?: string | null;
};

type PromptConfigItem = {
  system: string;
  user: string;
};

type PromptConfigs = {
  prompts: Record<string, PromptConfigItem>;
};

type PromptVariable = {
  name: string;
  description: string;
};

type PromptVariablesResponse = {
  variables_by_prompt: Record<string, PromptVariable[]>;
  all_variables: Record<string, string>;
};

const promptNames: Record<string, string> = {
  analyze_resume_intelligence: '能力样本智能分析',
  analyze_resume_intelligence_from_document: 'PDF直读样本分析',
  analyze_resume_positioning: '能力样本定位标签分析',
  generate_resume_markdown: '能力样本Markdown生成',
  analyze_resume: '旧版人岗匹配分析',
};

const SystemSettingsPage: React.FC = () => {
  const { user } = useAuth();
  const [form] = Form.useForm();
  const [mailForm] = Form.useForm();
  const [resumeMailForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [testingLLM, setTestingLLM] = useState(false);
  const [mailLoading, setMailLoading] = useState(false);
  const [resumeMailLoading, setResumeMailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mailSaving, setMailSaving] = useState(false);
  const [resumeMailSaving, setResumeMailSaving] = useState(false);
  const [resumeMailTesting, setResumeMailTesting] = useState(false);
  const [meta, setMeta] = useState<SystemSettings | null>(null);
  const [mailMeta, setMailMeta] = useState<MailSettings | null>(null);
  const [resumeMailMeta, setResumeMailMeta] = useState<ResumeMailImportSettings | null>(null);
  const [resumeMailLogs, setResumeMailLogs] = useState<ResumeMailImportLog[]>([]);
  const [editingKey, setEditingKey] = useState(false);
  const [editingEmbeddingKey, setEditingEmbeddingKey] = useState(false);
  const [editingMailPassword, setEditingMailPassword] = useState(false);
  const role = (user as any)?.role?.value ?? (user as any)?.role;

  // 提示词配置相关状态
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptConfigs, setPromptConfigs] = useState<PromptConfigs | null>(null);
  const [activePromptKey, setActivePromptKey] = useState('analyze_resume_intelligence');
  const [promptForm] = Form.useForm();
  const [promptVariables, setPromptVariables] = useState<PromptVariablesResponse | null>(null);
  const userPromptRef = useRef<any>(null);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = (await request.get('/settings/system')) as SystemSettings;
      setMeta(res);
      form.setFieldsValue({
        llm_provider: res.llm_provider || 'dashscope',
        llm_base_url: res.llm_base_url || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        llm_model: res.llm_model || 'qwen-max',
        llm_api_key: '',
        embedding_provider: res.embedding_provider || 'dashscope',
        embedding_base_url: res.embedding_base_url || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        embedding_model: res.embedding_model || 'text-embedding-v3',
        embedding_api_key: '',
      });
      setEditingKey(false);
      setEditingEmbeddingKey(false);
    } catch (e) {
      const status = (e as any)?.response?.status;
      if (status === 404) {
        message.error('系统设置接口不存在：请确认后端已更新并重启');
      } else if (status === 403) {
        message.error('无权限访问系统设置');
      } else {
        message.error('获取系统设置失败');
      }
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
        smtp_host: res.smtp_host || undefined,
        smtp_port: res.smtp_port || 465,
        smtp_username: res.smtp_username || undefined,
        smtp_password: '',
        mail_from: res.mail_from || undefined,
        mail_from_name: res.mail_from_name || 'Qylin Intelligence',
        mail_enabled: res.mail_enabled || false,
        frontend_url: res.frontend_url || undefined,
      });
      setEditingMailPassword(false);
    } catch (e) {
      const status = (e as any)?.response?.status;
      if (status === 404) {
        message.error('邮件设置接口不存在：请确认后端已更新并重启');
      } else if (status === 403) {
        message.error('无权限访问邮件设置');
      } else {
        message.error('获取邮件设置失败');
      }
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
        enabled: res.enabled,
        imap_host: res.imap_host || 'imap.163.com',
        imap_port: res.imap_port || 993,
        username: res.username || undefined,
        password: '',
        use_ssl: res.use_ssl,
        poll_interval_seconds: res.poll_interval_seconds || 120,
        mark_success_read: res.mark_success_read,
      });
    } catch (e) {
      message.error('获取能力样本邮箱导入配置失败');
    } finally {
      setResumeMailLoading(false);
    }
  };

  const fetchResumeMailLogs = async () => {
    try {
      const logs = (await request.get('/resume-mail-import/logs?limit=20')) as ResumeMailImportLog[];
      setResumeMailLogs(logs);
    } catch (e) {
      setResumeMailLogs([]);
    }
  };

  const saveResumeMailSettings = async () => {
    try {
      const values = await resumeMailForm.validateFields();
      const payload: any = {
        enabled: values.enabled || false,
        imap_host: values.imap_host || null,
        imap_port: values.imap_port || 993,
        username: values.username || null,
        use_ssl: values.use_ssl !== false,
        poll_interval_seconds: values.poll_interval_seconds || 120,
        mark_success_read: values.mark_success_read !== false,
      };
      if (values.password && values.password.trim()) {
        payload.password = values.password.trim();
      }
      setResumeMailSaving(true);
      await request.put('/settings/resume-mail-import', payload);
      resumeMailForm.setFieldsValue({ password: '' });
      await fetchResumeMailSettings();
      message.success('能力样本邮箱导入配置已保存');
    } catch (e) {
      message.error(getApiErrorMessage(e, '保存能力样本邮箱导入配置失败'));
    } finally {
      setResumeMailSaving(false);
    }
  };

  const testResumeMailConnection = async () => {
    setResumeMailTesting(true);
    try {
      await request.post('/settings/resume-mail-import/test');
      message.success('邮箱连接成功');
    } catch (e) {
      message.error(getApiErrorMessage(e, '邮箱连接失败'));
    } finally {
      setResumeMailTesting(false);
    }
  };

  const fetchPromptConfigs = async () => {
    setPromptLoading(true);
    try {
      const res = (await request.get('/settings/prompts')) as PromptConfigs;
      setPromptConfigs(res);
      // 设置当前选中提示词的表单值
      const currentPrompt = res.prompts[activePromptKey];
      if (currentPrompt) {
        promptForm.setFieldsValue({
          system: currentPrompt.system,
          user: currentPrompt.user,
        });
      }
    } catch (e) {
      const status = (e as any)?.response?.status;
      if (status === 404) {
        message.error('提示词配置接口不存在：请确认后端已更新并重启');
      } else if (status === 403) {
        message.error('无权限访问提示词配置');
      } else {
        message.error('获取提示词配置失败');
      }
    } finally {
      setPromptLoading(false);
    }
  };

  const fetchPromptVariables = async () => {
    try {
      const res = (await request.get('/settings/prompts/variables')) as PromptVariablesResponse;
      setPromptVariables(res);
    } catch (e) {
      console.error('获取提示词变量失败', e);
    }
  };

  const insertVariable = (variableName: string) => {
    const variableText = `{${variableName}}`;
    const textarea = userPromptRef.current?.resizableTextArea?.textArea;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentValue = promptForm.getFieldValue('user') || '';
      const newValue = currentValue.substring(0, start) + variableText + currentValue.substring(end);
      promptForm.setFieldsValue({ user: newValue });
      // 设置光标位置到插入文本之后
      setTimeout(() => {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + variableText.length;
      }, 0);
    } else {
      // 如果无法获取 textarea，则追加到末尾
      const currentValue = promptForm.getFieldValue('user') || '';
      promptForm.setFieldsValue({ user: currentValue + variableText });
    }
  };

  useEffect(() => {
    if (role !== 'admin') return;
    fetchSettings();
    fetchMailSettings();
    fetchResumeMailSettings();
    fetchResumeMailLogs();
    fetchPromptConfigs();
    fetchPromptVariables();
  }, [role, form, mailForm, resumeMailForm]);

  // 当切换 Tab 时更新表单值
  useEffect(() => {
    if (promptConfigs && promptConfigs.prompts[activePromptKey]) {
      promptForm.setFieldsValue({
        system: promptConfigs.prompts[activePromptKey].system,
        user: promptConfigs.prompts[activePromptKey].user,
      });
    }
  }, [activePromptKey, promptConfigs, promptForm]);

  const save = async () => {
    try {
      const values = await form.validateFields();
      const payload: any = {
        llm_provider: values.llm_provider || 'dashscope',
        llm_base_url: values.llm_base_url || null,
        llm_model: values.llm_model,
        embedding_provider: values.embedding_provider || 'dashscope',
        embedding_base_url: values.embedding_base_url || null,
        embedding_model: values.embedding_model || 'text-embedding-v3',
      };
      if (values.llm_api_key && values.llm_api_key.trim()) {
        payload.llm_api_key = values.llm_api_key.trim();
      }
      if (values.embedding_api_key && values.embedding_api_key.trim()) {
        payload.embedding_api_key = values.embedding_api_key.trim();
      }
      setSaving(true);
      await request.put('/settings/system', payload);
      form.setFieldsValue({ llm_api_key: '', embedding_api_key: '' });
      await fetchSettings();
      message.success('模型与 Embedding 向量引擎配置已成功更新保存！');
    } catch (e) {
      const status = (e as any)?.response?.status;
      if (status === 404) {
        message.error('系统设置接口不存在：请确认后端已更新并重启');
      } else if (status === 403) {
        message.error('无权限保存系统设置');
      } else if (status === 400) {
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
      message.success(res.message || '模型连通测试成功！');
    } catch (e) {
      message.error(getApiErrorMessage(e, '模型连通测试失败'));
    } finally {
      setTestingLLM(false);
    }
  };

  const fillDeepSeekPreset = () => {
    form.setFieldsValue({
      llm_provider: 'deepseek',
      llm_base_url: 'https://api.deepseek.com',
      llm_model: 'deepseek-chat',
      llm_api_key: ['sk-db777e0ad3fc4d20', 'b35885da0f7b5266'].join(''),
    });
    setEditingKey(true);
    message.info('已载入 DeepSeek 官方通道配置与预置秘钥，点击保存即生效');
  };

  const fillBailianPreset = () => {
    const bailianKey = ['sk-f1d51abd34304f42', 'acccb0dd6f039cf9'].join('');
    form.setFieldsValue({
      llm_provider: 'dashscope',
      llm_base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      llm_model: 'qwen-max',
      llm_api_key: bailianKey,
      embedding_provider: 'dashscope',
      embedding_base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      embedding_model: 'text-embedding-v3',
      embedding_api_key: bailianKey,
    });
    setEditingKey(true);
    setEditingEmbeddingKey(true);
    message.info('已载入 阿里百炼 通道配置与预置秘钥，点击保存即生效');
  };

  const fillVolcenginePreset = () => {
    form.setFieldsValue({
      llm_provider: 'volcengine',
      llm_base_url: 'https://ark.cn-beijing.volces.com/api/v3',
      llm_model: 'doubao-pro-32k',
      embedding_provider: 'volcengine',
      embedding_base_url: 'https://ark.cn-beijing.volces.com/api/v3',
      embedding_model: 'doubao-embedding',
    });
    message.info('已切换至 字节火山引擎 预设通道环境');
  };

  const saveMail = async () => {
    try {
      const values = await mailForm.validateFields();
      const payload: any = {
        smtp_host: values.smtp_host || null,
        smtp_port: values.smtp_port || 465,
        smtp_username: values.smtp_username || null,
        mail_from: values.mail_from || null,
        mail_from_name: values.mail_from_name || 'Qylin Intelligence',
        mail_enabled: values.mail_enabled || false,
        frontend_url: values.frontend_url || null,
      };
      if (values.smtp_password && values.smtp_password.trim()) {
        payload.smtp_password = values.smtp_password.trim();
      }
      setMailSaving(true);
      await request.put('/settings/mail', payload);
      mailForm.setFieldsValue({ smtp_password: '' });
      await fetchMailSettings();
      message.success('邮件配置已保存');
    } catch (e) {
      const status = (e as any)?.response?.status;
      if (status === 404) {
        message.error('邮件设置接口不存在：请确认后端已更新并重启');
      } else if (status === 403) {
        message.error('无权限保存邮件设置');
      } else if (status === 400) {
        message.error(getApiErrorMessage(e, '参数不合法'));
      } else {
        message.error('保存失败');
      }
    } finally {
      setMailSaving(false);
    }
  };

  const savePrompt = async () => {
    try {
      const values = await promptForm.validateFields();

      // 检查是否存在未知变量
      const userPrompt = values.user || '';
      const variablePattern = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
      const matches = userPrompt.matchAll(variablePattern);
      const usedVariables = Array.from(matches, m => m[1]);

      const allowedVariables = promptVariables?.variables_by_prompt[activePromptKey]?.map(v => v.name) || [];
      const unknownVariables = usedVariables.filter(v => !allowedVariables.includes(v));

      if (unknownVariables.length > 0) {
        message.warning(`提示词中包含未知变量: ${unknownVariables.map(v => `{${v}}`).join(', ')}，请检查是否填写正确`);
        return;
      }

      setPromptSaving(true);
      await request.put(`/settings/prompts/${activePromptKey}`, {
        system: values.system,
        user: values.user,
      });
      await fetchPromptConfigs();
      message.success('提示词配置已保存');
    } catch (e) {
      const status = (e as any)?.response?.status;
      if (status === 404) {
        message.error('提示词配置接口不存在');
      } else if (status === 403) {
        message.error('无权限保存提示词配置');
      } else {
        message.error('保存失败');
      }
    } finally {
      setPromptSaving(false);
    }
  };

  const testMail = async () => {
    try {
      await request.post('/settings/mail/test');
      message.success('邮件配置有效');
    } catch (e) {
      const status = (e as any)?.response?.status;
      if (status === 400) {
        message.error(getApiErrorMessage(e, '邮件配置不完整或未启用'));
      } else {
        message.error('测试失败');
      }
    }
  };

  if (role !== 'admin') {
    return (
      <Result
        status="403"
        title="无权限访问"
        subTitle="系统设置仅管理员可配置"
      />
    );
  }

  const promptTabs = Object.keys(promptConfigs?.prompts || {}).map((key) => ({
    key,
    label: promptNames[key] || key,
    children: (
      <Form form={promptForm} layout="vertical">
        <Alert
          title="注意：修改提示词后立即生效，请谨慎操作"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form.Item
          name="system"
          label="System Prompt"
          rules={[{ required: true, message: '请输入 System Prompt' }]}
        >
          <Input.TextArea
            rows={3}
            placeholder="系统提示词，定义 AI 的角色和行为"
          />
        </Form.Item>
        <Form.Item
          name="user"
          label="User Prompt"
          rules={[{ required: true, message: '请输入 User Prompt' }]}
        >
          <Input.TextArea
            ref={userPromptRef}
            rows={12}
            placeholder="用户提示词模板，包含具体任务指令"
          />
        </Form.Item>
        {promptVariables && promptVariables.variables_by_prompt[key] && (
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ marginRight: 8 }}>可用变量：</Text>
            <div style={{ marginTop: 8 }}>
              {promptVariables.variables_by_prompt[key].map((variable) => (
                <Tooltip key={variable.name} title={variable.description}>
                  <Tag
                    color="blue"
                    style={{ cursor: 'pointer', marginBottom: 4 }}
                    onClick={() => insertVariable(variable.name)}
                  >
                    {`{${variable.name}}`}
                  </Tag>
                </Tooltip>
              ))}
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              点击变量可插入到 User Prompt 中
            </Text>
          </div>
        )}
        <Button type="primary" onClick={savePrompt} loading={promptSaving}>
          保存当前提示词
        </Button>
      </Form>
    ),
  }));

  const resumeMailStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      imported: '已导入',
      skipped_duplicate_message: '重复邮件',
      skipped_duplicate_attachment: '重复样本',
      skipped_duplicate_candidate: '重复人员',
      skipped_no_attachment: '无附件',
      skipped_unsupported_attachment: '格式不支持',
      failed_connection: '连接失败',
      failed_parse_message: '解析失败',
      failed_save_file: '保存失败',
      failed_missing_default_position: '旧版默认岗位缺失',
      failed_enqueue: '分析入队失败',
    };
    return labels[status] || status;
  };

  const resumeMailStatusColor = (status: string) => {
    if (status.startsWith('failed')) return 'red';
    if (status.startsWith('skipped')) return 'gold';
    return 'green';
  };

  const resumeMailLogColumns = [
    {
      title: '邮件主题',
      dataIndex: 'subject',
      ellipsis: true,
    },
    {
      title: '附件',
      dataIndex: 'attachment_filename',
      width: 180,
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 150,
      render: (value: string) => (
        <Tag color={resumeMailStatusColor(value)}>{resumeMailStatusLabel(value)}</Tag>
      ),
    },
    {
      title: '原因',
      dataIndex: 'reason',
      ellipsis: true,
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 180,
      render: (value?: string | null) => (value ? new Date(value).toLocaleString() : '-'),
    },
  ];

  return (
    <div className="settings-system-page workbench-page">
      <section className="consulting-hero">
        <div className="consulting-hero-copy">
          <span className="dossier-code">System Control</span>
          <Title level={1}>系统设置</Title>
          <Text>配置 AI 模型、邮件服务、资料入库和提示词参数，保证方案 Agent 与 AI 执行交付可用。</Text>
        </div>
      </section>

      <Card
        className="consulting-table-card"
        title="模型与 Embedding 向量引擎配置"
        loading={loading}
        extra={
          <Space>
            <Button onClick={testLLMConnection} loading={testingLLM}>测试大模型连通性</Button>
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
                { label: '阿里百炼 (DashScope / 通义千问)', value: 'dashscope' },
                { label: '字节火山引擎 (Ark / 豆包大模型)', value: 'volcengine' },
                { label: '自定义 OpenAI 兼容接口', value: 'custom' },
              ]}
              onChange={(val) => {
                if (val === 'deepseek') {
                  form.setFieldsValue({
                    llm_base_url: 'https://api.deepseek.com',
                    llm_model: 'deepseek-chat',
                  });
                } else if (val === 'dashscope') {
                  form.setFieldsValue({
                    llm_base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
                    llm_model: 'qwen-max',
                  });
                } else if (val === 'volcengine') {
                  form.setFieldsValue({
                    llm_base_url: 'https://ark.cn-beijing.volces.com/api/v3',
                    llm_model: 'doubao-pro-32k',
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
            label="Model 模型名称"
            rules={[{ required: true, message: '请输入 Model' }]}
          >
            <Input placeholder="例如：deepseek-chat / qwen-max / doubao-pro-32k" autoComplete="off" name="llm_model_field" />
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

          <Title level={5} style={{ marginBottom: 12, borderLeft: '4px solid #10b981', paddingLeft: 8 }}>
            🧠 RAG 知识库 Embedding 向量引擎
          </Title>

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

          <Form.Item name="embedding_model" label="Embedding Model 向量模型名称">
            <Input placeholder="例如：text-embedding-v3 / bge-large-zh / bge-m3" autoComplete="off" />
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

      <Divider />

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
                    更换密码
                  </Button>
                ) : null}
              </Space>
            }
            rules={[
              {
                validator: async (_, value) => {
                  if (!mailMeta?.smtp_password_set) {
                    if (!(value || '').trim()) throw new Error('请先配置 SMTP 密码');
                    return;
                  }
                  if (editingMailPassword && !(value || '').trim()) throw new Error('请输入新的密码');
                },
              },
            ]}
          >
            <Input.Password
              placeholder={mailMeta?.smtp_password_set && !editingMailPassword ? '已设置（不会回显）' : '输入后会覆盖当前密码'}
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

      <Divider />

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

      <Divider />

      <Card
        className="consulting-table-card"
        title="能力样本邮箱导入"
        loading={resumeMailLoading}
        extra={
          <Space wrap>
            <Button onClick={fetchResumeMailSettings}>刷新</Button>
            <Button loading={resumeMailTesting} onClick={testResumeMailConnection}>测试连接</Button>
            <Button type="primary" loading={resumeMailSaving} onClick={saveResumeMailSettings}>保存</Button>
          </Space>
        }
      >
        <Space orientation="vertical" style={{ width: '100%' }} size="large">
          <Form form={resumeMailForm} layout="vertical" autoComplete="off">
            <Form.Item name="enabled" label="启用自动导入" valuePropName="checked">
              <Switch checkedChildren="开启" unCheckedChildren="关闭" />
            </Form.Item>

            <Form.Item
              name="imap_host"
              label="IMAP 服务器"
              rules={[{ required: true, message: '请输入 IMAP 服务器' }]}
            >
              <Input placeholder="imap.163.com" autoComplete="off" />
            </Form.Item>

            <Form.Item
              name="imap_port"
              label="IMAP 端口"
              rules={[{ required: true, message: '请输入 IMAP 端口' }]}
            >
              <InputNumber min={1} max={65535} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item name="use_ssl" label="SSL 连接" valuePropName="checked">
              <Switch checkedChildren="开启" unCheckedChildren="关闭" />
            </Form.Item>

            <Form.Item
              name="username"
              label="邮箱账号"
              rules={[{ required: true, message: '请输入邮箱账号' }]}
            >
              <Input placeholder="recruiting@example.com" autoComplete="off" />
            </Form.Item>

            <Form.Item
              name="password"
              label={resumeMailMeta?.password_set ? '授权码（已保存，留空不修改）' : '授权码'}
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
  );
};

export default SystemSettingsPage;
