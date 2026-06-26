'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import CardSwiper, { CardSwiperRef } from '@/components/CardSwiper';
import { MenuSection, MenuItem } from '@/lib/menu';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SectionNavigatorProps {
  sections: MenuSection[];
  onAddToCart: (item: MenuItem) => void;
  /** Called whenever the active section changes, with the new section's name. */
  onActiveSectionChange?: (name: string) => void;
}

type SwipeDirection = 'up' | 'down';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum vertical pixel movement to register a section swipe. */
const VERTICAL_SWIPE_THRESHOLD = 60;

/** Section transition animation duration in milliseconds. */
const TRANSITION_DURATION = 300;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SectionNavigator({
  sections,
  onAddToCart,
  onActiveSectionChange,
}: SectionNavigatorProps) {
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);

  /**
   * Direction of the last section transition. Controls which CSS animation
   * class is applied to the incoming section content.
   *  - 'up'   → advancing forward (slide in from bottom)
   *  - 'down' → going back (slide in from top)
   */
  const [direction, setDirection] = useState<SwipeDirection>('up');

  /**
   * Toggled each time we switch sections so React re-mounts the animated
   * wrapper and re-triggers the CSS animation even when the direction stays
   * the same.
   */
  const [animationKey, setAnimationKey] = useState(0);

  /** Guards against overlapping transition gestures. */
  const isTransitioning = useRef(false);

  /** One ref per section so we can call goToCard() on the target swiper. */
  const swiperRefs = useRef<(CardSwiperRef | null)[]>([]);

  /** Ref for the outer container — used to attach a non-passive touchmove listener. */
  const containerRef = useRef<HTMLDivElement | null>(null);

  // -------------------------------------------------------------------------
  // Touch tracking for vertical gesture detection
  // -------------------------------------------------------------------------

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // -------------------------------------------------------------------------
  // Section navigation
  // -------------------------------------------------------------------------

  const goToSection = useCallback(
    (nextIndex: number, dir: SwipeDirection, goToLast = false) => {
      if (isTransitioning.current) return;
      if (nextIndex < 0 || nextIndex >= sections.length) return;

      isTransitioning.current = true;
      setDirection(dir);
      setAnimationKey((k) => k + 1);
      setActiveSectionIndex(nextIndex);
      onActiveSectionChange?.(sections[nextIndex].name);

      const targetRef = swiperRefs.current[nextIndex];
      if (targetRef) {
        const targetSection = sections[nextIndex];
        const cardIndex = goToLast ? targetSection.items.length - 1 : 0;
        targetRef.goToCard(cardIndex);
      }

      setTimeout(() => {
        isTransitioning.current = false;
      }, TRANSITION_DURATION);
    },
    [sections, onActiveSectionChange]
  );

  // -------------------------------------------------------------------------
  // CardSwiper boundary callbacks
  // -------------------------------------------------------------------------

  const handleNextSection = useCallback(
    (fromIndex: number) => {
      goToSection(fromIndex + 1, 'up', false);
    },
    [goToSection]
  );

  const handlePrevSection = useCallback(
    (fromIndex: number, opts: { goToLast: boolean }) => {
      goToSection(fromIndex - 1, 'down', opts.goToLast);
    },
    [goToSection]
  );

  // -------------------------------------------------------------------------
  // Touch event handlers for vertical section swipe
  // -------------------------------------------------------------------------

  function onTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  // Non-passive touchmove listener — must be imperative because React attaches
  // events passively on mobile browsers, making e.preventDefault() a no-op.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function handleTouchMove(e: TouchEvent) {
      if (touchStartY.current === null || touchStartX.current === null) return;
      const deltaY = e.touches[0].clientY - touchStartY.current;
      const deltaX = e.touches[0].clientX - touchStartX.current;
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        e.preventDefault();
      }
    }

    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', handleTouchMove);
  }, []);

  function onTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    if (touchStartX.current === null || touchStartY.current === null) return;

    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;

    touchStartX.current = null;
    touchStartY.current = null;

    const isVertical = Math.abs(deltaY) > Math.abs(deltaX);
    if (!isVertical || Math.abs(deltaY) < VERTICAL_SWIPE_THRESHOLD) return;

    if (deltaY < 0) {
      goToSection(activeSectionIndex + 1, 'up', false);
    } else {
      goToSection(activeSectionIndex - 1, 'down', false);
    }
  }

  // -------------------------------------------------------------------------
  // Animation helpers
  // -------------------------------------------------------------------------

  function getAnimationStyle(): React.CSSProperties {
    const fromY = direction === 'up' ? '100%' : '-100%';
    return {
      animation: `sectionSlideIn ${TRANSITION_DURATION}ms ease-out forwards`,
      ['--from-y' as string]: fromY,
    };
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (sections.length === 0) return null;

  const activeSection = sections[activeSectionIndex];

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden"
      style={{ touchAction: 'none' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <style>{`
        @keyframes sectionSlideIn {
          from { transform: translateY(var(--from-y, 100%)); }
          to   { transform: translateY(0); }
        }
      `}</style>

      {/* Section content — re-keyed on every transition to retrigger animation */}
      <div
        key={animationKey}
        className="absolute inset-0"
        style={getAnimationStyle()}
      >
        <CardSwiper
          ref={(el) => { swiperRefs.current[activeSectionIndex] = el; }}
          items={activeSection.items}
          onNextSection={() => handleNextSection(activeSectionIndex)}
          onPrevSection={(opts) => handlePrevSection(activeSectionIndex, opts)}
          onAddToCart={onAddToCart}
        />
      </div>
    </div>
  );
}
