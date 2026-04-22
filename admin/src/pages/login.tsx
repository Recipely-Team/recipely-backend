import { useLogin } from '@refinedev/core';
import { Form, Input, Button, Card, Typography, Space } from 'antd';

const { Title } = Typography;

export function Login() {
  const { mutate: login, isLoading } = useLogin();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
      <Card style={{ width: 400 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Title level={3} style={{ textAlign: 'center' }}>Recipely Admin</Title>
          <Form
            layout="vertical"
            onFinish={(values) => login(values)}
          >
            <Form.Item
              name="email"
              label="Email"
              rules={[{ required: true, type: 'email' }]}
            >
              <Input type="email" placeholder="admin@example.com" />
            </Form.Item>
            <Form.Item
              name="password"
              label="Password"
              rules={[{ required: true }]}
            >
              <Input.Password placeholder="••••••••" />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={isLoading} block>
              Sign In
            </Button>
          </Form>
        </Space>
      </Card>
    </div>
  );
}
