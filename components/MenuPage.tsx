'use client';

import { useState } from 'react';
import { MenuSection, MenuItem } from '@/lib/menu';
import SectionNavigator from '@/components/SectionNavigator';
import AddToCartSheet from '@/components/AddToCartSheet';
import BasketsSheet from '@/components/BasketsSheet';
import CheckoutSheet from '@/components/CheckoutSheet';
import { useSession } from '@/lib/session-context';
import { createSession, UserBasket } from '@/lib/session';
import Image from 'next/image';

interface MenuPageProps {
  sections: MenuSection[];
}

export default function MenuPage({ sections }: MenuPageProps) {
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [logoError, setLogoError] = useState(false);
  const [basketsOpen, setBasketsOpen] = useState(false);
  const [modifyBasketId, setModifyBasketId] = useState<string | null>(null);
  const [awaitingTurn, setAwaitingTurn] = useState(false);
  const [finished, setFinished] = useState(false);
  const [checkoutBasket, setCheckoutBasket] = useState<UserBasket | null>(null);
  const { session, updateSession } = useSession();
  const basketCount = session.baskets.length;

  // Flatten all menu items for basket total computation in CheckoutSheet
  const menuItems = sections.flatMap((s) => s.items);

  return (
    <div className="flex flex-col h-dvh lg:h-full overflow-hidden bg-qraving-bg">
      {/* Co-branded sticky header — blends into the app background, no separator */}
      <header className="sticky top-0 z-20 h-14 flex items-center justify-between px-4 bg-qraving-bg shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-xl shrink-0 text-qraving-red">
            Qraving
          </span>
          <span className="text-gray-400 font-medium shrink-0">-</span>
          {logoError ? (
            <span className="font-semibold text-gray-800 text-sm truncate">
              Gordon&apos;s Kitchen
            </span>
          ) : (
            <Image
              src="/logos/gordons-kitchen.svg"
              alt="Gordon's Kitchen"
              width={160}
              height={28}
              className="h-7 w-auto max-w-[160px] object-contain"
              onError={() => setLogoError(true)}
              priority
            />
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
        <SectionNavigator sections={sections} onAddToCart={setSelectedItem} />
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
        onFinish={() => {
          setSelectedItem(null);
          setFinished(true);
          updateSession(createSession('demo-table-1'));
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
          setCheckoutBasket(basket);
        }}
      />

      {/* Checkout sheet — opened per-basket from BasketsSheet */}
      {checkoutBasket && (
        <CheckoutSheet
          session={session}
          basket={checkoutBasket}
          menuItems={menuItems}
          onClose={() => setCheckoutBasket(null)}
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

      {/* "Your baskets will be ready soon" terminal overlay */}
      {finished && (
        <div className="fixed inset-0 z-60 bg-white flex flex-col items-center justify-center gap-4 px-8">
          <h1 className="text-2xl font-bold text-gray-900 text-center">
            Your baskets will be ready soon.
          </h1>
          <p className="text-sm text-gray-500 text-center">
            Feel free to come back to this page or scan the QR code again.
          </p>
        </div>
      )}
    </div>
  );
}
