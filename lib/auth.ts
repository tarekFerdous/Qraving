'use client';

import { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase-client';

export type UserRole = 'superadmin' | 'manager' | null;

export interface AuthState {
  user: User | null;
  role: UserRole;
  companyId: string | null;
  branchId: string | null;
  companySlug: string | null;
  loading: boolean;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    role: null,
    companyId: null,
    branchId: null,
    companySlug: null,
    loading: true,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ user: null, role: null, companyId: null, branchId: null, companySlug: null, loading: false });
        return;
      }
      const userDoc = await getDoc(doc(db, `users/${user.uid}`));
      const data = userDoc.data();
      setState({
        user,
        role: (data?.role as UserRole) ?? null,
        companyId: data?.companyId ?? null,
        branchId: data?.branchId ?? null,
        companySlug: data?.companySlug ?? null,
        loading: false,
      });
    });
    return unsubscribe;
  }, []);

  return state;
}

export async function setFirebaseTokenCookie(token: string) {
  document.cookie = `firebase-token=${token}; path=/; max-age=3600; SameSite=Lax`;
}

export function clearFirebaseTokenCookie() {
  document.cookie = 'firebase-token=; path=/; max-age=0';
}
