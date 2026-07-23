'use client';

import { useState, useEffect, useCallback } from 'react';
import { Session, UserBasket, BasketItem } from '@/lib/session';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SharerSelectionSheetProps {
  /** The basket that added the shared item — always included as a sharer. */
  basket: UserBasket;
  /** The specific unresolved shared item being resolved right now. */
  item: BasketItem;
  session: Session;
  onClose: () => void;
  /** Called with the full resolved sharer list (always includes basket.userId). */
  onConfirm: (sharerIds: string[]) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Shown at payment time, once per unresolved isShared item on a basket,
 * before that basket can proceed to PaymentPlanSheet/CheckoutSheet. Lets the
 * adding basket pick which of the session's current non-empty baskets are
 * splitting this item's cost. The adder's own basket is always included and
 * can't be deselected. Confirming persists the choice via the caller (which
 * writes it onto the item with updateItemSharers + updateSession) — mirrors
 * the slide-up full-screen sheet pattern used by CheckoutSheet/PaymentPlanSheet.
 */
export default function SharerSelectionSheet({
  basket,
  item,
  session,
  onClose,
  onConfirm,
}: SharerSelectionSheetProps) {
  const [visible, setVisible] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set([basket.userId]));

  // Every basket with items currently on the table is a candidate sharer,
  // including the adder's own basket (shown locked/pre-checked below).
  const candidateBaskets = session.baskets.filter((b) => b.items.length > 0);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 300);
  }, [onClose]);

  const toggleSharer = useCallback(
    (userId: string) => {
      if (userId === basket.userId) return; // adder can't be deselected
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(userId)) {
          next.delete(userId);
        } else {
          next.add(userId);
        }
        return next;
      });
    },
    [basket.userId],
  );

  const handleConfirm = useCallback(() => {
    setVisible(false);
    setTimeout(() => onConfirm(Array.from(selected)), 300);
  }, [onConfirm, selected]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed lg:absolute inset-0 z-40 bg-black/50"
        style={{ opacity: visible ? 1 : 0, transition: 'opacity 300ms ease' }}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Full-screen sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Who's sharing this item?"
        className="fixed lg:absolute inset-0 z-50 bg-qraving-bg flex flex-col overflow-y-auto"
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        <div className="flex flex-col flex-1 px-4 pt-8 pb-10 gap-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Who&apos;s sharing this?</h1>
            <button
              type="button"
              onClick={handleClose}
              className="text-sm font-semibold text-gray-500 active:opacity-60"
            >
              Cancel
            </button>
          </div>

          <p className="text-sm text-gray-500 -mt-2">
            <span className="font-semibold text-gray-700">{item.name}</span> is marked as shared.
            Pick everyone at the table splitting its cost evenly.
          </p>

          {/* Sharer list */}
          <ul className="flex flex-col gap-2">
            {candidateBaskets.map((b) => {
              const isAdder = b.userId === basket.userId;
              const checked = isAdder || selected.has(b.userId);
              return (
                <li key={b.userId}>
                  <label
                    className={`flex items-center justify-between gap-3 rounded-2xl border px-5 py-4 transition-colors ${
                      checked ? 'border-qraving-red bg-red-50' : 'border-gray-200 bg-white'
                    } ${isAdder ? 'cursor-default' : 'cursor-pointer'}`}
                  >
                    <div>
                      <p className="font-bold text-gray-900">
                        {b.name}
                        {isAdder && (
                          <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-qraving-red bg-red-100 rounded-full px-2 py-0.5 align-middle">
                            You
                          </span>
                        )}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isAdder}
                      onChange={() => toggleSharer(b.userId)}
                      aria-label={`${b.name} shares this item`}
                      className="w-5 h-5 rounded accent-qraving-red cursor-pointer disabled:cursor-default"
                    />
                  </label>
                </li>
              );
            })}
          </ul>

          {/* Confirm */}
          <button
            type="button"
            onClick={handleConfirm}
            className="w-full py-3.5 mt-auto rounded-xl bg-qraving-button text-qraving-text font-bold text-base transition-opacity active:opacity-80"
          >
            Continue
          </button>

          <button
            type="button"
            onClick={handleClose}
            className="text-sm text-gray-400 text-center active:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
