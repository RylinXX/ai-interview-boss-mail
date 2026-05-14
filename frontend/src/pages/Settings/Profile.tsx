import React, { useEffect, useState } from 'react';
import { Button, Card, Divider, Form, Input, Space, Typography, message } from 'antd';
import request from '../../utils/request';
import { useAuth } from '../../contexts/AuthContext';
import '../BusinessWorkbench.css';

const { Title, Text } = Typography;

const ProfileSettings: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (!user) return;
    profileForm.setFieldsValue({
      email: user.email,
      role: user.role,
      full_name: user.full_name,
    });
  }, [user, profileForm]);

  const saveProfile = async () => {
    try {
      const values = await profileForm.validateFields();
      setSavingProfile(true);
      await request.put('/auth/me', { full_name: values.full_name });
      await refreshUser();
      message.success('个人信息已保存');
    } catch (e) {
      message.error('保存失败');
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async () => {
    try {
      const values = await passwordForm.validateFields();
      setSavingPassword(true);
      await request.post('/auth/change-password', {
        current_password: values.current_password,
        new_password: values.new_password,
      });
      passwordForm.resetFields();
      message.success('密码已更新');
    } catch (e) {
      message.error('更新密码失败');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="settings-profile-page workbench-page">
      <section className="consulting-hero">
        <div className="consulting-hero-copy">
          <span className="dossier-code">Account</span>
          <Title level={1}>个人设置</Title>
          <Text>维护你的内部顾问资料、登录凭证和系统访问身份。</Text>
        </div>
      </section>

      <Space orientation="vertical" size="large" style={{ width: '100%' }}>
        <Card className="consulting-table-card" title="个人资料" styles={{ body: { paddingTop: 8 } }}>
          <Form form={profileForm} layout="vertical">
            <Form.Item label="邮箱" name="email">
              <Input disabled />
            </Form.Item>
            <Form.Item label="角色" name="role">
              <Input disabled />
            </Form.Item>
            <Form.Item
              label="姓名"
              name="full_name"
              rules={[{ required: true, message: '请输入姓名' }]}
            >
              <Input placeholder="请输入姓名" />
            </Form.Item>
            <Button type="primary" onClick={saveProfile} loading={savingProfile}>
              保存
            </Button>
          </Form>
        </Card>

        <Card className="consulting-table-card" title="修改密码" styles={{ body: { paddingTop: 8 } }}>
          <Form form={passwordForm} layout="vertical">
            <Form.Item
              label="当前密码"
              name="current_password"
              rules={[{ required: true, message: '请输入当前密码' }]}
            >
              <Input.Password />
            </Form.Item>
            <Form.Item
              label="新密码"
              name="new_password"
              rules={[{ required: true, message: '请输入新密码' }, { min: 6, message: '至少 6 位' }]}
            >
              <Input.Password />
            </Form.Item>
            <Form.Item
              label="确认新密码"
              name="confirm_password"
              dependencies={['new_password']}
              rules={[
                { required: true, message: '请再次输入新密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('new_password') === value) return Promise.resolve();
                    return Promise.reject(new Error('两次输入的密码不一致'));
                  },
                }),
              ]}
            >
              <Input.Password />
            </Form.Item>
            <Divider style={{ margin: '8px 0 16px' }} />
            <Button type="primary" onClick={changePassword} loading={savingPassword}>
              更新密码
            </Button>
          </Form>
        </Card>
      </Space>
    </div>
  );
};

export default ProfileSettings;
