import { Edit, useForm } from '@refinedev/antd';
import { Form, Input } from 'antd';

export function CategoryEdit() {
  const { formProps, saveButtonProps } = useForm();

  return (
    <Edit saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item label="Name" name="name">
          <Input />
        </Form.Item>
        <Form.Item label="Slug" name="slug">
          <Input />
        </Form.Item>
      </Form>
    </Edit>
  );
}
