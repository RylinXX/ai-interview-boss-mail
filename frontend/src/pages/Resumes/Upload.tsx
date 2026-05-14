import React, { useState } from 'react';
import { Button, Card, Form, Input, Upload, message, Typography, Alert, Space } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import request, { getApiErrorMessage } from '../../utils/request';
import '../BusinessWorkbench.css';

const { Dragger } = Upload;
const { Title, Text } = Typography;
const MAX_RESUME_UPLOAD_COUNT = 10;

const ResumeUpload: React.FC = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [fileList, setFileList] = useState<any[]>([]);

  const onFinish = async (values: any) => {
    if (fileList.length === 0) {
      message.error('请上传能力样本文件');
      return;
    }

    setLoading(true);
    try {
      if (fileList.length === 1) {
        const formData = new FormData();
        formData.append('file', fileList[0]);
        if (values.candidate_name) formData.append('candidate_name', values.candidate_name);
        if (values.email) formData.append('email', values.email);
        if (values.contact) formData.append('contact', values.contact);
        await request.post('/resumes', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        message.success('能力样本上传成功，模型正在读取并整理经历');
      } else {
        const formData = new FormData();
        fileList.forEach(file => {
          formData.append('files', file);
        });
        await request.post('/resumes/batch', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        message.success(`成功上传 ${fileList.length} 份能力样本，模型正在批量分析`);
      }
      navigate('/resumes');
    } catch (error) {
      message.error(getApiErrorMessage(error, '上传失败'));
    } finally {
      setLoading(false);
    }
  };

  const uploadProps = {
    onRemove: (file: any) => {
      setFileList((prev) => prev.filter(item => item.uid !== file.uid));
    },
    beforeUpload: (file: any) => {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (!isPdf) {
        message.error('当前上传入口仅支持 PDF 能力样本');
        return Upload.LIST_IGNORE;
      }
      setFileList((prev) => {
        if (prev.length >= MAX_RESUME_UPLOAD_COUNT) {
          message.warning(`一次最多上传 ${MAX_RESUME_UPLOAD_COUNT} 份能力样本`);
          return prev;
        }
        return [...prev, file];
      });
      return false;
    },
    fileList,
    multiple: true,
    accept: '.pdf',
  };

  return (
    <div className="resume-upload-page workbench-page">
      <section className="consulting-hero">
        <div className="consulting-hero-copy">
          <span className="dossier-code">Import Evidence</span>
          <Title level={1}>导入人才能力样本</Title>
          <Text>把 PDF 履历转成行业经验、项目方法和可引用能力证据，为客户方案提供背书。</Text>
        </div>
        <Space className="consulting-hero-actions">
          <Button onClick={() => navigate('/resumes')}>返回样本库</Button>
        </Space>
      </section>

      <Card className="consulting-table-card" title="上传样本进行智能分析">
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 18 }}
          title="系统会把 PDF 样本直接提交给已配置的大模型读取，再抽取工作经历、项目经历、商业模式追问和落地建议。"
        />
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item label="样本姓名" name="candidate_name">
            <Input placeholder="可选；留空则由模型从样本中识别" />
          </Form.Item>
          <Form.Item label="邮箱" name="email">
            <Input placeholder="可选" />
          </Form.Item>
          <Form.Item label="联系方式" name="contact">
            <Input placeholder="可选" />
          </Form.Item>

          <Form.Item
            label="能力样本文件"
            extra={`仅支持 PDF 格式，一次最多 ${MAX_RESUME_UPLOAD_COUNT} 份。批量上传时样本信息由模型识别。`}
          >
            <Dragger {...uploadProps} maxCount={MAX_RESUME_UPLOAD_COUNT}>
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">拖拽 PDF 能力样本到这里，或点击选择文件</p>
              <p className="ant-upload-hint">
                <Text type="secondary">上传后会进入模型解析队列，列表页会自动显示处理状态</Text>
              </p>
            </Dragger>
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>
              上传并分析
            </Button>
            <Button style={{ marginLeft: 8 }} onClick={() => navigate('/resumes')}>
              取消
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default ResumeUpload;
