'use client';

import { useState } from 'react';
import { MenuSection, MenuItem } from '@/lib/menu';
import SectionNavigator from '@/components/SectionNavigator';
import AddToCartSheet from '@/components/AddToCartSheet';
import Image from 'next/image';

interface MenuPageProps {
  sections: MenuSection[];
}

export default function MenuPage({ sections }: MenuPageProps) {
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [logoError, setLogoError] = useState(false);

  return (
    <div className="flex flex-col h-dvh lg:h-full overflow-hidden bg-qraving-bg">
      {/* Co-branded sticky header — blends into the app background, no separator */}
      <header className="sticky top-0 z-20 h-14 flex items-center px-4 bg-qraving-bg shrink-0">
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
      </header>

      {/* Body — fills remaining height. The live category name is folded into
          each section's content inside the navigator, so it snaps in with the
          category rather than living in a static band here. */}
      <div className="flex-1 overflow-hidden">
        <SectionNavigator sections={sections} onAddToCart={setSelectedItem} />
      </div>

      {/* Fixed overlays */}
      <AddToCartSheet item={selectedItem} onClose={() => setSelectedItem(null)} />
    </div>
  );
}
