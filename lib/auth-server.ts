import { cookies } from 'next/headers';
import { getAuth } from 'firebase-admin/auth';
import { adminDb } from '@/lib/firebase-admin';

export async function requireRole(
  role: string,
): Promise<{ uid: string; email: string; companyId?: string; branchId?: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('firebase-token')?.value;
  if (!token) return null;

  try {
    const decoded = await getAuth().verifyIdToken(token);
    if (decoded.role !== role) return null;
    return {
      uid: decoded.uid,
      email: decoded.email ?? '',
      companyId: decoded.companyId,
      branchId: decoded.branchId,
    };
  } catch {
    return null;
  }
}

export async function getUserDoc(uid: string) {
  const snap = await adminDb.doc(`users/${uid}`).get();
  return snap.data() ?? null;
}
