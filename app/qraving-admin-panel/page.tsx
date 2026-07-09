import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireRole } from '@/lib/auth-server';
import { getAllCompanies } from '@/lib/company';

export default async function AdminDashboardPage() {
  const auth = await requireRole('superadmin');
  if (!auth) redirect('/qraving-admin-panel/login');

  const companies = await getAllCompanies();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Companies</h1>
        <Link
          href="/qraving-admin-panel/companies/new"
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
        >
          + New Company
        </Link>
      </div>

      {companies.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-xl p-12 text-center text-gray-500">
          <p className="text-sm">No companies yet.</p>
          <Link href="/qraving-admin-panel/companies/new" className="mt-3 inline-block text-sm font-medium text-gray-900 underline underline-offset-2">
            Create your first company →
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {companies.map((company) => (
            <div key={company.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-medium text-gray-900">{company.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">/{company.slug}</p>
              </div>
              <div className="flex items-center gap-2">
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
      )}
    </div>
  );
}
