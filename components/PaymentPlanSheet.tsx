'use client';

import { useState, useEffect, useCallback } from 'react';
import { Session } from '@/lib/session';
import { MenuItem } from '@/lib/menu';
import { computeSessionTotal, resolvePaymentMode } from '@/lib/payment';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaymentPlanSheetProps {
  session: Session;
  menuItems: MenuItem[];
  onClose: () => void;
  onConfirm: (plan: 'single' | 'split') => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Shown once, before checkout, whenever a session has 2+ non-empty baskets
 * and no paymentPlan has been chosen yet. Lets the table decide between one
 * person covering the whole bill ("single") or everyone paying for their own
 * basket ("split") — pre-selecting resolvePaymentMode(session)'s inferred
 * suggestion. Confirming writes the choice into session.paymentPlan (via the
 * caller's onConfirm) before proceeding into the existing CheckoutSheet flow.
 */
export default function PaymentPlanSheet({
  session,
  menuItems,
  onClose,
  onConfirm,
}: PaymentPlanSheetProps) {
  const [visible, setVisible] = useState(false);
  const suggested = resolvePaymentMode(session);
  const [selected, setSelected] = useState<'single' | 'split'>(suggested);

  const total = computeSessionTotal(session, menuItems);
  const totalFormatted = `$${total.toFixed(2)} CAD`;

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 300);
  }, [onClose]);

  const handleConfirm = useCallback(() => {
    setVisible(false);
    setTimeout(() => onConfirm(selected), 300);
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
        aria-label="Choose how to pay"
        className="fixed lg:absolute inset-0 z-50 bg-qraving-bg flex flex-col overflow-y-auto"
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        <div className="flex flex-col flex-1 px-4 pt-8 pb-10 gap-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">How will you pay?</h1>
            <button
              type="button"
              onClick={handleClose}
              className="text-sm font-semibold text-gray-500 active:opacity-60"
            >
              Cancel
            </button>
          </div>

          <p className="text-sm text-gray-500 -mt-2">
            The table has more than one basket. Choose how the bill gets settled.
          </p>

          {/* Options */}
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setSelected('single')}
              aria-pressed={selected === 'single'}
              className={`w-full text-left rounded-2xl border px-5 py-4 transition-colors ${
                selected === 'single'
                  ? 'border-qraving-red bg-red-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold text-gray-900">Pay for the whole table</p>
                {suggested === 'single' && (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-qraving-red bg-red-100 rounded-full px-2 py-0.5">
                    Suggested
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1">
                One person covers everyone&apos;s order — {totalFormatted} total, one charge.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setSelected('split')}
              aria-pressed={selected === 'split'}
              className={`w-full text-left rounded-2xl border px-5 py-4 transition-colors ${
                selected === 'split'
                  ? 'border-qraving-red bg-red-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold text-gray-900">Split by basket</p>
                {suggested === 'split' && (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-qraving-red bg-red-100 rounded-full px-2 py-0.5">
                    Suggested
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Everyone pays for their own basket, separately.
              </p>
            </button>
          </div>

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
