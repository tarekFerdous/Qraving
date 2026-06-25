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

import { getMenu } from '@/lib/menu';
import MenuPage from '@/components/MenuPage';

type CatchAllPageProps = {
  params: Promise<{ path: string[] }>;
};

export default async function CatchAllPage({ params }: CatchAllPageProps) {
  const { path } = await params;

  // Expose segments for future use (company, branch, table, etc.)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [company, branch, table, ...rest] = path ?? [];

  const sections = await getMenu();

  return <MenuPage sections={sections} />;
}
