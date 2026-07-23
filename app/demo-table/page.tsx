import { getMenu } from '@/lib/menu';
import MenuPage from '@/components/MenuPage';

export default async function DemoTablePage() {
  const sections = await getMenu('demo-company', 'demo-branch');
  return (
    <MenuPage
      sections={sections}
      company="demo-company"
      branch="demo-branch"
      companyName="Demo Restaurant"
    />
  );
}
