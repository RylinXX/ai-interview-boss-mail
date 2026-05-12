import React, { useEffect, useState } from 'react';
import { Form, Button, Card, Upload, Select, message } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import request from '../../utils/request';

const { Dragger } = Upload;
const MAX_RESUME_UPLOAD_COUNT = 10;

const ResumeUpload: React.FC = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [fileList, setFileList] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);

  useEffect(() => {
    fetchPositions();
  }, []);

  const fetchPositions = async () => {
    try {
      const res = await request.get('/positions');
      setPositions(res);
    } catch (error) {
      message.error('获取岗位列表失败');
    }
  };

  const onFinish = async (values: any) => {
    if (fileList.length === 0) {
      message.error('请上传简历文件');
      return;
    }

    setLoading(true);
    try {
      if (fileList.length === 1) {
        const formData = new FormData();
        formData.append('position_id', values.position_id);
        formData.append('file', fileList[0]);
        await request.post('/resumes', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
        message.success('简历上传成功，AI正在解析中...');
      } else {
        const formData = new FormData();
        formData.append('position_id', values.position_id);
        fileList.forEach(file => {
          formData.append('files', file);
        });
        await request.post('/resumes/batch', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
        message.success(`成功上传 ${fileList.length} 份简历，AI正在解析中...`);
      }
      navigate('/resumes');
    } catch (error) {
      message.error('上传失败');
    } finally {
      setLoading(false);
    }
  };

  const uploadProps = {
    onRemove: (file) => {
      setFileList((prev) => prev.filter(item => item.uid !== file.uid));
    },
    beforeUpload: (file) => {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (!isPdf) {
        message.error('只允许上传 PDF 格式的文件');
        return Upload.LIST_IGNORE;
      }
      setFileList((prev) => {
        if (prev.length >= MAX_RESUME_UPLOAD_COUNT) {
          message.warning(`一次最多上传 ${MAX_RESUME_UPLOAD_COUNT} 份简历`);
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
    <Card title="批量上传简历">
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
      >
        <Form.Item
          name="position_id"
          label="应聘岗位"
          rules={[{ required: true, message: '请选择应聘岗位' }]}
        >
          <Select placeholder="请选择岗位">
            {positions.map(position => (
              <Select.Option key={position.id} value={position.id}>
                {position.title}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          label="简历文件"
          extra={`仅支持 PDF 格式，一次最多 ${MAX_RESUME_UPLOAD_COUNT} 份。单文件会自动走普通上传，多文件会走批量上传。`}
        >
          <Dragger {...uploadProps} maxCount={MAX_RESUME_UPLOAD_COUNT}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">拖拽 PDF 简历到这里，或点击选择文件</p>
            <p className="ant-upload-hint">支持多选上传，系统会自动创建候选人记录并进入 AI 解析队列</p>
          </Dragger>
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>
            上传并解析
          </Button>
          <Button style={{ marginLeft: 8 }} onClick={() => navigate('/resumes')}>
            取消
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default ResumeUpload;
