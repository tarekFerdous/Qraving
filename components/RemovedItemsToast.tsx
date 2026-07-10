'use client';

import { useState } from 'react';

interface RemovedItemsToastResult {
  trigger: () => void;
  Toast: React.ReactNode;
}

export function useRemovedItemsToast(): RemovedItemsToastResult {
  const [show, setShow] = useState(false);

  function trigger() {
    setShow(true);
    setTimeout(() => setShow(false), 4000);
  }

  const Toast = show ? (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-full shadow-lg whitespace-nowrap"
    >
      Some items were removed because they are no longer available
    </div>
  ) : null;

  return { trigger, Toast };
}
