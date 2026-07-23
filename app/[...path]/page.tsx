import { getMenu, isMenuPublished } from '@/lib/menu';
import { getCompanyBySlug, getNodeByQRCode } from '@/lib/company';
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
  const branch = path[1];

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

  const published = await isMenuPublished(companySlug, branch);
  if (!published) {
    return <MenuNotAvailable />;
  }

  const sections = await getMenu(companySlug, branch);

  return (
    <MenuPage
      sections={sections}
      company={companySlug}
      branch={branch}
      companyName={company.name}
      logoUrl={company.logoUrl}
    />
  );
}
