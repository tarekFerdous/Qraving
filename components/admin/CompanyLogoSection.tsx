'use client';

import { useState, useRef } from 'react';
import { ImageIcon, Loader2 } from 'lucide-react';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '@/lib/firebase-client';

const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Company logo upload/replace/remove control.
 *
 * Shared between the company detail page (#165) and the company creation
 * flow (#166) — both persist logos via POST /api/admin/companies/{id}/logo
 * and upload the file to Storage at companies/{id}/logo/{filename} using the
 * same client-side validation (PNG only, 5MB max).
 */
export function CompanyLogoSection({
  companyId,
  logoUrl,
  onLogoChange,
}: {
  companyId: string;
  logoUrl: string | undefined;
  onLogoChange: (logoUrl: string | undefined) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  async function persistLogo(newLogoUrl: string) {
    const res = await fetch(`/api/admin/companies/${companyId}/logo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'set', logoUrl: newLogoUrl }),
    });

    if (!res.ok) {
      setError('Failed to save logo. Please try again.');
      return;
    }

    const data = await res.json() as { logoUrl: string; previousLogoUrl: string | null };
    onLogoChange(data.logoUrl);

    if (data.previousLogoUrl) {
      try {
        await deleteObject(ref(storage, data.previousLogoUrl));
      } catch {
        // Old file may already be gone; nothing else to do here.
      }
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);

    if (file.type !== 'image/png') {
      setError('Only PNG files are allowed.');
      return;
    }
    if (file.size > MAX_LOGO_SIZE_BYTES) {
      setError('File is too large. Maximum size is 5MB.');
      return;
    }

    setUploadProgress(0);

    const storagePath = `companies/${companyId}/logo/${file.name}`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        setUploadProgress(pct);
      },
      (err) => {
        console.error('Logo upload error:', err);
        setError('Upload failed. Please try again.');
        setUploadProgress(null);
      },
      async () => {
        const url = await getDownloadURL(uploadTask.snapshot.ref);
        await persistLogo(url);
        setUploadProgress(null);
      },
    );
  }

  async function handleRemove() {
    if (!confirm('Remove this logo?')) return;
    setRemoving(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/companies/${companyId}/logo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'remove' }),
      });

      if (!res.ok) {
        setError('Failed to remove logo. Please try again.');
        return;
      }

      const data = await res.json() as { previousLogoUrl: string | null };
      onLogoChange(undefined);

      if (data.previousLogoUrl) {
        try {
          await deleteObject(ref(storage, data.previousLogoUrl));
        } catch {
          // Old file may already be gone; nothing else to do here.
        }
      }
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
      <h2 className="text-sm font-medium text-gray-700 mb-4">Company logo</h2>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png"
        className="hidden"
        onChange={handleFileChange}
      />

      {logoUrl ? (
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt="Company logo"
            className="w-20 h-20 object-contain rounded-lg border border-gray-200 bg-gray-50"
          />
          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadProgress !== null || removing}
              className="text-xs bg-white border border-gray-200 px-3 py-1.5 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-60"
            >
              Replace
            </button>
            <button
              onClick={handleRemove}
              disabled={uploadProgress !== null || removing}
              className="text-xs bg-white border border-gray-200 px-3 py-1.5 rounded-lg font-medium text-red-600 hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-60"
            >
              {removing ? 'Removing…' : 'Remove'}
            </button>
          </div>
        </div>
      ) : uploadProgress !== null ? (
        <div className="w-full max-w-xs h-20 rounded-lg bg-gray-50 border border-gray-200 flex flex-col items-center justify-center gap-2">
          <Loader2 size={16} className="text-gray-400 animate-spin" />
          <div className="w-32 bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-gray-600 h-1.5 rounded-full transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 text-sm text-gray-500 border-2 border-dashed border-gray-200 rounded-lg px-4 py-3 hover:border-gray-400 hover:text-gray-700 transition-colors"
        >
          <ImageIcon size={16} />
          Upload logo (PNG, max 5MB)
        </button>
      )}

      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </div>
  );
}
