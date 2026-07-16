import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth-server';
import { getCompanyBySlug, getNodeChain, getDescendantNodes } from '@/lib/company';
import ManagerAdminPanel from './ManagerAdminPanel';

type Props = {
  params: Promise<{ companySlug: string; managerPath: string[] }>;
};

export default async function ManagerAdminPage({ params }: Props) {
  const { companySlug, managerPath } = await params;

  const auth = await requireRole('manager');
  if (!auth) {
    redirect(`/${companySlug}/login`);
  }

  const company = await getCompanyBySlug(companySlug);
  if (!company) {
    redirect(`/${companySlug}/login`);
  }

  const nodeChain = await getNodeChain(company.id, managerPath);
  if (nodeChain.length === 0) {
    redirect(`/${companySlug}/login`);
  }

  const managerNode = nodeChain[nodeChain.length - 1];
  const descendants = await getDescendantNodes(company.id, managerNode.id);
  const firstLeafLayerIndex = company.layers.findIndex((l) => l.isLeafLayer);

  return (
    <ManagerAdminPanel
      companyId={company.id}
      companyName={company.name}
      layers={company.layers}
      managerNodeId={managerNode.id}
      ancestorLabels={nodeChain.map((n) => n.label)}
      initialDescendants={descendants}
      firstLeafLayerIndex={firstLeafLayerIndex === -1 ? company.layers.length - 1 : firstLeafLayerIndex}
    />
  );
}
