import { getMenu } from '@/lib/menu';
import MenuPage from '@/components/MenuPage';

// Read the menu per request, not once at build time, so menu edits show up
// without a redeploy (and the build never needs live Firestore access).
export const dynamic = 'force-dynamic';

export default async function DemoTablePage() {
  const sections = await getMenu('demo-company', 'demo-branch');
  return (
    <MenuPage
      sections={sections}
      company="demo-company"
      branch="demo-branch"
      table="demo-table-1"
      companyName="Demo Restaurant"
    />
  );
}
