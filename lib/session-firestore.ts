import { adminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { Session, UserBasket, createSession } from '@/lib/session';

function sessionDocPath(companyId: string, branchId: string, sessionId: string): string {
  return `companies/${companyId}/branches/${branchId}/sessions/${sessionId}`;
}

function basketsColPath(companyId: string, branchId: string, sessionId: string): string {
  return `${sessionDocPath(companyId, branchId, sessionId)}/baskets`;
}

export async function getSession(
  companyId: string,
  branchId: string,
  sessionId: string,
): Promise<Session> {
  const [sessionSnap, basketsSnap] = await Promise.all([
    adminDb.doc(sessionDocPath(companyId, branchId, sessionId)).get(),
    adminDb.collection(basketsColPath(companyId, branchId, sessionId)).get(),
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

export async function setSession(
  companyId: string,
  branchId: string,
  sessionId: string,
  session: Session,
): Promise<void> {
  const batch = adminDb.batch();

  batch.set(
    adminDb.doc(sessionDocPath(companyId, branchId, sessionId)),
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
    batch.set(adminDb.doc(`${basketsColPath(companyId, branchId, sessionId)}/${userId}`), data);
  }

  await batch.commit();
}
