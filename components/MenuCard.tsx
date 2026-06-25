'use client';

import { useState } from 'react';
import Image from 'next/image';
import { MenuItem, DietaryTag } from '@/lib/menu';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MenuCardProps {
  item: MenuItem;
  onAddToCart: (item: MenuItem) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_DIETARY_TAGS: DietaryTag[] = [
  'Vegan',
  'Vegetarian',
  'Halal',
  'Kosher',
  'GlutenFree',
  'LactoseFree',
  'NutFree',
];

const DIETARY_TAG_LABELS: Record<DietaryTag, string> = {
  Vegan: 'Vegan',
  Vegetarian: 'Vegetarian',
  Halal: 'Halal',
  Kosher: 'Kosher',
  GlutenFree: 'Gluten-Free',
  LactoseFree: 'Lactose-Free',
  NutFree: 'Nut-Free',
};

/** Badge background colors used on the front photo */
const BADGE_BG: Record<DietaryTag, string> = {
  Vegan: '#16a34a',       // green-600
  Vegetarian: '#15803d',  // green-700
  Halal: '#0d9488',       // teal-600
  Kosher: '#7c3aed',      // violet-600
  GlutenFree: '#ca8a04',  // yellow-600
  LactoseFree: '#2563eb', // blue-600
  NutFree: '#ea580c',     // orange-600
};

/** Row indicator colors used on the back face */
const TAG_COLOR: Record<DietaryTag, string> = {
  Vegan: '#16a34a',
  Vegetarian: '#15803d',
  Halal: '#0d9488',
  Kosher: '#7c3aed',
  GlutenFree: '#ca8a04',
  LactoseFree: '#2563eb',
  NutFree: '#ea580c',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MenuCard({ item, onAddToCart }: MenuCardProps) {
  const [flipped, setFlipped] = useState(false);

  const hasAllergens = item.allergens.length > 0;
  const tagSet = new Set<DietaryTag>(item.dietaryTags);

  return (
    /* Perspective wrapper — gives depth to the 3D flip */
    <div
      className="h-full w-full"
      style={{ perspective: '1000px' }}
    >
      {/* Card container — rotates on Y axis */}
      <div
        className="relative h-full w-full rounded-2xl shadow-md"
        style={{
          transformStyle: 'preserve-3d',
          transition: 'transform 450ms cubic-bezier(0.4, 0, 0.2, 1)',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* ================================================================
            FRONT FACE
        ================================================================ */}
        <div
          className="absolute inset-0 flex flex-col rounded-2xl overflow-hidden bg-white"
          style={{ backfaceVisibility: 'hidden' }}
        >
          {/* Photo — top ~60% */}
          <div className="relative" style={{ flex: '0 0 60%' }}>
            <Image
              src={item.imageUrl}
              alt={item.name}
              fill
              className="object-cover"
              sizes="390px"
              priority={false}
            />

            {/* Gradient overlay with name + price */}
            <div
              className="absolute inset-x-0 bottom-0 px-3 pb-3 pt-8"
              style={{
                background:
                  'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 100%)',
              }}
            >
              <div className="flex items-end justify-between gap-2">
                <p className="text-white font-bold text-base leading-tight">
                  {item.name}
                </p>
                <p
                  className="text-white font-bold text-base shrink-0"
                  style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
                >
                  £{item.price.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Dietary badge pills — top-right of photo */}
            {item.dietaryTags.length > 0 && (
              <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
                {item.dietaryTags.map((tag) => (
                  <span
                    key={tag}
                    className="text-white text-[10px] font-semibold px-2 py-0.5 rounded-full leading-tight"
                    style={{ backgroundColor: BADGE_BG[tag] }}
                  >
                    {DIETARY_TAG_LABELS[tag]}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Content area — bottom ~40% */}
          <div className="flex flex-col flex-1 px-4 pt-3 pb-4 gap-3 overflow-hidden">
            {/* Short description */}
            <p className="text-gray-600 text-sm leading-snug line-clamp-3 flex-1">
              {item.description}
            </p>

            {/* Action buttons */}
            <div className="flex flex-col gap-2 mt-auto">
              {/* Allergies & More — secondary outlined */}
              <button
                type="button"
                onClick={() => setFlipped(true)}
                className="w-full py-2.5 rounded-xl border text-sm font-semibold transition-colors"
                style={{
                  borderColor: '#E3000F',
                  color: '#E3000F',
                  backgroundColor: 'transparent',
                }}
                onMouseOver={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                    'rgba(227,0,15,0.06)';
                }}
                onMouseOut={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                    'transparent';
                }}
              >
                Allergies &amp; More
              </button>

              {/* Add to Cart — primary solid */}
              <button
                type="button"
                onClick={() => onAddToCart(item)}
                className="w-full py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity active:opacity-80"
                style={{ backgroundColor: '#E3000F' }}
              >
                Add to Cart
              </button>
            </div>
          </div>
        </div>

        {/* ================================================================
            BACK FACE
        ================================================================ */}
        <div
          className="absolute inset-0 flex flex-col rounded-2xl overflow-hidden bg-white"
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          {/* Back header */}
          <div
            className="flex items-center gap-3 px-4 py-3 border-b border-gray-100"
          >
            <button
              type="button"
              onClick={() => setFlipped(false)}
              aria-label="Back to item"
              className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors shrink-0"
            >
              {/* Left chevron */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <p className="font-bold text-gray-900 text-base leading-tight truncate">
              {item.name}
            </p>
          </div>

          {/* Scrollable back content */}
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5">
            {/* Full description */}
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                Description
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed">
                {item.description}
              </p>
            </section>

            {/* Allergen warning block */}
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                Allergens
              </h3>
              {hasAllergens ? (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                  {/* Warning icon */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="shrink-0 mt-0.5"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#d97706"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <p className="text-sm text-amber-800">
                    <span className="font-semibold">Contains: </span>
                    {item.allergens.join(', ')}
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="shrink-0"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#16a34a"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <p className="text-sm text-green-800">No known allergens</p>
                </div>
              )}
            </section>

            {/* Dietary status rows */}
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Dietary Info
              </h3>
              <ul className="flex flex-col divide-y divide-gray-100">
                {ALL_DIETARY_TAGS.map((tag) => {
                  const present = tagSet.has(tag);
                  return (
                    <li
                      key={tag}
                      className="flex items-center justify-between py-2"
                    >
                      <span className="text-sm text-gray-700">
                        {DIETARY_TAG_LABELS[tag]}
                      </span>
                      <span
                        className="text-sm font-bold"
                        style={{ color: present ? TAG_COLOR[tag] : '#9ca3af' }}
                      >
                        {present ? '✓' : '✗'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>

          {/* Sticky Add to Cart on back face */}
          <div className="px-4 pb-4 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => {
                onAddToCart(item);
                setFlipped(false);
              }}
              className="w-full py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity active:opacity-80"
              style={{ backgroundColor: '#E3000F' }}
            >
              Add to Cart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
