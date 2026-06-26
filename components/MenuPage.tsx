'use client';

import { useState } from 'react';
import { MenuSection, MenuItem } from '@/lib/menu';
import SectionNavigator from '@/components/SectionNavigator';
import AddToCartSheet from '@/components/AddToCartSheet';

interface MenuPageProps {
  sections: MenuSection[];
}

export default function MenuPage({ sections }: MenuPageProps) {
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [activeSectionName, setActiveSectionName] = useState<string>(
    sections[0]?.name ?? ''
  );

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Co-branded sticky header */}
      <header className="sticky top-0 z-20 h-14 flex items-center justify-between px-4 bg-white border-b border-gray-100 shrink-0">
        <span className="font-bold text-xl" style={{ color: '#E3000F' }}>
          Qraving
        </span>
        {/* Restaurant logo placeholder — swap this element for a real <img> when asset is available */}
        <div
          className="w-10 h-10 rounded-xl bg-gray-200 flex items-center justify-center overflow-hidden"
          aria-label="Restaurant logo placeholder"
        >
          <span className="text-gray-400 text-[9px] font-medium text-center leading-tight px-1">
            Logo
          </span>
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
          isPeekPaused={!!selectedItem}
          onActiveSectionChange={setActiveSectionName}
        />
      </div>

      {/* Fixed overlays */}
      <AddToCartSheet
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
      />

      {/* "I am done" button — full-width, pinned at bottom with 5vh breathing room */}
      <button
        type="button"
        className="fixed left-4 right-4 py-4 rounded-2xl text-white font-semibold text-base shadow-lg z-10"
        style={{ backgroundColor: '#E3000F', bottom: '5vh' }}
        aria-label="I am done"
      >
        I am done
      </button>
    </div>
  );
}
