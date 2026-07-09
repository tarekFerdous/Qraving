import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON in .env.local');

const app = getApps().length ? getApp() : initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
const adminAuth = getAuth(app);
const db = getFirestore(app);

async function seed() {
  const email = process.env.SUPERADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error('SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD must be set in .env.local');
  }

  let uid: string;
  try {
    const existing = await adminAuth.getUserByEmail(email);
    uid = existing.uid;
    console.log(`Superadmin already exists: ${email} (${uid})`);
  } catch {
    const user = await adminAuth.createUser({ email, password });
    uid = user.uid;
    console.log(`Created superadmin user: ${email} (${uid})`);
  }

  await adminAuth.setCustomUserClaims(uid, { role: 'superadmin' });

  await db.doc(`users/${uid}`).set(
    {
      role: 'superadmin',
      email,
      companyId: null,
      branchId: null,
      companySlug: null,
      createdAt: Timestamp.now(),
    },
    { merge: true },
  );

  console.log('Superadmin role and Firestore doc set successfully.');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
