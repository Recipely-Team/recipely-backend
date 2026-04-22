import { Create, useForm } from '@refinedev/antd';
import { Form, Input } from 'antd';

export function CategoryCreate() {
  const { formProps, saveButtonProps } = useForm();

  return (
    <Create saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item label="Name" name="name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Slug" name="slug" rules={[{ required: true }]}>
          <Input placeholder="e.g. italian-cuisine" />
        </Form.Item>
      </Form>
    </Create>
  );
}
