import React, { useState, useRef } from 'react';
import { flat } from 'adminjs';
import { type PropertyJSON, type OnPropertyChange } from 'adminjs';

interface ImageUploadProps {
  property: PropertyJSON;
  onChange: OnPropertyChange;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  record?: any;
}

declare const AdminJS: { env?: { BASE_URL?: string } };

export default function ImageUpload({ property, onChange, record }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const existingValue = flat.get(record?.params, property.path) as string || '';
  const [preview, setPreview] = useState<string>(existingValue);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('image', file);

    try {
      const baseUrl = AdminJS?.env?.BASE_URL ?? window.location.origin;
      const response = await fetch(`${baseUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }

      const data = await response.json();
      setPreview(data.url);
      onChange(property.name, data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    setPreview('');
    onChange(property.name, '');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ marginBottom: '8px', color: '#6c757d', fontSize: '14px', fontWeight: 500 }}>
        {property.name?.charAt(0).toUpperCase() + property.name?.slice(1).replace(/([A-Z])/g, ' $1')}
      </div>

      {preview && (
        <div style={{ marginBottom: '8px', position: 'relative', display: 'inline-block' }}>
          <img
            src={preview}
            alt="Preview"
            style={{
              maxWidth: '200px',
              maxHeight: '150px',
              borderRadius: '4px',
              border: '1px solid #dee2e6',
            }}
          />
          <button
            type="button"
            onClick={handleRemove}
            style={{
              position: 'absolute',
              top: '-8px',
              right: '-8px',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: '#dc3545',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12px',
              lineHeight: '24px',
              textAlign: 'center',
            }}
          >
            ✕
          </button>
        </div>
      )}

      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={uploading}
          style={{
            display: 'block',
            marginBottom: '8px',
          }}
        />
        {uploading && (
          <span style={{ color: '#6c757d', fontSize: '13px' }}>
            Uploading...
          </span>
        )}
        {error && (
          <span style={{ color: '#dc3545', fontSize: '13px' }}>
            {error}
          </span>
        )}
      </div>

      <div style={{ fontSize: '12px', color: '#adb5bd', marginTop: '4px' }}>
        Max 10MB • Images over 1920px will be resized
      </div>
    </div>
  );
}