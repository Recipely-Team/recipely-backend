import { useTable, List, DeleteButton } from '@refinedev/antd';
import { Table } from 'antd';

export function FavoriteList() {
  const { tableProps } = useTable({ resource: 'favorites' });

  return (
    <List>
      <Table {...tableProps} rowKey="id">
        <Table.Column dataIndex={['user', 'displayName']} title="User" />
        <Table.Column dataIndex={['user', 'email']} title="Email" />
        <Table.Column dataIndex={['recipe', 'name']} title="Recipe" />
        <Table.Column dataIndex="createdAt" title="Added" render={(d) => new Date(d).toLocaleDateString()} />
        <Table.Column title="Actions" render={(_, record) => (
          <DeleteButton recordItemId={`${record.userId}-${record.recipeId}`} />
        )} />
      </Table>
    </List>
  );
}
