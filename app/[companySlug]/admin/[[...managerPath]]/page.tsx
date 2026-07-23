import { notFound, redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth-server';
import { getCompanyBySlug, getNodeChain, getDescendantNodes, resolveBranchNode } from '@/lib/company';
import ManagerAdminPanel from './ManagerAdminPanel';
import AdminShell from './AdminShell';

type Props = {
  params: Promise<{ companySlug: string; managerPath?: string[] }>;
};

export default async function ManagerAdminPage({ params }: Props) {
  const { companySlug, managerPath } = await params;
  const pathSegments = managerPath ?? [];

  const superadminAuth = await requireRole('superadmin');
  const managerAuth = await requireRole('manager');

  if (!superadminAuth && !managerAuth) {
    redirect(`/${companySlug}/login`);
  }

  const company = await getCompanyBySlug(companySlug);
  if (!company) {
    redirect(`/${companySlug}/login`);
  }

  if (company.locked) {
    redirect(`/${companySlug}/login`);
  }

  if (superadminAuth) {
    const nodeChain = await getNodeChain(company.id, pathSegments);
    if (nodeChain.length === 0) {
      redirect(`/${companySlug}/login`);
    }

    const managerNode = nodeChain[nodeChain.length - 1];
    const descendants = await getDescendantNodes(company.id, managerNode.id);
    const firstLeafLayerIndex = company.layers.findIndex((l) => l.isLeafLayer);

    // Firestore Timestamps are class instances and can't cross the Server -> Client Component
    // boundary; createdAt isn't used client-side, so drop it rather than serialize it.
    const serializedDescendants = descendants.map(({ createdAt, ...node }) => node);

    return (
      <ManagerAdminPanel
        companyId={company.id}
        companyName={company.name}
        layers={company.layers}
        managerNodeId={managerNode.id}
        ancestorLabels={nodeChain.map((n) => n.label)}
        initialDescendants={serializedDescendants}
        firstLeafLayerIndex={firstLeafLayerIndex === -1 ? company.layers.length - 1 : firstLeafLayerIndex}
      />
    );
  }

  // Manager path: only the pathless /[companySlug]/admin URL is valid — a manager is
  // always scoped to their own branch, never to an arbitrary slug chain.
  if (pathSegments.length > 0) {
    notFound();
  }

  const branchId = managerAuth!.branchId;
  const branchResolution = branchId ? await resolveBranchNode(company.id, branchId) : null;

  if (!branchId || !branchResolution || branchResolution.status !== 'ok') {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <h1 className="text-base font-bold text-gray-900 leading-tight">{company.name}</h1>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 text-sm text-gray-600">
            Your assigned branch is not available. Contact your administrator.
          </div>
        </main>
      </div>
    );
  }

  const managerNode = branchResolution.node;
  const descendants = await getDescendantNodes(company.id, managerNode.id);
  const firstLeafLayerIndex = company.layers.findIndex((l) => l.isLeafLayer);

  // Firestore Timestamps are class instances and can't cross the Server -> Client Component
  // boundary; createdAt isn't used client-side, so drop it rather than serialize it.
  const serializedDescendants = descendants.map(({ createdAt, ...node }) => node);

  return (
    <AdminShell
      companySlug={companySlug}
      companyId={company.id}
      branchId={branchId}
      companyName={company.name}
      branchName={managerNode.label}
      layers={company.layers}
      managerNodeId={managerNode.id}
      ancestorLabels={[managerNode.label]}
      initialDescendants={serializedDescendants}
      firstLeafLayerIndex={firstLeafLayerIndex === -1 ? company.layers.length - 1 : firstLeafLayerIndex}
    />
  );
}
