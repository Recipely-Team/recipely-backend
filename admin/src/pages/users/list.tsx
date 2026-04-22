import { useTable, List, EditButton, DeleteButton } from '@refinedev/antd';
import { Table, Space, Tag } from 'antd';

export function UserList() {
  const { tableProps } = useTable({ resource: 'users' });

  return (
    <List>
      <Table {...tableProps} rowKey="id">
        <Table.Column dataIndex="displayName" title="Name" />
        <Table.Column dataIndex="email" title="Email" />
        <Table.Column dataIndex="role" title="Role" render={(r) => <Tag color={r === 'admin' ? 'blue' : 'default'}>{r}</Tag>} />
        <Table.Column dataIndex="createdAt" title="Created" render={(d) => new Date(d).toLocaleDateString()} />
        <Table.Column title="Actions" render={(_, record) => (
          <Space>
            <EditButton recordItemId={record.id} />
            <DeleteButton recordItemId={record.id} />
          </Space>
        )} />
      </Table>
    </List>
  );
}
