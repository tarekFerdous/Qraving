'use client';

import { memo, useRef, useState } from 'react';
import Image from 'next/image';
import { Plus } from 'lucide-react';
import { MenuItem } from '@/lib/menu';
import { getDietaryIcon } from '@/lib/dietary';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MenuCardProps {
  item: MenuItem;
  /** Index of this card in the carousel — passed back through onFlipChange. */
  cardIndex: number;
  onAddToCart: (item: MenuItem) => void;
  /** Flip state is controlled by the parent so navigation can reset it. */
  flipped: boolean;
  /** Request a flip-state change. Receives cardIndex so the parent can use a
   *  stable useCallback without per-card closures. */
  onFlipChange: (cardIndex: number, flipped: boolean) => void;
  /** True for the above-the-fold LCP image to force eager loading. */
  priority?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function MenuCard({
  item,
  cardIndex,
  onAddToCart,
  flipped,
  onFlipChange,
  priority = false,
}: MenuCardProps) {
  const hasAllergens = item.allergens.length > 0;

  // Back-face scroll container — owns its own vertical scroll. A "back to top"
  // affordance appears once the user has scrolled down through the details.
  const backScrollRef = useRef<HTMLDivElement>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);

  function onBackScroll(e: React.UIEvent<HTMLDivElement>) {
    setShowBackToTop(e.currentTarget.scrollTop > 24);
  }

  function scrollBackToTop() {
    backScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="h-full w-full px-0" style={{ perspective: '1000px' }}>
      {/* Card container — rotates on Y axis */}
      <div
        className="relative h-full w-full rounded-3xl"
        style={{
          transformStyle: 'preserve-3d',
          transition: 'transform 450ms cubic-bezier(0.4, 0, 0.2, 1)',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* ================================================================
            FRONT FACE — full-bleed image with bottom gradient overlay
        ================================================================ */}
        <div
          className="absolute inset-0 rounded-3xl overflow-hidden"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            // iOS WebKit fallback: backfaceVisibility fails when overflow:hidden
            // is set on a preserve-3d child. Opacity toggled at the flip midpoint
            // so the wrong face is always invisible regardless of backface support.
            opacity: flipped ? 0 : 1,
            transition: 'opacity 0ms 225ms',
            pointerEvents: flipped ? 'none' : undefined,
          }}
        >
          {/* Full-bleed photo */}
          <Image
            src={item.imageUrl}
            alt={item.name}
            fill
            className="object-cover"
            sizes="(min-width: 1024px) 487px, 76vw"
            priority={priority}
            loading="eager"
            style={
              !item.isAvailable
                ? { filter: 'grayscale(0.7) brightness(0.75)' }
                : undefined
            }
          />

          {/* Out-of-stock desaturation tint */}
          {!item.isAvailable && (
            <div
              className="absolute inset-0 z-10"
              style={{ backgroundColor: 'rgba(200,200,200,0.3)' }}
            />
          )}

          {/* Dietary marks — icon-only, top-right (no pill chrome) */}
          {item.dietaryTags.length > 0 && (
            <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5 z-20">
              {item.dietaryTags.map((tag) => {
                const { icon, label } = getDietaryIcon(tag);
                return (
                  <Image
                    key={tag}
                    src={icon}
                    alt={label}
                    title={label}
                    width={26}
                    height={26}
                    unoptimized
                    className="w-[26px] h-[26px] drop-shadow"
                  />
                );
              })}
            </div>
          )}

          {/* Dark gradient scrim — darkens the bottom of the card for text legibility */}
          <div
            className="absolute inset-0 z-20"
            style={{
              background: 'linear-gradient(to bottom, transparent 70%, rgba(0,0,0,0.65) 100%)',
            }}
          />

          {/* Content — name, price, description, action buttons */}
          <div
            className="absolute inset-0 z-30 flex flex-col justify-end px-3 pb-3 gap-1.5"
          >
              {/* Name + price */}
              <div className="flex items-end justify-between gap-2">
                <p className="text-white font-bold text-base leading-tight line-clamp-1 flex-1">
                  {item.name}
                </p>
                <p
                  className="text-white font-bold text-base shrink-0"
                  style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
                >
                  ${item.price.toFixed(2)} CAD
                </p>
              </div>

              {/* Description */}
              <p className="text-white/75 text-xs leading-snug line-clamp-2">
                {item.description}
              </p>

              {/* Action buttons */}
              <div className="flex flex-row gap-1.5 mt-0.5">
                {/* Allergies & More — triggers 3D flip */}
                <button
                  type="button"
                  onClick={() => onFlipChange(cardIndex, true)}
                  className="flex-1 py-2 rounded-xl text-white text-sm font-semibold"
                  style={{
                    border: '1px solid rgba(255,255,255,0.45)',
                    backgroundColor: 'rgba(255,255,255,0.1)',
                  }}
                >
                  Allergies &amp; More
                </button>

                {/* Add — disabled for out-of-stock items */}
                <button
                  type="button"
                  onClick={() => {
                    if (item.isAvailable) onAddToCart(item);
                  }}
                  disabled={!item.isAvailable}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-opacity active:opacity-80 flex items-center justify-center gap-1 ${
                    item.isAvailable ? 'bg-qraving-button text-qraving-text' : 'cursor-not-allowed text-white'
                  }`}
                  style={
                    item.isAvailable
                      ? undefined
                      : { backgroundColor: 'rgba(100,100,100,0.65)' }
                  }
                >
                  <Plus size={14} strokeWidth={2.5} />
                  Add
                </button>
              </div>
            </div>
          </div>

        {/* ================================================================
            BACK FACE — solid, scrollable dietary & allergen details.
            Rendered as a fully opaque white surface so the front's photo,
            blur overlay, and buttons never bleed through (mirrored).
        ================================================================ */}
        <div
          className="absolute inset-0 flex flex-col rounded-3xl overflow-hidden bg-white"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            // Matching opacity fallback for the back face.
            opacity: flipped ? 1 : 0,
            transition: 'opacity 0ms 225ms',
            pointerEvents: flipped ? undefined : 'none',
          }}
        >
          {/* Back header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 shrink-0">
            <button
              type="button"
              onClick={() => onFlipChange(cardIndex, false)}
              aria-label="Back to item"
              className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors shrink-0"
            >
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

          {/* Scrollable back content. Owns its own vertical scroll: native pan-y
              with scroll-chaining contained so vertical swipes never propagate to
              section navigation and never trigger pull-to-refresh. */}
          <div
            ref={backScrollRef}
            onScroll={onBackScroll}
            className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5"
            style={{ touchAction: 'pan-y', overscrollBehaviorY: 'contain' }}
          >
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

            {/* Dietary info — icon + label, listing only the tags the item has */}
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Dietary Info
              </h3>
              {item.dietaryTags.length > 0 ? (
                <ul className="flex flex-col gap-2.5">
                  {item.dietaryTags.map((tag) => {
                    const { icon, label } = getDietaryIcon(tag);
                    return (
                      <li key={tag} className="flex items-center gap-2.5">
                        <Image
                          src={icon}
                          alt=""
                          width={24}
                          height={24}
                          unoptimized
                          className="w-6 h-6 shrink-0"
                        />
                        <span className="text-sm text-gray-700">{label}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-gray-400">No specific dietary tags.</p>
              )}
            </section>

            {/* Add to Cart — at the end of the scrolled content (not pinned) */}
            <button
              type="button"
              onClick={() => {
                if (item.isAvailable) {
                  onAddToCart(item);
                  onFlipChange(cardIndex, false);
                }
              }}
              disabled={!item.isAvailable}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold mt-1 ${
                item.isAvailable
                  ? 'bg-qraving-button text-qraving-text opacity-100'
                  : 'bg-gray-400 text-white opacity-70 cursor-not-allowed'
              }`}
            >
              {item.isAvailable ? 'Add to Cart' : 'Unavailable'}
            </button>
          </div>

          {/* Back-to-top affordance — appears once the details have been scrolled */}
          {showBackToTop && (
            <button
              type="button"
              onClick={scrollBackToTop}
              aria-label="Back to top"
              className="absolute bottom-4 right-4 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-gray-900/80 text-white shadow-lg active:opacity-80"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(MenuCard);
