'use client';

import { useState, useEffect, useMemo } from 'react';
import { MenuSection, MenuItem } from '@/lib/menu';
import { deriveCacheKey, readMenuCache, writeMenuCache, prefetchMenuImages } from '@/lib/menu-cache';
import { db } from '@/lib/firebase-client';
import { collection, onSnapshot } from 'firebase/firestore';
import SectionNavigator from '@/components/SectionNavigator';
import AddToCartSheet from '@/components/AddToCartSheet';
import BasketsSheet from '@/components/BasketsSheet';
import CheckoutSheet from '@/components/CheckoutSheet';
import PaymentPlanSheet from '@/components/PaymentPlanSheet';
import SharerSelectionSheet from '@/components/SharerSelectionSheet';
import { useSession } from '@/lib/session-context';
import { useRemovedItemsToast } from '@/components/RemovedItemsToast';
import { isSessionClosed, hasUnresolvedSharedItems, updateItemSharers, UserBasket } from '@/lib/session';
import Image from 'next/image';

interface MenuPageProps {
  sections: MenuSection[];
  company: string;
  branch: string;
  companyName: string;
  logoUrl?: string;
}

export default function MenuPage({ sections, company, branch, companyName, logoUrl }: MenuPageProps) {
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [logoError, setLogoError] = useState(false);
  const [basketsOpen, setBasketsOpen] = useState(false);
  const [modifyBasketId, setModifyBasketId] = useState<string | null>(null);
  const [awaitingTurn, setAwaitingTurn] = useState(false);
  const [checkoutBasket, setCheckoutBasket] = useState<UserBasket | null>(null);
  const [planBasket, setPlanBasket] = useState<UserBasket | null>(null);
  const [sharerBasket, setSharerBasket] = useState<UserBasket | null>(null);
  const [availabilityMap, setAvailabilityMap] = useState<Map<string, boolean>>(new Map());
  const [cachedSections, setCachedSections] = useState<MenuSection[] | null>(() => {
    if (typeof window === 'undefined') return null;
    const cacheKey = deriveCacheKey(company, branch);
    return readMenuCache(cacheKey);
  });
  const { session, updateSession, isExpired, resetSession, itemsRemovedExternally, clearItemsRemovedExternally } = useSession();
  const basketCount = session.baskets.length;
  // Once the session has been submitted to the kitchen it's closed: no more
  // items can be added client-side. The table re-scans the QR code to start
  // a fresh session (that flow is pre-existing / out of scope here).
  const sessionClosed = isSessionClosed(session);

  const { trigger: triggerRemovedToast, Toast: RemovedToast } = useRemovedItemsToast();

  // Show a toast whenever the manager removes an item that was in a cart
  useEffect(() => {
    if (itemsRemovedExternally) {
      triggerRemovedToast();
      clearItemsRemovedExternally();
    }
  }, [itemsRemovedExternally, triggerRemovedToast, clearItemsRemovedExternally]);

  useEffect(() => {
    const ref = collection(db, `companies/${company}/branches/${branch}/menuItems`);
    const unsub = onSnapshot(ref, (snap) => {
      const map = new Map<string, boolean>();
      for (const doc of snap.docs) {
        map.set(doc.id, (doc.data() as { isAvailable: boolean }).isAvailable);
      }
      setAvailabilityMap(map);
    });
    return unsub;
  }, [company, branch]);

  // Persist menu to sessionStorage and pre-warm image cache on first render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const cacheKey = deriveCacheKey(company, branch);
    writeMenuCache(cacheKey, sections);
    prefetchMenuImages(sections);
    setCachedSections(sections);
  }, []);

  const displaySections = useMemo(() => {
    const source = cachedSections ?? sections;
    return source.map((s) => ({
      ...s,
      items: s.items.map((item) => {
        const liveAvailable = availabilityMap.get(item.id);
        const isAvailable = liveAvailable !== undefined
          ? item.isAvailable && liveAvailable
          : item.isAvailable;
        if (isAvailable === item.isAvailable) return item;
        return { ...item, isAvailable };
      }),
    }));
  }, [cachedSections, sections, availabilityMap]);

  // Flatten all menu items for basket total computation in CheckoutSheet
  const menuItems = displaySections.flatMap((s) => s.items);

  // Single choke point for entering payment: first resolve any shared items
  // this basket added but hasn't assigned sharers for yet, then (when the
  // table has 2+ non-empty baskets and no paymentPlan has been chosen yet)
  // show the plan choice screen, then finally open the existing per-basket
  // CheckoutSheet — no behavior change for the no-shared-items, single-payer
  // case.
  function requestCheckout(basket: UserBasket) {
    // Re-resolve from session state — the basket passed in (e.g. straight
    // from AddToCartSheet's onFinish) may be a snapshot taken before any
    // sharer resolution just landed.
    const liveBasket = session.baskets.find((b) => b.userId === basket.userId) ?? basket;

    if (hasUnresolvedSharedItems(liveBasket)) {
      setSharerBasket(liveBasket);
      return;
    }

    const nonEmptyCount = session.baskets.filter((b) => b.items.length > 0).length;
    if (nonEmptyCount >= 2 && session.paymentPlan === null) {
      setPlanBasket(liveBasket);
    } else {
      setCheckoutBasket(liveBasket);
    }
  }

  // The specific unresolved shared item currently being resolved for
  // sharerBasket (one at a time — if a basket has multiple unresolved shared
  // items, resolving one re-triggers this to surface the next).
  const pendingSharedItem = sharerBasket
    ? sharerBasket.items.find((i) => i.isShared && i.sharerIds === null) ?? null
    : null;

  return (
    <div className="flex flex-col h-dvh lg:h-full overflow-hidden bg-qraving-bg">
      {/* Co-branded sticky header — blends into the app background, no separator */}
      <header className="sticky top-0 z-20 h-14 flex items-center justify-between px-4 bg-qraving-bg shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-xl shrink-0 text-qraving-red">
            Qraving
          </span>
          <span className="text-gray-400 font-medium shrink-0">×</span>
          {logoUrl && !logoError ? (
            <Image
              src={logoUrl}
              alt={companyName}
              width={160}
              height={28}
              className="h-7 w-auto max-w-[160px] object-contain"
              onError={() => setLogoError(true)}
              priority
            />
          ) : (
            <span className="font-bold text-xl text-gray-800 truncate">
              {companyName}
            </span>
          )}
        </div>

        {/* Baskets button with badge */}
        <button
          type="button"
          onClick={() => setBasketsOpen(true)}
          className="relative flex items-center gap-1.5 text-sm font-semibold text-qraving-red shrink-0 ml-4"
          aria-label={`Baskets${basketCount > 0 ? ` (${basketCount})` : ''}`}
        >
          Baskets
          {basketCount > 0 && (
            <span className="absolute -top-1.5 -right-3 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-qraving-red text-white text-[10px] font-bold leading-none px-1">
              {basketCount}
            </span>
          )}
        </button>
      </header>

      {/* Body — fills remaining height. The live category name is folded into
          each section's content inside the navigator, so it snaps in with the
          category rather than living in a static band here. */}
      <div className="flex-1 overflow-hidden">
        <SectionNavigator
          sections={displaySections}
          onAddToCart={(item) => {
            // Single choke point: once the session is submitted, no new items
            // can be added — block opening the sheet at all.
            if (sessionClosed) return;
            setSelectedItem(item);
          }}
        />
      </div>

      {/* Fixed overlays */}
      <AddToCartSheet
        item={selectedItem}
        editBasketUserId={modifyBasketId}
        onClose={() => { setSelectedItem(null); setModifyBasketId(null); }}
        onPass={() => {
          setSelectedItem(null);
          setAwaitingTurn(true);
        }}
        onFinish={(basket) => {
          // Finish routes into checkout instead of resetting the session —
          // the session only closes once payment completes (orderStatus
          // flips to 'submitted' via the webhook/callback routes).
          setSelectedItem(null);
          requestCheckout(basket);
        }}
        onAddAnotherItem={() => setModifyBasketId(null)}
      />
      <BasketsSheet
        open={basketsOpen}
        onClose={() => setBasketsOpen(false)}
        onModify={(userId) => {
          setBasketsOpen(false);
          setModifyBasketId(userId);
        }}
        onProceedToPayment={(basket) => {
          setBasketsOpen(false);
          requestCheckout(basket);
        }}
      />

      {/* Sharer selection — shown before payment-plan/checkout whenever the
          basket has an item flagged isShared with no sharer list resolved
          yet. Resolves one item at a time; resolving the last one falls
          through to requestCheckout's next gate. */}
      {sharerBasket && pendingSharedItem && (
        <SharerSelectionSheet
          basket={sharerBasket}
          item={pendingSharedItem}
          session={session}
          onClose={() => setSharerBasket(null)}
          onConfirm={(sharerIds) => {
            const updatedBasket = updateItemSharers(sharerBasket, pendingSharedItem.itemId, sharerIds);
            const updatedSession = {
              ...session,
              baskets: session.baskets.map((b) =>
                b.userId === updatedBasket.userId ? updatedBasket : b,
              ),
            };
            updateSession(updatedSession);

            if (hasUnresolvedSharedItems(updatedBasket)) {
              // Another shared item on this same basket still needs sharers.
              setSharerBasket(updatedBasket);
            } else {
              setSharerBasket(null);
              requestCheckout(updatedBasket);
            }
          }}
        />
      )}

      {/* Payment plan choice — only shown once, before checkout, when the
          table has 2+ non-empty baskets and no plan has been chosen yet. */}
      {planBasket && (
        <PaymentPlanSheet
          session={session}
          menuItems={menuItems}
          onClose={() => setPlanBasket(null)}
          onConfirm={(plan) => {
            updateSession({ ...session, paymentPlan: plan });
            setCheckoutBasket(planBasket);
            setPlanBasket(null);
          }}
        />
      )}

      {/* Checkout sheet — opened per-basket from BasketsSheet */}
      {checkoutBasket && (
        <CheckoutSheet
          session={session}
          basket={checkoutBasket}
          menuItems={menuItems}
          onClose={() => setCheckoutBasket(null)}
          companyId={company}
          branchId={branch}
        />
      )}

      {/* "Start your turn" full-screen interstitial */}
      {awaitingTurn && (
        <div className="fixed inset-0 z-60 bg-white flex flex-col items-center justify-center gap-6 px-8">
          <h1 className="text-3xl font-bold text-gray-900 text-center">Start your turn</h1>
          <button
            type="button"
            onClick={() => setAwaitingTurn(false)}
            className="px-10 py-3 rounded-xl bg-qraving-red text-white text-base font-bold transition-opacity active:opacity-80"
          >
            Start
          </button>
        </div>
      )}

      {/* "Your baskets will be ready soon" terminal overlay — driven by the
          realtime session.orderStatus, so every device in the session sees
          it once the order is actually submitted, not just the payer. */}
      {sessionClosed && (
        <div className="fixed inset-0 z-60 bg-white flex flex-col items-center justify-center gap-4 px-8">
          <h1 className="text-2xl font-bold text-gray-900 text-center">
            Your baskets will be ready soon.
          </h1>
          <p className="text-sm text-gray-500 text-center">
            You can always re-scan the QR code to order more items.
          </p>
        </div>
      )}

      {/* Session expired */}
      {isExpired && (
        <div className="fixed inset-0 z-70 bg-white flex flex-col items-center justify-center gap-4 px-8">
          <h1 className="text-2xl font-bold text-gray-900 text-center">
            Session expired
          </h1>
          <p className="text-sm text-gray-500 text-center">
            Please rescan the QR code to start a new session.
          </p>
          <button
            type="button"
            onClick={resetSession}
            className="mt-2 px-8 py-3 rounded-xl bg-qraving-button text-qraving-text text-base font-bold transition-opacity active:opacity-80"
          >
            Reset session
          </button>
        </div>
      )}

      {/* Toast: shown when a manager deletes a menu item that was in a basket */}
      {RemovedToast}
    </div>
  );
}
