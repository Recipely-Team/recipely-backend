import React from 'react';
import { flat } from 'adminjs';

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  property: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  record: any;
}

export default function CategoryShow({ property, record }: Props) {
  const rawValue = flat.get(record.params, property.path);

  // Handle relation case (category object with nested name) vs direct ID
  let categoryName = '—';

  if (typeof rawValue === 'string' && rawValue.trim()) {
    // Direct category ID as string
    try {
      const parsed = JSON.parse(rawValue);
      categoryName = parsed['en'] || Object.values(parsed)[0] || rawValue;
    } catch {
      categoryName = rawValue;
    }
  } else if (rawValue && typeof rawValue === 'object') {
    // Relation object - check if it has params (AdminJS populate)
    const params = (rawValue as { params?: { name?: string } }).params;
    if (params?.name) {
      try {
        const parsed = JSON.parse(params.name);
        categoryName = parsed['en'] || Object.values(parsed)[0] || '—';
      } catch {
        categoryName = params.name;
      }
    } else {
      // Plain object without params - try to extract name from it
      const nameValue = (rawValue as Record<string, unknown>)['name'];
      if (typeof nameValue === 'string') {
        try {
          const parsed = JSON.parse(nameValue);
          categoryName = parsed['en'] || Object.values(parsed)[0] || '—';
        } catch {
          categoryName = nameValue;
        }
      } else if (nameValue && typeof nameValue === 'object') {
        const parsed = nameValue as Record<string, unknown>;
        categoryName = parsed['en'] ? String(parsed['en']) : (Object.values(parsed)[0] ? String(Object.values(parsed)[0]) : '—');
      }
    }
  }

  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ color: '#6c757d', fontSize: '12px', fontWeight: 500, marginBottom: '2px' }}>
        {property.name?.charAt(0).toUpperCase() + property.name?.slice(1).replace(/([A-Z])/g, ' $1')}
      </div>
      <div style={{ fontSize: '14px' }}>{categoryName}</div>
    </div>
  );
}