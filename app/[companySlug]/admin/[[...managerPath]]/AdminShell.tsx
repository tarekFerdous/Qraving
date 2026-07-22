'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase-client';
import { clearFirebaseTokenCookie } from '@/lib/auth';
import type { LayerConfig, CompanyNode } from '@/lib/company';
import ManagerAdminPanel, { STRUCTURE_EXPANDED_STORAGE_PREFIX } from './ManagerAdminPanel';
import DashboardTab from './DashboardTab';
import MenuTab from './MenuTab';

const TABS = ['dashboard', 'menu', 'structure'] as const;
type Tab = (typeof TABS)[number];

function isValidTab(value: string | null): value is Tab {
  return value !== null && (TABS as readonly string[]).includes(value);
}

interface AdminShellProps {
  companySlug: string;
  companyId: string;
  branchId: string;
  companyName: string;
  branchName: string;
  layers: LayerConfig[];
  managerNodeId: string;
  ancestorLabels: string[];
  initialDescendants: Omit<CompanyNode, 'createdAt'>[];
  firstLeafLayerIndex: number;
}

export default function AdminShell({
  companySlug,
  companyId,
  branchId,
  companyName,
  branchName,
  layers,
  managerNodeId,
  ancestorLabels,
  initialDescendants,
  firstLeafLayerIndex,
}: AdminShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawTab = searchParams.get('tab');
  const activeTab: Tab = isValidTab(rawTab) ? rawTab : 'dashboard';

  function selectTab(tab: Tab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`/${companySlug}/admin?${params.toString()}`, { scroll: false });
  }

  function clearStructureCollapseState() {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(STRUCTURE_EXPANDED_STORAGE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
  }

  async function handleSignOut() {
    clearFirebaseTokenCookie();
    clearStructureCollapseState();
    await signOut(auth);
    router.replace(`/${companySlug}/login`);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-base font-bold text-gray-900 leading-tight truncate">{companyName}</h1>
              <p className="text-xs text-gray-400 truncate">{branchName}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="shrink-0 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Sign out
            </button>
          </div>

          <nav className="flex items-center gap-1 mt-3" role="tablist">
            <button
              role="tab"
              aria-selected={activeTab === 'dashboard'}
              onClick={() => selectTab('dashboard')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'dashboard' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              Dashboard
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'menu'}
              onClick={() => selectTab('menu')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'menu' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              Menu
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'structure'}
              onClick={() => selectTab('structure')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'structure' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              Structure
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <div data-tab-panel="dashboard" style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }}>
          <DashboardTab
            companyId={companyId}
            branchId={branchId}
            companyName={companyName}
            branchName={branchName}
          />
        </div>

        <div data-tab-panel="menu" style={{ display: activeTab === 'menu' ? 'block' : 'none' }}>
          <MenuTab companyId={companyId} branchId={branchId} />
        </div>

        <div data-tab-panel="structure" style={{ display: activeTab === 'structure' ? 'block' : 'none' }}>
          <ManagerAdminPanel
            companyId={companyId}
            companyName={companyName}
            layers={layers}
            managerNodeId={managerNodeId}
            ancestorLabels={ancestorLabels}
            initialDescendants={initialDescendants}
            firstLeafLayerIndex={firstLeafLayerIndex}
          />
        </div>
      </main>
    </div>
  );
}
