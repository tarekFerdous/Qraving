'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { MenuItem } from '@/lib/menu';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CartItem {
  itemId: string;
  name: string;
  size: 'Small' | 'Medium' | 'Large';
  addOns: string[];
  instructions: string;
  quantity: number;
}

interface CartState {
  ownerName: string;
  items: CartItem[];
}

interface AddToCartSheetProps {
  item: MenuItem | null; // null = sheet is closed
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CART_KEY = 'qraving_cart';
const SIZES = ['Small', 'Medium', 'Large'] as const;
const ADD_ONS = ['Extra Sauce', 'Double Portion', 'Extra Cheese', 'No Ice'] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readCart(): CartState {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return { ownerName: '', items: [] };
    return JSON.parse(raw) as CartState;
  } catch {
    return { ownerName: '', items: [] };
  }
}

function writeCart(cart: CartState): void {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch {
    // silently ignore (private browsing quota errors, etc.)
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AddToCartSheet({ item, onClose }: AddToCartSheetProps) {
  // --- Customisation state ---
  const [selectedSize, setSelectedSize] = useState<'Small' | 'Medium' | 'Large'>('Medium');
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [instructions, setInstructions] = useState('');

  // --- Cart / name state ---
  const [ownerName, setOwnerName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');

  // --- Animation state ---
  const [visible, setVisible] = useState(false);

  // --- Drag state ---
  const dragStartY = useRef<number | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Read cart from localStorage on mount and whenever sheet opens
  useEffect(() => {
    if (item) {
      const cart = readCart();
      setOwnerName(cart.ownerName ?? '');
      // Reset customisation for each new item open
      setSelectedSize('Medium');
      setSelectedAddOns([]);
      setInstructions('');
      setIsEditingName(false);
      // Trigger slide-up animation after a microtask so the element is mounted first
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [item]);

  // Focus name input when editing starts
  useEffect(() => {
    if (isEditingName) {
      nameInputRef.current?.focus();
    }
  }, [isEditingName]);

  // --- Close handler: animate out then call onClose ---
  const handleClose = useCallback(() => {
    setVisible(false);
    // Wait for the CSS transition (300ms) to complete before unmounting
    setTimeout(onClose, 300);
  }, [onClose]);

  // --- Backdrop click ---
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

  // --- Add-on toggle ---
  const toggleAddOn = useCallback((addOn: string) => {
    setSelectedAddOns((prev) =>
      prev.includes(addOn) ? prev.filter((a) => a !== addOn) : [...prev, addOn]
    );
  }, []);

  // --- Name editing ---
  const startEditingName = useCallback(() => {
    setDraftName(ownerName);
    setIsEditingName(true);
  }, [ownerName]);

  const confirmName = useCallback(() => {
    const trimmed = draftName.trim();
    setOwnerName(trimmed);
    setIsEditingName(false);
    // Persist immediately
    const cart = readCart();
    writeCart({ ...cart, ownerName: trimmed });
  }, [draftName]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        confirmName();
      } else if (e.key === 'Escape') {
        setIsEditingName(false);
      }
    },
    [confirmName]
  );

  // --- Add to cart ---
  const handleAdd = useCallback(() => {
    if (!item) return;

    const newEntry: CartItem = {
      itemId: item.id,
      name: item.name,
      size: selectedSize,
      addOns: [...selectedAddOns],
      instructions: instructions.trim(),
      quantity: 1,
    };

    const cart = readCart();

    // Check for identical existing item (same id, size, addOns)
    const existingIndex = cart.items.findIndex(
      (ci) =>
        ci.itemId === newEntry.itemId &&
        ci.size === newEntry.size &&
        ci.addOns.length === newEntry.addOns.length &&
        ci.addOns.every((a) => newEntry.addOns.includes(a))
    );

    if (existingIndex >= 0) {
      cart.items[existingIndex].quantity += 1;
    } else {
      cart.items.push(newEntry);
    }

    writeCart(cart);
    handleClose();
  }, [item, selectedSize, selectedAddOns, instructions, handleClose]);

  // Don't render if no item
  if (!item) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
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
        aria-label={`Customise ${item.name}`}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl overflow-y-auto"
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

        {/* ── Cart owner label ── */}
        <div className="px-4 pb-2">
          {isEditingName ? (
            <div className="flex items-center gap-2">
              <input
                ref={nameInputRef}
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={confirmName}
                onKeyDown={handleNameKeyDown}
                placeholder="Enter your name…"
                maxLength={50}
                className="flex-1 text-sm font-medium text-gray-800 border-b border-gray-300 focus:border-red-500 outline-none py-0.5 bg-transparent"
              />
              <button
                type="button"
                onClick={confirmName}
                className="text-xs font-semibold text-white px-2.5 py-1 rounded-lg"
                style={{ backgroundColor: '#E3000F' }}
              >
                OK
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={startEditingName}
              className="text-sm font-semibold text-left"
              style={{ color: '#E3000F' }}
            >
              {ownerName ? `${ownerName}'s cart` : 'Add your name…'}
            </button>
          )}
        </div>

        {/* ── Item header: thumbnail + name + price ── */}
        <div className="flex items-center gap-3 px-4 py-3 border-t border-gray-100">
          <div className="relative w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-gray-100">
            <Image
              src={item.imageUrl}
              alt={item.name}
              fill
              className="object-cover"
              sizes="64px"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-base leading-tight truncate">
              {item.name}
            </p>
            <p className="text-sm font-semibold mt-0.5" style={{ color: '#E3000F' }}>
              £{item.price.toFixed(2)}
            </p>
          </div>
        </div>

        {/* ── Customisation sections ── */}
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
                    className="flex-1 py-2 rounded-full text-sm font-semibold border transition-colors"
                    style={{
                      backgroundColor: active ? '#E3000F' : 'transparent',
                      borderColor: active ? '#E3000F' : '#d1d5db',
                      color: active ? '#ffffff' : '#374151',
                    }}
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
                        className="w-4 h-4 rounded accent-red-600 cursor-pointer"
                        style={{ accentColor: '#E3000F' }}
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

          {/* Add button */}
          <button
            type="button"
            onClick={handleAdd}
            className="w-full py-3 rounded-xl text-white text-base font-bold transition-opacity active:opacity-80"
            style={{ backgroundColor: '#E3000F' }}
          >
            Add to Cart
          </button>
        </div>
      </div>
    </>
  );
}
