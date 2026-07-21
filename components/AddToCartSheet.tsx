'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { MenuItem } from '@/lib/menu';
import { useSession } from '@/lib/session-context';
import {
  BasketItem,
  UserBasket,
  nextUserLabel,
  addBasket,
  upsertItem,
} from '@/lib/session';
import {
  SEGMENTS,
  autoAdvance,
  shouldRetreat,
  isPhoneComplete,
  toE164,
} from '@/lib/phone';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AddToCartSheetProps {
  item: MenuItem | null;         // null in edit mode
  editBasketUserId?: string | null; // non-null → edit mode
  onClose: () => void;
  onPass: () => void;
  onFinish: () => void;
  onAddAnotherItem?: () => void; // called when "Add another item" is tapped in edit mode
}

type TurnIdentity = {
  userId: string;
  name: string;
  phone: string; // E.164 "+1XXXXXXXXXX"
};

// ---------------------------------------------------------------------------
// Module-level turn state
// Persists across sheet open/close cycles within the same page load.
// Reset on component unmount (page navigation) via useEffect cleanup.
// ---------------------------------------------------------------------------

let turnState: TurnIdentity | null = null;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIZES = ['Small', 'Medium', 'Large'] as const;
const ADD_ONS = ['Extra Sauce', 'Double Portion', 'Extra Cheese', 'No Ice'] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AddToCartSheet({
  item,
  editBasketUserId,
  onClose,
  onPass,
  onFinish,
  onAddAnotherItem,
}: AddToCartSheetProps) {
  const { session, updateSession } = useSession();

  // --- Step state ---
  const [step, setStep] = useState<'customise' | 'identity' | 'actions'>('customise');

  // --- Customisation state ---
  const [selectedSize, setSelectedSize] = useState<'Small' | 'Medium' | 'Large'>('Medium');
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [instructions, setInstructions] = useState('');

  // Staged BasketItem carried from step 1 → step 2
  const stagedItem = useRef<BasketItem | null>(null);

  // --- Identity state (step 2) ---
  const [identityName, setIdentityName] = useState('');
  const [identityEmail, setIdentityEmail] = useState('');
  const [segments, setSegments] = useState(['', '', '']);

  // Phone segment input refs
  const seg0Ref = useRef<HTMLInputElement>(null);
  const seg1Ref = useRef<HTMLInputElement>(null);
  const seg2Ref = useRef<HTMLInputElement>(null);

  // --- Sheet slide-up animation ---
  const [visible, setVisible] = useState(false);

  // --- Finish confirmation state ---
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);

  // --- Drag-to-close state ---
  const dragStartY = useRef<number | null>(null);

  // --- Edit mode state ---
  const [editItems, setEditItems] = useState<BasketItem[]>([]);

  // ── Open / reset when item changes ──
  useEffect(() => {
    if (item) {
      setSelectedSize('Medium');
      setSelectedAddOns([]);
      setInstructions('');
      setStep('customise');
      setSegments(['', '', '']);
      setIdentityName('');
      setIdentityEmail('');
      setShowFinishConfirm(false);
      stagedItem.current = null;
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [item]);

  // ── Open / seed edit items when editBasketUserId changes ──
  useEffect(() => {
    if (editBasketUserId) {
      const basket = session.baskets.find((b) => b.userId === editBasketUserId);
      setEditItems(basket ? basket.items.map((i) => ({ ...i })) : []);
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
    // Intentionally omit `session` — we only need the snapshot at the moment
    // editBasketUserId changes (when the sheet opens).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editBasketUserId]);

  // ── Prefill identity fields when sliding to step 2 ──
  useEffect(() => {
    if (step === 'identity') {
      // nextUserLabel is pure — call here for display prefill only;
      // the counter is only committed when the user taps "Add to basket".
      const { label } = nextUserLabel(session);
      setIdentityName(label);
      setSegments(['', '', '']);
      requestAnimationFrame(() => seg0Ref.current?.focus());
    }
    // Intentionally omit `session` so the form isn't reset if session updates
    // while the user is typing on step 2.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── Reset finish confirm when entering actions panel ──
  useEffect(() => {
    if (step === 'actions') {
      setShowFinishConfirm(false);
    }
  }, [step]);

  // ── Reset module-level turn state when component unmounts ──
  useEffect(() => {
    return () => {
      turnState = null;
    };
  }, []);

  // ── Close: animate out then unmount ──
  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 300);
  }, [onClose]);

  // ── Step transition: close sheet, swap content, reopen ──
  const transitionToStep = useCallback((nextStep: 'identity' | 'actions') => {
    setVisible(false);
    setTimeout(() => {
      setStep(nextStep);
      requestAnimationFrame(() => setVisible(true));
    }, 300);
  }, []);

  const handleBackdropClick = useCallback(() => {
    handleClose();
  }, [handleClose]);

  // ── Drag handle touch events ──
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (dragStartY.current === null) return;
      const delta = e.changedTouches[0].clientY - dragStartY.current;
      dragStartY.current = null;
      if (delta > 80) handleClose();
    },
    [handleClose]
  );

  // ── Add-on toggle ──
  const toggleAddOn = useCallback((addOn: string) => {
    setSelectedAddOns((prev) =>
      prev.includes(addOn) ? prev.filter((a) => a !== addOn) : [...prev, addOn]
    );
  }, []);

  // ── Build a BasketItem from current customisation selections ──
  const buildBasketItem = useCallback((): BasketItem | null => {
    if (!item) return null;
    return {
      itemId: item.id,
      name: item.name,
      size: selectedSize,
      addOns: [...selectedAddOns],
      instructions: instructions.trim(),
      quantity: 1,
    };
  }, [item, selectedSize, selectedAddOns, instructions]);

  // ── Step 1 "Add to basket" ──
  const handleAddToBasket = useCallback(() => {
    const newItem = buildBasketItem();
    if (!newItem) return;

    if (turnState) {
      // User already identified this turn — add directly to their basket.
      const basketIndex = session.baskets.findIndex((b) => b.userId === turnState!.userId);
      if (basketIndex >= 0) {
        const updatedBasket = upsertItem(session.baskets[basketIndex], newItem);
        const updatedBaskets = session.baskets.map((b, i) =>
          i === basketIndex ? updatedBasket : b
        );
        updateSession({ ...session, baskets: updatedBaskets });
        handleClose();
        return;
      }
      // Basket not found (session reset) — fall through to identity step.
      turnState = null;
    }

    // No identity yet — stage item and open identity sheet.
    stagedItem.current = newItem;
    transitionToStep('identity');
  }, [buildBasketItem, session, updateSession, handleClose, transitionToStep]);

  // ── Step 2 phone segment change ──
  const handleSegmentChange = useCallback((index: number, value: string) => {
    const digits = value.replace(/\D/g, '');
    const maxLen = SEGMENTS[index].maxLength;
    const trimmed = digits.slice(0, maxLen);

    setSegments((prev) => {
      const next = [...prev];
      next[index] = trimmed;
      return next;
    });

    // Auto-advance to next segment when current is full
    if (autoAdvance(index, trimmed, maxLen)) {
      const refs = [seg0Ref, seg1Ref, seg2Ref];
      refs[index + 1]?.current?.focus();
    }
  }, []);

  // ── Step 2 phone segment backspace retreat ──
  const handleSegmentKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      const cursorPos = e.currentTarget.selectionStart ?? 0;
      if (shouldRetreat(index, e.key, cursorPos)) {
        e.preventDefault();
        const refs = [seg0Ref, seg1Ref, seg2Ref];
        refs[index - 1]?.current?.focus();
      }
    },
    []
  );

  // ── Step 2 "Add to basket" — commit staged item with identity, then show actions ──
  const handleCommitWithIdentity = useCallback(() => {
    if (!stagedItem.current || !isPhoneComplete(segments)) return;

    const { label, session: sessionV2 } = nextUserLabel(session);
    const userId =
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
          });
    const phone = toE164(segments);
    const name = identityName.trim() || label;

    // Build basket, add staged item, attach to session
    const emailValue = identityEmail.trim() || undefined;
    const emptyBasket: UserBasket = { userId, name, phone, ...(emailValue ? { email: emailValue } : {}), items: [], paymentStatus: 'pending', paymentMethod: null, helcimTransactionId: null };
    const basketWithItem = upsertItem(emptyBasket, stagedItem.current);
    const finalSession = addBasket(sessionV2, basketWithItem);

    updateSession(finalSession);

    // Remember this turn's identity so future items skip step 2
    turnState = { userId, name, phone };

    // Close identity sheet and reopen as actions sheet
    transitionToStep('actions');
  }, [segments, session, identityName, updateSession, transitionToStep]);

  // ── Actions panel: "Add more" ──
  const handleAddMore = useCallback(() => {
    handleClose();
  }, [handleClose]);

  // ── Actions panel: "PASS" ──
  const handlePass = useCallback(() => {
    turnState = null;
    onPass();
    handleClose();
  }, [onPass, handleClose]);

  // ── Actions panel: "Finish" confirm ──
  const handleFinishConfirm = useCallback(() => {
    onFinish();
    handleClose();
  }, [onFinish, handleClose]);

  // ── Edit mode: "Add another item" ──
  const handleAddAnotherItem = useCallback(() => {
    const basket = session.baskets.find((b) => b.userId === editBasketUserId);
    if (basket) {
      turnState = { userId: basket.userId, name: basket.name, phone: basket.phone };
    }
    handleClose();
    onAddAnotherItem?.();
  }, [session, editBasketUserId, handleClose, onAddAnotherItem]);

  // ── Edit mode: "Done" — commit edits to session ──
  const handleEditDone = useCallback(() => {
    const updatedBaskets = session.baskets.map((b) =>
      b.userId === editBasketUserId ? { ...b, items: editItems } : b
    );
    updateSession({ ...session, baskets: updatedBaskets });
    handleClose();
  }, [session, editBasketUserId, editItems, updateSession, handleClose]);

  // ── Don't render if neither item nor edit mode ──
  if (!item && !editBasketUserId) return null;

  const phoneComplete = isPhoneComplete(segments);

  // Resolved basket for edit mode
  const editBasket = editBasketUserId
    ? session.baskets.find((b) => b.userId === editBasketUserId)
    : null;
  const editBasketName = editBasket?.name ?? 'User';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed lg:absolute inset-0 z-40 bg-black/50"
        style={{ opacity: visible ? 1 : 0, transition: 'opacity 300ms ease' }}
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Bottom sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={
          editBasketUserId
            ? `Edit ${editBasketName}'s basket`
            : step === 'identity'
            ? "Who's ordering?"
            : step === 'actions'
            ? 'What would you like to do?'
            : `Customise ${item!.name}`
        }
        className="fixed lg:absolute bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl flex flex-col overflow-hidden"
        style={{
          maxHeight: '85vh',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {/* Drag handle — sits above the content */}
        <div
          className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing select-none shrink-0"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          aria-hidden="true"
        >
          <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
        </div>

        {editBasketUserId ? (
          /* ── Edit mode: single-panel layout ── */
          <>
            {/* Title */}
            <div className="px-4 pt-2 pb-3 shrink-0">
              <h2 className="text-lg font-bold text-gray-900">
                Edit {editBasketName}&apos;s Basket
              </h2>
            </div>

            {/* Scrollable item list */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {editItems.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-8">Basket is empty.</p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {editItems.map((it, idx) => (
                    <li
                      key={`${it.itemId}-${it.size}-${idx}`}
                      className="flex flex-col gap-2 border border-gray-100 rounded-xl p-3"
                    >
                      {/* Name row + remove */}
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-bold text-gray-900 text-sm leading-snug">{it.name}</p>
                        <button
                          type="button"
                          onClick={() =>
                            setEditItems((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-xs text-gray-400 shrink-0 mt-0.5 hover:text-red-500 transition-colors"
                          aria-label={`Remove ${it.name}`}
                        >
                          ✕ Remove
                        </button>
                      </div>

                      {/* Size + add-ons */}
                      <p className="text-xs text-gray-500">
                        {it.size}
                        {it.addOns.length > 0 && ` · ${it.addOns.join(', ')}`}
                      </p>

                      {/* Notes */}
                      <textarea
                        value={it.instructions}
                        onChange={(e) =>
                          setEditItems((prev) =>
                            prev.map((el, i) =>
                              i === idx ? { ...el, instructions: e.target.value } : el
                            )
                          )
                        }
                        placeholder="Special instructions…"
                        rows={2}
                        maxLength={300}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none focus:border-red-400"
                      />

                      {/* Quantity controls */}
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            setEditItems((prev) => {
                              if (prev[idx].quantity <= 1) {
                                return prev.filter((_, i) => i !== idx);
                              }
                              return prev.map((el, i) =>
                                i === idx ? { ...el, quantity: el.quantity - 1 } : el
                              );
                            })
                          }
                          className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-lg font-semibold text-gray-700 transition-colors active:bg-gray-50"
                          aria-label="Decrease quantity"
                        >
                          −
                        </button>
                        <span className="text-sm font-semibold text-gray-900 min-w-[1.5rem] text-center">
                          {it.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setEditItems((prev) =>
                              prev.map((el, i) =>
                                i === idx ? { ...el, quantity: el.quantity + 1 } : el
                              )
                            )
                          }
                          className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-lg font-semibold text-gray-700 transition-colors active:bg-gray-50"
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Footer buttons */}
            <div className="px-4 pb-6 pt-3 flex flex-col gap-3 shrink-0 border-t border-gray-100">
              <button
                type="button"
                onClick={handleAddAnotherItem}
                className="w-full py-2.5 rounded-xl border border-qraving-red text-qraving-red text-sm font-semibold transition-colors active:bg-red-50"
              >
                Add another item
              </button>
              <button
                type="button"
                onClick={handleEditDone}
                className="w-full py-3 rounded-xl text-qraving-text text-base font-bold transition-opacity active:opacity-80 bg-qraving-button"
              >
                Done
              </button>
            </div>
          </>
        ) : step === 'customise' ? (
          /* ── Customise panel ── */
          <div className="overflow-y-auto">
            {/* Item header: thumbnail + name + price */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="relative w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-gray-100">
                <Image
                  src={item!.imageUrl}
                  alt={item!.name}
                  fill
                  className="object-cover"
                  sizes="64px"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 text-base leading-tight truncate">
                  {item!.name}
                </p>
                <p className="text-sm font-semibold mt-0.5 text-qraving-red">
                  ${item!.price.toFixed(2)} CAD
                </p>
              </div>
            </div>

            <div className="px-4 pb-6 flex flex-col gap-6 mt-2">
              {/* Size selector */}
              <section>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Size
                </h3>
                <div className="flex gap-2">
                  {SIZES.map((size) => {
                    const active = selectedSize === size;
                    return (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setSelectedSize(size)}
                        className={`flex-1 py-2 rounded-full text-sm font-semibold border transition-colors ${
                          active
                            ? 'bg-qraving-red border-qraving-red text-white'
                            : 'bg-transparent border-gray-300 text-gray-700'
                        }`}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Add-ons */}
              <section>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Add-ons
                </h3>
                <ul className="flex flex-col divide-y divide-gray-100">
                  {ADD_ONS.map((addOn) => {
                    const checked = selectedAddOns.includes(addOn);
                    return (
                      <li key={addOn}>
                        <label className="flex items-center justify-between py-3 cursor-pointer select-none">
                          <span className="text-sm text-gray-800">{addOn}</span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAddOn(addOn)}
                            className="w-4 h-4 rounded accent-qraving-red cursor-pointer"
                          />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>

              {/* Special instructions */}
              <section>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Special Instructions
                </h3>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g. no onions, extra spicy…"
                  rows={3}
                  maxLength={300}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none focus:border-red-400"
                />
              </section>

              {/* Add to basket */}
              <button
                type="button"
                onClick={handleAddToBasket}
                aria-label={`Add ${item!.name} to basket`}
                className="w-full py-3 rounded-xl text-qraving-text text-base font-bold transition-opacity active:opacity-80 bg-qraving-button"
              >
                Add to basket
              </button>
            </div>
          </div>
        ) : step === 'identity' ? (
          /* ── Identity panel ── */
          <div className="px-4 pt-4 pb-6 flex flex-col gap-5 overflow-y-auto">
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Who&apos;s ordering?</h2>
              <p className="text-sm text-gray-500">
                We&apos;ll use this to label your items in the basket.
              </p>
            </div>

            {/* Name field */}
            <div>
              <label
                htmlFor="identity-name"
                className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2"
              >
                Your name
              </label>
              <input
                id="identity-name"
                type="text"
                value={identityName}
                onChange={(e) => setIdentityName(e.target.value.slice(0, 50))}
                maxLength={50}
                placeholder="e.g. Alex"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-red-400"
              />
            </div>

            {/* Phone number — three segmented inputs */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Phone number
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-700 shrink-0">+1</span>

                <input
                  ref={seg0Ref}
                  type="tel"
                  inputMode="numeric"
                  value={segments[0]}
                  onChange={(e) => handleSegmentChange(0, e.target.value)}
                  onKeyDown={(e) => handleSegmentKeyDown(0, e)}
                  maxLength={SEGMENTS[0].maxLength}
                  placeholder="XXX"
                  aria-label="Area code"
                  className="w-16 rounded-xl border border-gray-200 px-2 py-2.5 text-sm text-gray-800 text-center placeholder-gray-400 focus:outline-none focus:border-red-400"
                />

                <span className="text-gray-400 select-none">·</span>

                <input
                  ref={seg1Ref}
                  type="tel"
                  inputMode="numeric"
                  value={segments[1]}
                  onChange={(e) => handleSegmentChange(1, e.target.value)}
                  onKeyDown={(e) => handleSegmentKeyDown(1, e)}
                  maxLength={SEGMENTS[1].maxLength}
                  placeholder="XXX"
                  aria-label="Exchange"
                  className="w-16 rounded-xl border border-gray-200 px-2 py-2.5 text-sm text-gray-800 text-center placeholder-gray-400 focus:outline-none focus:border-red-400"
                />

                <span className="text-gray-400 select-none">·</span>

                <input
                  ref={seg2Ref}
                  type="tel"
                  inputMode="numeric"
                  value={segments[2]}
                  onChange={(e) => handleSegmentChange(2, e.target.value)}
                  onKeyDown={(e) => handleSegmentKeyDown(2, e)}
                  maxLength={SEGMENTS[2].maxLength}
                  placeholder="XXXX"
                  aria-label="Subscriber number"
                  className="w-20 rounded-xl border border-gray-200 px-2 py-2.5 text-sm text-gray-800 text-center placeholder-gray-400 focus:outline-none focus:border-red-400"
                />
              </div>
            </div>

            {/* Email field (optional) */}
            <div>
              <label
                htmlFor="identity-email"
                className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2"
              >
                Email <span className="normal-case font-normal text-gray-400">(optional)</span>
              </label>
              <input
                id="identity-email"
                type="email"
                inputMode="email"
                value={identityEmail}
                onChange={(e) => setIdentityEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-red-400"
              />
            </div>

            {/* Add to basket — disabled until phone is complete */}
            <button
              type="button"
              onClick={handleCommitWithIdentity}
              disabled={!phoneComplete}
              aria-label="Add to basket"
              className="w-full py-3 rounded-xl text-qraving-text text-base font-bold transition-opacity active:opacity-80 bg-qraving-button disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add to basket
            </button>
          </div>
        ) : (
          /* ── Actions panel ── */
          <div className="px-4 pt-4 pb-6 flex flex-col gap-0 overflow-y-auto">
            <button
              type="button"
              onClick={handleAddMore}
              className="w-full py-3 rounded-xl text-qraving-text text-base font-bold transition-opacity active:opacity-80 bg-qraving-button"
            >
              Add more
            </button>

            <div className="border-t border-gray-100 my-5" />

            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-gray-600">I am done, passing to next person</p>
              <button
                type="button"
                onClick={handlePass}
                className="shrink-0 px-4 py-2 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 transition-colors active:bg-gray-50"
              >
                PASS
              </button>
            </div>

            <div className="border-t border-gray-100 my-5" />

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-gray-600">We are done with this table.</p>
                <button
                  type="button"
                  onClick={() => setShowFinishConfirm(true)}
                  className="shrink-0 px-4 py-2 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 transition-colors active:bg-gray-50"
                >
                  Finish
                </button>
              </div>

              {showFinishConfirm && (
                <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2.5">
                  <p className="text-sm text-gray-600">Are you sure?</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowFinishConfirm(false)}
                      className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 transition-colors active:bg-gray-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleFinishConfirm}
                      className="px-3 py-1.5 rounded-lg bg-qraving-red text-white text-sm font-semibold transition-opacity active:opacity-80"
                    >
                      Yes, finish
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
