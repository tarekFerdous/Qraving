'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Company } from '@/lib/company';

export function CompaniesList({ initialCompanies }: { initialCompanies: Company[] }) {
  const [companies, setCompanies] = useState<Company[]>(initialCompanies);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  async function handleRestore(companyId: string) {
    if (!window.confirm('Restore this company? It will become active again and its managers will regain access.')) {
      return;
    }

    setRestoringId(companyId);

    const res = await fetch(`/api/admin/companies/${companyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'restore' }),
    });

    if (res.ok) {
      setCompanies((prev) => prev.map((c) => (c.id === companyId ? { ...c, locked: false } : c)));
    }

    setRestoringId(null);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
      {companies.map((company) => (
        <div key={company.id} className="flex items-center justify-between px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-gray-900">{company.name}</p>
              {company.locked && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-medium">
                  Locked
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">/{company.slug}</p>
          </div>
          <div className="flex items-center gap-2">
            {company.locked && (
              <button
                onClick={() => handleRestore(company.id)}
                disabled={restoringId === company.id}
                className="px-3 py-1.5 text-xs font-medium text-green-700 border border-green-200 rounded-lg hover:bg-green-50 transition-colors disabled:opacity-60"
              >
                {restoringId === company.id ? 'Restoring…' : 'Restore'}
              </button>
            )}
            <Link
              href={`/qraving-admin-panel/companies/${company.id}/managers`}
              className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Managers
            </Link>
            <Link
              href={`/qraving-admin-panel/companies/${company.id}`}
              className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 transition-colors"
            >
              View
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
