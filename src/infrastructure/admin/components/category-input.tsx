import React, { useState, useEffect } from 'react';
import { flat } from 'adminjs';
import { type PropertyJSON, type OnPropertyChange } from 'adminjs';

interface CategoryOption {
  id: string;
  name: string;
}

interface CategoryInputProps {
  property: PropertyJSON;
  onChange: OnPropertyChange;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  record?: any;
}

declare const AdminJS: { env?: { AVAILABLE_LANGUAGES?: string; BASE_URL?: string } };

export default function CategoryInput({ property, onChange, record }: CategoryInputProps) {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>('');

  useEffect(() => {
    const baseUrl = AdminJS?.env?.BASE_URL ?? window.location.origin;
    fetch(`${baseUrl}/admin/api/resources/Category/records?_perPage=100`)
      .then((res) => res.json())
      .then((data) => {
        if (data.records) {
          const opts = data.records.map((r: { id: string; params: { name?: string } }) => ({
            id: r.id,
            name: r.params.name ? JSON.parse(r.params.name)['en'] || Object.values(JSON.parse(r.params.name))[0] : r.id,
          }));
          setCategories(opts);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const currentValue = flat.get(record?.params, property.path) as string || '';

  useEffect(() => {
    setSelectedId(currentValue);
  }, [currentValue]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedId(value);
    onChange(property.name, value);
  };

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ marginBottom: '8px', color: '#6c757d', fontSize: '14px', fontWeight: 500 }}>
        {property.name?.charAt(0).toUpperCase() + property.name?.slice(1).replace(/([A-Z])/g, ' $1')}
      </div>
      {loading ? (
        <span style={{ color: '#6c757d', fontSize: '13px' }}>Loading...</span>
      ) : (
        <select
          value={selectedId}
          onChange={handleChange}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #ced4da',
            borderRadius: '4px',
            fontSize: '14px',
            backgroundColor: '#fff',
          }}
        >
          <option value="">— Select Category —</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}