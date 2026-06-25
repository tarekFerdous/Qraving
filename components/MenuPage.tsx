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

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="h-14 flex items-center px-4 shrink-0">
        <span className="font-bold text-xl" style={{ color: '#E3000F' }}>
          Qraving
        </span>
      </header>

      {/* Body — fills remaining height */}
      <div className="flex-1 overflow-hidden">
        <SectionNavigator
          sections={sections}
          onAddToCart={setSelectedItem}
          isPeekPaused={!!selectedItem}
        />
      </div>

      {/* Fixed overlays */}
      <AddToCartSheet
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
      />

      {/* "I am done" floating pill */}
      <button
        type="button"
        className="fixed bottom-20 left-1/2 -translate-x-1/2 px-8 py-3 rounded-full text-white font-semibold text-sm shadow-lg"
        style={{ backgroundColor: '#E3000F' }}
        aria-label="I am done"
      >
        I am done
      </button>
    </div>
  );
}
