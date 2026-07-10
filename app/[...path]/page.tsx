/**
 * Catch-all route: captures every URL segment under /
 *
 * The `params.path` array holds each segment, e.g.:
 *   /foo/bar/baz  →  ["foo", "bar", "baz"]
 *   /a/b/c/d/e   →  ["a", "b", "c", "d", "e"]
 *
 * Downstream pages/components can destructure segments as needed
 * once the app grows (company / branch / table identifiers, etc.).
 */

import { getMenu, isMenuPublished } from '@/lib/menu';
import MenuPage from '@/components/MenuPage';
import MenuNotAvailable from '@/components/MenuNotAvailable';

type CatchAllPageProps = {
  params: Promise<{ path: string[] }>;
};

export default async function CatchAllPage({ params }: CatchAllPageProps) {
  const { path } = await params;

  const [company, branch, table, ...rest] = path ?? [];

  const published = await isMenuPublished(company, branch);

  if (!published) {
    return <MenuNotAvailable />;
  }

  const sections = await getMenu(company, branch);

  return <MenuPage sections={sections} company={company} branch={branch} />;
}
