'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Plus } from 'lucide-react';

function toSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

interface Layer {
  label: string;
}

export default function NewCompanyPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [layers, setLayers] = useState<Layer[]>([{ label: 'Branch' }, { label: 'Area' }, { label: 'Table' }]);
  const [slugError, setSlugError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function handleNameChange(value: string) {
    setName(value);
    if (!slugEdited) {
      setSlug(toSlug(value));
    }
  }

  function handleSlugChange(value: string) {
    setSlugEdited(true);
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
    setSlugError('');
  }

  function addLayer() {
    setLayers((prev) => [...prev, { label: '' }]);
  }

  function removeLayer(index: number) {
    if (layers.length <= 3) return;
    setLayers((prev) => prev.filter((_, i) => i !== index));
  }

  function updateLayer(index: number, label: string) {
    setLayers((prev) => prev.map((l, i) => (i === index ? { label } : l)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSlugError('');

    if (!slug) {
      setSlugError('Slug is required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name,
          slug,
          layers: layers.map((l, i) => ({ index: i, label: l.label || `Layer ${i + 1}` })),
        }),
      });

      const data = await res.json() as { companyId?: string; error?: string };

      if (!res.ok) {
        if (data.error?.includes('slug')) {
          setSlugError(data.error);
        } else {
          setError(data.error ?? 'Something went wrong.');
        }
        setSubmitting(false);
        return;
      }

      router.push(`/qraving-admin-panel/companies/${data.companyId}`);
    } catch {
      setError('Network error. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">New Company</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Company name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            required
            placeholder="e.g. McDonald's"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">URL slug</label>
          <div className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 focus-within:border-gray-500 focus-within:ring-1 focus-within:ring-gray-500">
            <span className="text-sm text-gray-400 shrink-0">qraving.com/</span>
            <input
              type="text"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              required
              placeholder="mcdonalds"
              className="flex-1 text-sm outline-none"
            />
          </div>
          {slugError && <p className="mt-1 text-xs text-red-600">{slugError}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Venue hierarchy layers</label>
          <div className="space-y-2">
            {layers.map((layer, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-16 shrink-0">Layer {i + 1}</span>
                <input
                  type="text"
                  value={layer.label}
                  onChange={(e) => updateLayer(i, e.target.value)}
                  placeholder={`e.g. ${['Branch', 'Area', 'Table'][i] ?? 'Sub-level'}`}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
                />
                <button
                  type="button"
                  onClick={() => removeLayer(i)}
                  disabled={layers.length <= 3}
                  className="p-1.5 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addLayer}
            className="mt-3 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <Plus size={14} />
            Add layer
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-60"
          >
            {submitting ? 'Creating…' : 'Create company'}
          </button>
        </div>
      </form>
    </div>
  );
}
