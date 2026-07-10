'use client';

import { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { useRouter, useParams } from 'next/navigation';
import { auth, db } from '@/lib/firebase-client';
import { setFirebaseTokenCookie } from '@/lib/auth';

export default function ManagerLoginPage() {
  const router = useRouter();
  const params = useParams();
  const companySlug = params.companySlug as string;

  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadCompany() {
      const snap = await getDocs(query(collection(db, 'companies'), where('slug', '==', companySlug)));
      if (!snap.empty) {
        setCompanyName(snap.docs[0].data().name as string);
      }
    }
    loadCompany();
  }, [companySlug]);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) return;
      const userDoc = await getDoc(doc(db, `users/${user.uid}`));
      const data = userDoc.data();
      if (data?.role === 'manager' && data?.companySlug === companySlug && data?.branchSlug) {
        router.replace(`/${companySlug}/${data.branchSlug}`);
      }
    });
    return unsubscribe;
  }, [companySlug, router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const userDoc = await getDoc(doc(db, `users/${credential.user.uid}`));
      const data = userDoc.data();

      if (data?.role !== 'manager' || data?.companySlug !== companySlug) {
        await signOut(auth);
        setError('You are not authorized for this company.');
        setLoading(false);
        return;
      }

      const token = await credential.user.getIdToken();
      setFirebaseTokenCookie(token);
      router.replace(`/${companySlug}/${data.branchSlug}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      if (
        msg.includes('invalid-credential') ||
        msg.includes('wrong-password') ||
        msg.includes('user-not-found')
      ) {
        setError('Invalid email or password.');
      } else {
        setError(msg);
      }
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">{companyName || 'Qraving'}</h1>
          <p className="mt-1 text-sm text-gray-500">Manager Login</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-gray-900 text-white py-2.5 text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
