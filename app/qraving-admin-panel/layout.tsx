'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { signOut } from 'firebase/auth';
import Link from 'next/link';
import { auth } from '@/lib/firebase-client';
import { useAuth, clearFirebaseTokenCookie } from '@/lib/auth';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isLoginPage = pathname === '/qraving-admin-panel/login';

  useEffect(() => {
    if (loading) return;
    if (!isLoginPage && (!user || role !== 'superadmin')) {
      router.replace('/qraving-admin-panel/login');
    }
  }, [user, role, loading, isLoginPage, router]);

  async function handleSignOut() {
    clearFirebaseTokenCookie();
    await signOut(auth);
    router.replace('/qraving-admin-panel/login');
  }

  if (isLoginPage) {
    return (
      <div className="fixed inset-0 overflow-y-auto bg-gray-50">
        {children}
      </div>
    );
  }

  if (loading || !user || role !== 'superadmin') {
    return <div className="fixed inset-0 flex items-center justify-center bg-gray-50 text-gray-500 text-sm">Loading…</div>;
  }

  return (
    <div className="fixed inset-0 flex bg-gray-50">
      <aside className="w-56 shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-5 py-5 border-b border-gray-100">
          <span className="text-lg font-bold text-gray-900">Qraving</span>
          <p className="text-xs text-gray-400 mt-0.5">Admin Panel</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <Link
            href="/qraving-admin-panel"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Companies
          </Link>
        </nav>
        <div className="p-3 border-t border-gray-100">
          <button
            onClick={handleSignOut}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">
        {children}
      </main>
    </div>
  );
}
