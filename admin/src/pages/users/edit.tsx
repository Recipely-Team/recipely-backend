import { Edit, useForm } from '@refinedev/antd';
import { Form, Input, Select } from 'antd';

export function UserEdit() {
  const { formProps, saveButtonProps } = useForm();

  return (
    <Edit saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item label="Display Name" name="displayName">
          <Input />
        </Form.Item>
        <Form.Item label="Photo URL" name="photoUrl">
          <Input />
        </Form.Item>
        <Form.Item label="Role" name="role">
          <Select options={[
            { value: 'user', label: 'User' },
            { value: 'admin', label: 'Admin' },
          ]} />
        </Form.Item>
      </Form>
    </Edit>
  );
}
