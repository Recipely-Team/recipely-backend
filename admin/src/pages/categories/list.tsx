import { useTable, List, EditButton, DeleteButton } from '@refinedev/antd';
import { Table, Space } from 'antd';

export function CategoryList() {
  const { tableProps } = useTable({ resource: 'categories' });

  return (
    <List>
      <Table {...tableProps} rowKey="id">
        <Table.Column dataIndex="name" title="Name" />
        <Table.Column dataIndex="slug" title="Slug" />
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
