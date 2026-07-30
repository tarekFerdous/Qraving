import { getMenu, isMenuPublished } from '@/lib/menu';
import { getCompanyBySlug, getNodeByQRCode, resolveBranchNodeId } from '@/lib/company';
import MenuPage from '@/components/MenuPage';
import MenuNotAvailable from '@/components/MenuNotAvailable';
import LocationNotFound from '@/components/LocationNotFound';
import CompanyLocked from '@/components/CompanyLocked';

type CatchAllPageProps = {
  params: Promise<{ path: string[] }>;
};

export default async function CatchAllPage({ params }: CatchAllPageProps) {
  const { path } = await params;

  if (!path || path.length < 2) {
    return <LocationNotFound />;
  }

  const companySlug = path[0];
  const qrCode = path[path.length - 1];

  const company = await getCompanyBySlug(companySlug);
  if (!company) {
    return <LocationNotFound />;
  }

  if (company.locked) {
    return <CompanyLocked />;
  }

  const node = await getNodeByQRCode(company.id, qrCode);
  if (!node) {
    return <LocationNotFound />;
  }

  const branchId = await resolveBranchNodeId(company.id, node.id);

  const published = await isMenuPublished(company.id, branchId);
  if (!published) {
    return <MenuNotAvailable />;
  }

  const sections = await getMenu(company.id, branchId);

  return (
    <MenuPage
      sections={sections}
      company={company.id}
      branch={branchId}
      table={node.id}
      companyName={company.name}
      logoUrl={company.logoUrl}
    />
  );
}
