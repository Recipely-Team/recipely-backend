import { useTable, List, ShowButton, EditButton, DeleteButton } from '@refinedev/antd';
import { Table, Space, Tag } from 'antd';
import type { IRecipe } from './types';

export function RecipeList() {
  const { tableProps } = useTable<IRecipe>({ resource: 'recipes' });

  return (
    <List>
      <Table {...tableProps} rowKey="id">
        <Table.Column dataIndex="name" title="Name" />
        <Table.Column dataIndex="cuisine" title="Cuisine" />
        <Table.Column dataIndex="difficulty" title="Difficulty" render={(d) => <Tag>{d}</Tag>} />
        <Table.Column dataIndex="isPublished" title="Published" render={(v) => <Tag color={v ? 'green' : 'red'}>{v ? 'Yes' : 'No'}</Tag>} />
        <Table.Column dataIndex="rating" title="Rating" />
        <Table.Column title="Actions" render={(_, record) => (
          <Space>
            <ShowButton recordItemId={record.id} />
            <EditButton recordItemId={record.id} />
            <DeleteButton recordItemId={record.id} />
          </Space>
        )} />
      </Table>
    </List>
  );
}
