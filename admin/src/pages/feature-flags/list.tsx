import { List } from '@refinedev/antd';
import { Table, Switch } from 'antd';
import { useTable } from '@refinedev/antd';
import { useNotification } from '@refinedev/core';

export function FeatureFlagList() {
  const { tableProps } = useTable({ resource: 'feature-flags' });
  const { open } = useNotification();

  const handleToggle = async (key: string, currentEnabled: boolean) => {
    try {
      const response = await fetch(`/api/v1/admin/feature-flags/${key}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ enabled: !currentEnabled }),
      });
      if (response.ok) {
        open?.({ type: 'success', message: 'Feature flag updated' });
      } else {
        open?.({ type: 'error', message: 'Failed to update feature flag' });
      }
    } catch {
      open?.({ type: 'error', message: 'Failed to update feature flag' });
    }
  };

  return (
    <List>
      <Table {...tableProps} rowKey="key">
        <Table.Column dataIndex="key" title="Key" />
        <Table.Column dataIndex="enabled" title="Enabled" render={(enabled: boolean, record: { key: string }) => (
          <Switch
            checked={enabled}
            onChange={() => handleToggle(record.key, enabled)}
          />
        )} />
      </Table>
    </List>
  );
}
