import { doc, setDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { partitionBasketsForReset } from '@/lib/session';
import type { UserBasket } from '@/lib/session';

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Resets a table's session directly against the client Firestore SDK, so it
 * can be called from any 'use client' component without needing
 * SessionProvider's React context — today that's the customer-facing
 * session-expiry flow (`lib/session-context.tsx`'s `resetSession`), and in a
 * follow-up (#200) an admin-triggered "Free the table" action.
 *
 * Performs, at `companies/{companyId}/branches/{branchId}/sessions/{sessionId}`:
 *   - Resets `userCounter` to 0, `orderStatus` to 'building', clears
 *     `paymentDeadline`/`paymentPlan`
 *   - Refreshes the activity/expiry window (`lastActivity` = now,
 *     `expiresAt` = now + 30 min)
 *   - Partitions the live `baskets` subcollection via
 *     `partitionBasketsForReset`: pending baskets are hard-deleted, paid
 *     baskets are archived to `archivedBaskets` then removed from `baskets`,
 *     and failed baskets are left untouched.
 *
 * Firestore write failures are swallowed (matching the pre-existing
 * fire-and-forget behavior of the inline reset this was extracted from) —
 * callers that need to know about failures should not rely on this
 * function's returned promise rejecting.
 */
export async function resetSessionInFirestore(
  companyId: string,
  branchId: string,
  sessionId: string,
  baskets: UserBasket[],
): Promise<void> {
  const sessionDoc = `companies/${companyId}/branches/${branchId}/sessions/${sessionId}`;
  const basketsCol = `${sessionDoc}/baskets`;
  const archivedBasketsCol = `${sessionDoc}/archivedBaskets`;

  const sessionRef = doc(db, sessionDoc);
  const writes: Promise<unknown>[] = [
    setDoc(
      sessionRef,
      {
        userCounter: 0,
        orderStatus: 'building',
        paymentDeadline: null,
        paymentPlan: null,
        lastActivity: serverTimestamp(),
        expiresAt: Timestamp.fromDate(new Date(Date.now() + SESSION_TIMEOUT_MS)),
      },
      { merge: true },
    ).catch(() => {}),
  ];

  // Clean up the live baskets subcollection by paymentStatus: drafts are
  // discarded, paid baskets are archived (preserved but hidden from the
  // fresh session), and failed-payment baskets are left untouched so the
  // app keeps prompting that diner to pay.
  const { toDelete, toArchive } = partitionBasketsForReset(baskets);

  for (const userId of toDelete) {
    writes.push(deleteDoc(doc(db, basketsCol, userId)).catch(() => {}));
  }

  for (const userId of toArchive) {
    const basket = baskets.find((b) => b.userId === userId);
    if (!basket) continue;
    const { userId: _userId, ...data } = basket;
    writes.push(
      setDoc(doc(db, archivedBasketsCol, userId), data)
        .then(() => deleteDoc(doc(db, basketsCol, userId)))
        .catch(() => {}),
    );
  }

  await Promise.all(writes);
}
