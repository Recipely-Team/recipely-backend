import React, { useState } from 'react';
import { ApiClient, ViewHelpers } from 'adminjs';

// The one User action that needs a form: suspend takes a free-text reason, so
// unlike approve/reject/unsuspend (plain confirm-and-POST, `component: false`)
// it needs a page to capture that reason before submitting. Mirrors
// RelatedRecordsPanel in using ApiClient directly rather than AdminJS's default
// per-property inputs, which only make sense inside edit/new forms.

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  record: any;
  resource: { id: string };
}

const api = new ApiClient();

export default function SuspendUserAction({ record, resource }: Props) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recordId = String(record?.id ?? '');
  const showUrl = new ViewHelpers().showUrl(resource.id, recordId);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await api.recordAction({
        resourceId: resource.id,
        recordId,
        actionName: 'suspend',
        data: { reason },
      });
      window.location.href = showUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to suspend user');
      setSubmitting(false);
    }
  };

  if (!recordId) {
    return <span style={{ color: '#6c757d' }}>No record</span>;
  }

  return (
    <div style={{ padding: '24px', maxWidth: '480px' }}>
      <h3 style={{ margin: '0 0 8px' }}>Suspend user</h3>
      <p style={{ color: '#8CA0BC', fontSize: '13px', marginBottom: '16px' }}>
        The account will be signed out on its next request and rejected until unsuspended. This does
        not delete anything.
      </p>
      <label htmlFor="suspend-reason" style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
        Reason (optional, visible to admins only)
      </label>
      <textarea
        id="suspend-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        style={{ width: '100%', marginBottom: '16px', padding: '8px', boxSizing: 'border-box' }}
      />
      {error && <div style={{ color: '#F28B82', marginBottom: '12px' }}>{error}</div>}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" onClick={submit} disabled={submitting}>
          {submitting ? 'Suspending…' : 'Suspend'}
        </button>
        <a href={showUrl} style={{ padding: '8px 12px' }}>
          Cancel
        </a>
      </div>
    </div>
  );
}
