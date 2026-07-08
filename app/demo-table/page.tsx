import { getMenu } from '@/lib/menu';
import MenuPage from '@/components/MenuPage';

export default async function DemoTablePage() {
  const sections = await getMenu();
  return <MenuPage sections={sections} />;
}
