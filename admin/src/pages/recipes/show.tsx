import { Show } from '@refinedev/antd';
import { useShow } from '@refinedev/core';
import { Descriptions, Tag } from 'antd';

export function RecipeShow() {
  const { queryResult } = useShow();
  const { data } = queryResult;
  const record = data?.data;

  return (
    <Show>
      <Descriptions column={2}>
        <Descriptions.Item label="Name">{record?.name}</Descriptions.Item>
        <Descriptions.Item label="Cuisine">{record?.cuisine}</Descriptions.Item>
        <Descriptions.Item label="Difficulty"><Tag>{record?.difficulty}</Tag></Descriptions.Item>
        <Descriptions.Item label="Published"><Tag color={record?.isPublished ? 'green' : 'red'}>{record?.isPublished ? 'Yes' : 'No'}</Tag></Descriptions.Item>
        <Descriptions.Item label="Rating">{record?.rating}</Descriptions.Item>
        <Descriptions.Item label="Prep (min)">{record?.prepTimeMinutes}</Descriptions.Item>
        <Descriptions.Item label="Cook (min)">{record?.cookTimeMinutes}</Descriptions.Item>
        <Descriptions.Item label="Category">{record?.category?.name}</Descriptions.Item>
        <Descriptions.Item label="Owner">{record?.owner?.displayName}</Descriptions.Item>
        <Descriptions.Item label="Ingredients" span={2}>{record?.ingredients?.join(', ')}</Descriptions.Item>
        <Descriptions.Item label="Instructions" span={2}>{record?.instructions?.map((i: string, idx: number) => `${idx + 1}. ${i}`).join('\n')}</Descriptions.Item>
        <Descriptions.Item label="Tags">{record?.tags?.map((t: string) => <Tag key={t}>{t}</Tag>)}</Descriptions.Item>
        <Descriptions.Item label="Meal Type">{record?.mealType?.map((m: string) => <Tag key={m}>{m}</Tag>)}</Descriptions.Item>
      </Descriptions>
    </Show>
  );
}
