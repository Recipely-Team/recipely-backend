import { Edit, useForm, useSelect } from '@refinedev/antd';
import { Form, Input, InputNumber, Select, Switch } from 'antd';
import type { IRecipe } from './types';

export function RecipeEdit() {
  const { formProps, saveButtonProps } = useForm<IRecipe>();
  const { selectProps: categorySelectProps } = useSelect({ resource: 'categories', optionLabel: 'name' });

  return (
    <Edit saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item label="Name" name="name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Cuisine" name="cuisine" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Difficulty" name="difficulty" rules={[{ required: true }]}>
          <Select options={[
            { value: 'EASY', label: 'Easy' },
            { value: 'MEDIUM', label: 'Medium' },
            { value: 'HARD', label: 'Hard' },
          ]} />
        </Form.Item>
        <Form.Item label="Ingredients" name="ingredients">
          <Input.TextArea rows={4} placeholder="One per line" />
        </Form.Item>
        <Form.Item label="Instructions" name="instructions">
          <Input.TextArea rows={6} placeholder="One per line" />
        </Form.Item>
        <Form.Item label="Prep Time (min)" name="prepTimeMinutes">
          <InputNumber min={0} />
        </Form.Item>
        <Form.Item label="Cook Time (min)" name="cookTimeMinutes">
          <InputNumber min={0} />
        </Form.Item>
        <Form.Item label="Rating" name="rating">
          <InputNumber min={0} max={5} step={0.1} />
        </Form.Item>
        <Form.Item label="Image URL" name="image">
          <Input />
        </Form.Item>
        <Form.Item label="Tags" name="tags">
          <Input.TextArea rows={2} placeholder="One per line" />
        </Form.Item>
        <Form.Item label="Meal Type" name="mealType">
          <Input.TextArea rows={2} placeholder="One per line" />
        </Form.Item>
        <Form.Item label="Category" name="categoryId">
          <Select {...categorySelectProps} allowClear />
        </Form.Item>
        <Form.Item label="Published" name="isPublished" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Edit>
  );
}
