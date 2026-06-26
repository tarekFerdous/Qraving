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
  const [activeSectionName, setActiveSectionName] = useState<string>(
    sections[0]?.name ?? ''
  );
  const [logoError, setLogoError] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Co-branded sticky header */}
      <header className="sticky top-0 z-20 h-14 flex items-center px-4 bg-white border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-xl shrink-0" style={{ color: '#E3000F' }}>
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

      {/* Live category name label */}
      <div className="px-4 pt-3 pb-2 bg-white shrink-0">
        <p className="text-gray-800 font-semibold text-base">{activeSectionName}</p>
      </div>

      {/* Body — fills remaining height */}
      <div className="flex-1 overflow-hidden">
        <SectionNavigator
          sections={sections}
          onAddToCart={setSelectedItem}
          onActiveSectionChange={setActiveSectionName}
        />
      </div>

      {/* Fixed overlays */}
      <AddToCartSheet
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
      />

      {/* "I am done" button — full-width, pinned at 5vh from viewport bottom */}
      <button
        type="button"
        className="fixed left-4 right-4 py-4 rounded-2xl text-white font-semibold text-base shadow-lg z-30"
        style={{ backgroundColor: '#E3000F', bottom: '5vh' }}
        aria-label="I am done"
      >
        I am done
      </button>
    </div>
  );
}
