'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from '@/lib/session-context';
import { UserBasket } from '@/lib/session';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BasketsSheetProps {
  open: boolean;
  onClose: () => void;
  onModify?: (userId: string) => void; // placeholder, wired up in issue #69
  onProceedToPayment?: (basket: UserBasket) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BasketsSheet({ open, onClose, onModify, onProceedToPayment }: BasketsSheetProps) {
  const { session } = useSession();

  // --- Animation / mount state ---
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  // --- Expand/collapse state: set of userId strings ---
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // --- Drag state ---
  const dragStartY = useRef<number | null>(null);

  // Mount when open, unmount after close animation
  useEffect(() => {
    if (open) {
      setMounted(true);
      // Trigger slide-up after a microtask so the element is in the DOM first
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  // --- Close handler: animate out then call onClose ---
  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 300);
  }, [onClose]);

  const handleBackdropClick = useCallback(() => {
    handleClose();
  }, [handleClose]);

  // --- Drag handle touch events ---
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (dragStartY.current === null) return;
      const delta = e.changedTouches[0].clientY - dragStartY.current;
      dragStartY.current = null;
      if (delta > 80) {
        handleClose();
      }
    },
    [handleClose]
  );

  // --- Toggle row expansion ---
  const toggleExpand = useCallback((userId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }, []);

  if (!mounted) return null;

  const baskets = session.baskets;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed lg:absolute inset-0 z-40 bg-black/50"
        style={{
          opacity: visible ? 1 : 0,
          transition: 'opacity 300ms ease',
        }}
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Bottom sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Baskets"
        className="fixed lg:absolute bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl overflow-y-auto"
        style={{
          maxHeight: '85vh',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {/* Drag handle */}
        <div
          className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing select-none"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          aria-hidden="true"
        >
          <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
        </div>

        {/* Sheet title */}
        <div className="px-4 pt-2 pb-3 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Baskets</h2>
        </div>

        {/* Body */}
        <div className="px-4 py-4 pb-8">
          {baskets.length === 0 ? (
            <p className="text-center text-gray-500 text-sm py-8">
              No one has added anything yet.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-gray-100">
              {baskets.map((basket) => {
                const isExpanded = expandedIds.has(basket.userId);
                const itemCount = basket.items.reduce((sum, i) => sum + i.quantity, 0);

                return (
                  <li key={basket.userId} className="py-3">
                    {/* Basket header row */}
                    <div
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => toggleExpand(basket.userId)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">
                          {`${basket.name}'s Basket`}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {itemCount} {itemCount === 1 ? 'item' : 'items'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onModify?.(basket.userId);
                          }}
                          className="text-xs font-semibold text-qraving-red border border-qraving-red px-3 py-1 rounded-full"
                        >
                          Modify
                        </button>
                        {basket.items.length > 0 && onProceedToPayment && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onProceedToPayment(basket);
                            }}
                            className="text-xs font-semibold text-qraving-text bg-qraving-button px-3 py-1 rounded-full"
                          >
                            Pay
                          </button>
                        )}
                        {/* Chevron */}
                        <svg
                          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </div>
                    </div>

                    {/* Expanded item list */}
                    {isExpanded && (
                      <ul className="mt-3 flex flex-col gap-3 pl-1 border-l-2 border-gray-100 ml-1">
                        {basket.items.map((item, idx) => (
                          <li key={`${item.itemId}-${item.size}-${idx}`} className="pl-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 leading-snug">
                                  {item.name}
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  {item.size}
                                  {item.addOns.length > 0 && ` · ${item.addOns.join(', ')}`}
                                </p>
                                {item.instructions ? (
                                  <p className="text-xs text-gray-400 italic mt-0.5">
                                    &ldquo;{item.instructions}&rdquo;
                                  </p>
                                ) : null}
                              </div>
                              <span className="text-xs font-semibold text-gray-500 shrink-0 mt-0.5">
                                ×{item.quantity}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
