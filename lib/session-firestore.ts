import { adminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { Session, UserBasket, createSession } from '@/lib/session';

const COMPANY_ID = 'demo-company';
const BRANCH_ID = 'demo-branch';

function sessionDocPath(sessionId: string): string {
  return `companies/${COMPANY_ID}/branches/${BRANCH_ID}/sessions/${sessionId}`;
}

function basketsColPath(sessionId: string): string {
  return `${sessionDocPath(sessionId)}/baskets`;
}

export async function getSession(sessionId: string): Promise<Session> {
  const [sessionSnap, basketsSnap] = await Promise.all([
    adminDb.doc(sessionDocPath(sessionId)).get(),
    adminDb.collection(basketsColPath(sessionId)).get(),
  ]);

  if (!sessionSnap.exists) return createSession(sessionId);

  const data = sessionSnap.data()!;
  const baskets: UserBasket[] = basketsSnap.docs.map((d) => ({
    userId: d.id,
    ...(d.data() as Omit<UserBasket, 'userId'>),
  }));

  return {
    id: sessionId,
    userCounter: data.userCounter ?? 0,
    orderStatus: data.orderStatus ?? 'building',
    paymentDeadline:
      data.paymentDeadline instanceof Timestamp
        ? data.paymentDeadline.toDate().toISOString()
        : (data.paymentDeadline as string | null) ?? null,
    paymentPlan: (data.paymentPlan as Session['paymentPlan'] | undefined) ?? null,
    baskets,
  };
}

export async function setSession(sessionId: string, session: Session): Promise<void> {
  const batch = adminDb.batch();

  batch.set(
    adminDb.doc(sessionDocPath(sessionId)),
    {
      orderStatus: session.orderStatus,
      paymentDeadline: session.paymentDeadline
        ? Timestamp.fromDate(new Date(session.paymentDeadline))
        : null,
      paymentPlan: session.paymentPlan,
      userCounter: session.userCounter,
    },
    { merge: true },
  );

  for (const basket of session.baskets) {
    const { userId, ...data } = basket;
    batch.set(adminDb.doc(`${basketsColPath(sessionId)}/${userId}`), data);
  }

  await batch.commit();
}
