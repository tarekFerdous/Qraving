import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireRole } from '@/lib/auth-server';
import { getAllCompanies } from '@/lib/company';
import { CompaniesList } from '@/components/admin/CompaniesList';

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
        // Firestore Timestamps are class instances and can't cross the Server -> Client Component
        // boundary; createdAt isn't used client-side, so drop it rather than serialize it.
        <CompaniesList initialCompanies={companies.map(({ createdAt, ...c }) => c)} />
      )}
    </div>
  );
}
