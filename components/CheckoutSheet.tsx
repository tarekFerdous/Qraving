'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Session, UserBasket } from '@/lib/session';
import { MenuItem } from '@/lib/menu';
import { computeBasketTotal, resolvePaymentMode } from '@/lib/payment';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckoutSheetProps {
  session: Session;
  basket: UserBasket;
  menuItems: MenuItem[];
  onClose: () => void;
}

type View = 'checkout' | 'confirmed';
type LoadState = 'idle' | 'loading' | 'error';
type InteracState = 'idle' | 'loading' | 'error';
type EmailState = 'idle' | 'loading' | 'sent' | 'error';

// Extend window for Helcim.js global
declare global {
  interface Window {
    appendHelcimIframe?: (token: string) => void;
  }
}

// ---------------------------------------------------------------------------
// Small inline SVG helpers (no extra deps)
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <svg
      className="animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#16a34a"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CheckoutSheet({
  session,
  basket,
  menuItems,
  onClose,
}: CheckoutSheetProps) {
  const [visible, setVisible] = useState(false);
  const [view, setView] = useState<View>('checkout');
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [interacState, setInteracState] = useState<InteracState>('idle');
  const [supportsApplePay, setSupportsApplePay] = useState(false);
  const [email, setEmail] = useState('');
  const [emailState, setEmailState] = useState<EmailState>('idle');
  const [countdown, setCountdown] = useState<string | null>(null);

  // Track the active Helcim message listener for cleanup
  const messageListenerRef = useRef<((e: MessageEvent) => void) | null>(null);

  const total = computeBasketTotal(basket, menuItems);
  const totalFormatted = `$${total.toFixed(2)} CAD`;

  const paymentMode = resolvePaymentMode(session);
  const isSplit = paymentMode === 'split';

  // Baskets that still need to pay (excluding current basket and empty baskets)
  const unpaidCount = session.baskets.filter(
    (b) => b.paymentStatus !== 'paid' && b.userId !== basket.userId && b.items.length > 0,
  ).length;

  // Detect Apple Pay support client-side only
  useEffect(() => {
    setSupportsApplePay(typeof window !== 'undefined' && 'ApplePaySession' in window);
  }, []);

  // Countdown timer for split-payment deadline
  useEffect(() => {
    if (!isSplit || !session.paymentDeadline) {
      setCountdown(null);
      return;
    }

    function computeCountdown() {
      const deadlineMs = new Date(session.paymentDeadline!).getTime();
      const remaining = Math.max(0, deadlineMs - Date.now());
      const totalSeconds = Math.floor(remaining / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    setCountdown(computeCountdown());
    const interval = setInterval(() => setCountdown(computeCountdown()), 1000);
    return () => clearInterval(interval);
  }, [isSplit, session.paymentDeadline]);

  // Slide up on mount
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Clean up Helcim message listener on unmount
  useEffect(() => {
    return () => {
      if (messageListenerRef.current) {
        window.removeEventListener('message', messageListenerRef.current);
        messageListenerRef.current = null;
      }
    };
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 300);
  }, [onClose]);

  // Dynamically load the Helcim.js script (idempotent — won't double-load)
  function loadHelcimScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[src*="helcim-pay/services/start.js"]')) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://js.helcim.com/helcim-pay/services/start.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Helcim.js'));
      document.head.appendChild(script);
    });
  }

  // Initiate payment with Helcim
  async function initiatePayment(paymentMode: 'wallet' | 'card') {
    if (loadState === 'loading') return;
    setLoadState('loading');

    // Remove any stale Helcim listener
    if (messageListenerRef.current) {
      window.removeEventListener('message', messageListenerRef.current);
      messageListenerRef.current = null;
    }

    try {
      const res = await fetch('/api/payment/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          basketId: basket.userId,
          paymentMode,
        }),
      });

      if (!res.ok) {
        setLoadState('error');
        return;
      }

      const data = (await res.json()) as { token?: string };
      if (!data.token) {
        setLoadState('error');
        return;
      }

      // Test-mode sentinel: no real Helcim credentials configured
      if (data.token === '__test__') {
        setLoadState('idle');
        setTimeout(() => setView('confirmed'), 800);
        return;
      }

      // Load Helcim.js and render the iframe into #helcim-pay-frame
      await loadHelcimScript();

      if (typeof window.appendHelcimIframe !== 'function') {
        setLoadState('error');
        return;
      }
      window.appendHelcimIframe(data.token);

      // Wire up the Helcim postMessage listener
      const handleMessage = (event: MessageEvent) => {
        if (
          event.data &&
          typeof event.data === 'object' &&
          event.data.eventName === 'transaction'
        ) {
          if (event.data.eventStatus === 'APPROVED') {
            setView('confirmed');
          } else {
            setLoadState('error');
          }
          window.removeEventListener('message', handleMessage);
          messageListenerRef.current = null;
        }
      };

      messageListenerRef.current = handleMessage;
      window.addEventListener('message', handleMessage);

      setLoadState('idle');
    } catch {
      setLoadState('error');
    }
  }

  // Initiate Interac Online payment (redirect-based flow)
  async function initiateInteracPayment() {
    if (interacState === 'loading') return;
    setInteracState('loading');

    try {
      const res = await fetch('/api/payment/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          basketId: basket.userId,
          paymentMode: 'interac',
        }),
      });

      if (!res.ok) {
        setInteracState('error');
        return;
      }

      const data = (await res.json()) as { redirectUrl?: string };
      if (!data.redirectUrl) {
        setInteracState('error');
        return;
      }

      // Redirect the browser to the bank's Interac Online page
      window.location.href = data.redirectUrl;
    } catch {
      setInteracState('error');
    }
  }

  // Submit optional email receipt
  async function handleEmailReceipt() {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) return;
    setEmailState('loading');
    try {
      const res = await fetch('/api/receipts/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmed,
          name: basket.name,
          items: basket.items,
          total,
          sessionId: session.id,
        }),
      });
      setEmailState(res.ok ? 'sent' : 'error');
    } catch {
      setEmailState('error');
    }
  }

  return (
    <>
      {/* Backdrop — only tappable on the checkout view */}
      <div
        className="fixed lg:absolute inset-0 z-40 bg-black/50"
        style={{ opacity: visible ? 1 : 0, transition: 'opacity 300ms ease' }}
        onClick={view === 'checkout' ? handleClose : undefined}
        aria-hidden="true"
      />

      {/* Full-screen sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={view === 'checkout' ? 'Checkout' : 'Payment confirmed'}
        className="fixed lg:absolute inset-0 z-50 bg-qraving-bg flex flex-col overflow-y-auto"
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {view === 'checkout' ? (
          /* ── Checkout view ── */
          <div className="flex flex-col flex-1 px-4 pt-8 pb-10 gap-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-gray-900">Checkout</h1>
              <button
                type="button"
                onClick={handleClose}
                className="text-sm font-semibold text-gray-500 active:opacity-60"
              >
                Cancel
              </button>
            </div>

            {/* Total display */}
            <div className="bg-white rounded-2xl px-5 py-4 border border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Your total
              </p>
              <p className="text-4xl font-bold text-gray-900">{totalFormatted}</p>
            </div>

            {/* Split-payment countdown */}
            {isSplit && countdown !== null && (
              <div className="flex items-center justify-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-amber-600 shrink-0"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <p className="text-sm font-semibold text-amber-800">
                  {countdown} remaining to complete payment
                </p>
              </div>
            )}

            {/* Error state */}
            {loadState === 'error' && (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                <p className="text-sm text-red-700">Payment failed. Please try again.</p>
                <button
                  type="button"
                  onClick={() => setLoadState('idle')}
                  className="text-sm font-bold text-red-700 shrink-0 active:opacity-60"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Payment options */}
            <div className="flex flex-col gap-3">
              {/* Apple Pay — shown only when supported */}
              {supportsApplePay && (
                <button
                  type="button"
                  disabled={loadState === 'loading'}
                  onClick={() => initiatePayment('wallet')}
                  className="w-full py-3.5 rounded-xl bg-black text-white font-semibold text-base flex items-center justify-center gap-2 transition-opacity active:opacity-80 disabled:opacity-40"
                >
                  {loadState === 'loading' ? (
                    <Spinner />
                  ) : (
                    <>
                      {/* Apple Pay wordmark (inline SVG for no-dep) */}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 165.521 128"
                        width="20"
                        height="16"
                        aria-hidden="true"
                        fill="white"
                      >
                        <path d="M150.698 0H14.823C6.633 0 0 6.634 0 14.823V113.18C0 121.369 6.633 128 14.823 128h135.875c8.189 0 14.823-6.631 14.823-14.82V14.823C165.521 6.634 158.887 0 150.698 0z" />
                        <path
                          fill="#000"
                          d="M47.23 30.505c1.895-2.313 3.17-5.487 2.826-8.713-2.735.136-6.053 1.822-8.01 4.136-1.764 2.03-3.311 5.293-2.899 8.408 3.056.233 6.15-1.548 8.083-3.83zM50.02 35.02c-4.461-.266-8.256 2.533-10.377 2.533-2.139 0-5.393-2.403-8.929-2.336-4.594.067-8.857 2.668-11.199 6.806-4.797 8.278-1.264 20.54 3.398 27.287 2.264 3.323 4.999 6.982 8.6 6.848 3.398-.133 4.727-2.203 8.864-2.203 4.127 0 5.326 2.203 8.929 2.136 3.734-.067 6.069-3.323 8.333-6.648 2.598-3.79 3.66-7.45 3.73-7.647-.08-.067-7.192-2.78-7.26-11.002-.067-6.878 5.611-10.2 5.879-10.334-3.2-4.727-8.193-5.246-9.967-5.44z"
                        />
                      </svg>
                      Pay with Apple Pay
                    </>
                  )}
                </button>
              )}

              {/* Google Pay — always shown */}
              <button
                type="button"
                disabled={loadState === 'loading'}
                onClick={() => initiatePayment('wallet')}
                className="w-full py-3.5 rounded-xl bg-white border border-gray-300 text-gray-800 font-semibold text-base flex items-center justify-center gap-2 transition-opacity active:opacity-80 disabled:opacity-40"
              >
                {loadState === 'loading' ? (
                  <Spinner />
                ) : (
                  <>
                    {/* Google Pay "G" mark */}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      width="20"
                      height="20"
                      aria-hidden="true"
                    >
                      <path
                        d="M12 11.5v2.6h4.46c-.19 1.19-.79 2.2-1.68 2.87l2.62 2.04c1.53-1.41 2.41-3.49 2.41-5.96 0-.57-.05-1.12-.14-1.64H12z"
                        fill="#4285F4"
                      />
                      <path
                        d="M5.44 14.29l-.59.46-2.1 1.63C4.08 18.91 7.8 21 12 21c2.7 0 4.96-.89 6.61-2.41l-2.62-2.04c-.89.6-2.03.96-3.99.96-3.07 0-5.68-2.08-6.56-4.22z"
                        fill="#34A853"
                      />
                      <path
                        d="M2.75 6.63C2.27 7.66 2 8.8 2 12s.27 4.34.75 5.37L5.44 14.29C5.16 13.57 5 12.8 5 12s.16-1.57.44-2.29L2.75 6.63z"
                        fill="#FBBC04"
                      />
                      <path
                        d="M12 5c1.72 0 3.26.59 4.48 1.74l2.48-2.48C17.07 2.25 14.81 1 12 1 7.8 1 4.08 3.09 2.75 6.63l2.69 2.08C6.32 7.08 8.93 5 12 5z"
                        fill="#EA4335"
                      />
                    </svg>
                    Pay with Google Pay
                  </>
                )}
              </button>

              {/* Interac Online — shown only in split-payment mode */}
              {isSplit && (
                <>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs text-gray-400 font-medium">or split pay</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>

                  <button
                    type="button"
                    disabled={interacState === 'loading'}
                    onClick={initiateInteracPayment}
                    className="w-full py-3.5 rounded-xl bg-[#D52B1E] text-white font-semibold text-base flex items-center justify-center gap-2 transition-opacity active:opacity-80 disabled:opacity-40"
                  >
                    {interacState === 'loading' ? (
                      <>
                        <Spinner />
                        <span>Redirecting to bank…</span>
                      </>
                    ) : (
                      <>
                        {/* Interac wordmark (maple leaf silhouette) */}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          width="20"
                          height="20"
                          aria-hidden="true"
                          fill="white"
                        >
                          <path d="M12 2 L14.5 8 L21 8.5 L16 13 L17.5 20 L12 16.5 L6.5 20 L8 13 L3 8.5 L9.5 8 Z" />
                        </svg>
                        Pay with Interac Online
                      </>
                    )}
                  </button>

                  {interacState === 'error' && (
                    <div className="flex items-center justify-between gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                      <p className="text-sm text-red-700">Interac redirect failed. Please try again.</p>
                      <button
                        type="button"
                        onClick={() => setInteracState('idle')}
                        className="text-sm font-bold text-red-700 shrink-0 active:opacity-60"
                      >
                        Retry
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400 font-medium">or pay by card</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              {/* Helcim embedded card form */}
              <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white">
                <div
                  id="helcim-pay-frame"
                  className="min-h-[200px] flex items-center justify-center"
                >
                  {/* Helcim.js renders into this div after appendHelcimIframe() */}
                  <p className="text-sm text-gray-400">Card entry will appear here.</p>
                </div>
                <p className="text-xs text-gray-400 text-center py-2 border-t border-gray-100">
                  Secure card entry powered by Helcim
                </p>
              </div>

              {/* Pay by Card trigger */}
              {loadState !== 'loading' && (
                <button
                  type="button"
                  onClick={() => initiatePayment('card')}
                  disabled={loadState === 'loading'}
                  className="w-full py-3 rounded-xl bg-qraving-red text-white font-bold text-base transition-opacity active:opacity-80 disabled:opacity-40"
                >
                  Pay by Card
                </button>
              )}

              {/* Loading overlay for card initiation */}
              {loadState === 'loading' && (
                <div className="flex items-center justify-center py-3 gap-2 text-gray-500">
                  <Spinner />
                  <span className="text-sm">Connecting to payment…</span>
                </div>
              )}
            </div>

            {/* Cancel link */}
            <button
              type="button"
              onClick={handleClose}
              className="text-sm text-gray-400 text-center mt-auto pt-2 active:opacity-60"
            >
              Cancel
            </button>
          </div>
        ) : (
          /* ── Confirmation view ── */
          <div className="flex flex-col flex-1 items-center justify-center px-8 py-10 gap-6">
            {/* Success icon */}
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckIcon />
            </div>

            <div className="flex flex-col items-center gap-2 text-center">
              <h1 className="text-2xl font-bold text-gray-900">Payment confirmed!</h1>
              <p className="text-xl font-semibold text-qraving-red">{totalFormatted} paid</p>
              <p className="text-sm text-gray-600">
                Thank you, <span className="font-semibold">{basket.name}</span>
              </p>
              <p className="text-sm text-gray-500">
                An SMS receipt has been sent to {basket.phone}
              </p>
            </div>

            {/* Multi-person unpaid notice */}
            {unpaidCount > 0 && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 text-center w-full">
                {unpaidCount === 1
                  ? '1 other member still needs to complete payment.'
                  : `${unpaidCount} other members still need to complete payment.`}{' '}
                The order will be placed once everyone has paid.
              </div>
            )}

            {/* Per-person payment status panel (split sessions with 2+ baskets) */}
            {session.baskets.length > 1 && (
              <div className="w-full rounded-2xl border border-gray-100 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Payment status
                  </p>
                  {session.paymentDeadline && countdown !== null && (
                    <p className="text-xs font-semibold text-amber-600">
                      {countdown} remaining
                    </p>
                  )}
                </div>
                <ul className="divide-y divide-gray-50">
                  {session.baskets
                    .filter((b) => b.items.length > 0)
                    .map((b) => (
                      <li key={b.userId} className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm font-medium text-gray-800">{b.name}</span>
                        {b.paymentStatus === 'paid' && (
                          <span className="text-xs font-bold text-green-700 bg-green-100 rounded-full px-2.5 py-0.5">
                            ✓ Paid
                          </span>
                        )}
                        {b.paymentStatus === 'pending' && (
                          <span className="text-xs font-bold text-amber-700 bg-amber-100 rounded-full px-2.5 py-0.5">
                            Pending
                          </span>
                        )}
                        {b.paymentStatus === 'failed' && (
                          <span className="text-xs font-bold text-red-700 bg-red-100 rounded-full px-2.5 py-0.5">
                            Failed
                          </span>
                        )}
                      </li>
                    ))}
                </ul>
              </div>
            )}

            {/* Optional email receipt */}
            <div className="w-full flex flex-col gap-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">
                Email receipt (optional)
              </p>

              {emailState === 'sent' ? (
                <p className="text-sm text-green-600 text-center font-semibold">
                  Email receipt sent!
                </p>
              ) : (
                <>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-red-400 bg-white"
                  />
                  {emailState === 'error' && (
                    <p className="text-xs text-red-500 text-center">
                      Failed to send email receipt.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={handleEmailReceipt}
                    disabled={emailState === 'loading' || !email.trim()}
                    className="w-full py-2.5 rounded-xl bg-qraving-red text-white font-semibold text-sm transition-opacity active:opacity-80 disabled:opacity-40"
                  >
                    {emailState === 'loading' ? 'Sending…' : 'Send email receipt'}
                  </button>
                </>
              )}
            </div>

            {/* Skip */}
            <button
              type="button"
              onClick={handleClose}
              className="text-sm text-gray-400 active:opacity-60"
            >
              Skip
            </button>
          </div>
        )}
      </div>
    </>
  );
}
