'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import CardSwiper, { CardSwiperRef } from '@/components/CardSwiper';
import { MenuSection, MenuItem } from '@/lib/menu';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SectionNavigatorProps {
  sections: MenuSection[];
  onAddToCart: (item: MenuItem) => void;
  /** Pass true when a bottom sheet (e.g. AddToCart) is open to pause the peek. */
  isPeekPaused?: boolean;
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
  isPeekPaused = false,
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

  // -------------------------------------------------------------------------
  // Peek animation state
  // -------------------------------------------------------------------------

  /**
   * isPeeking: true while the peek strip is mounted in the DOM.
   * isVisible:  true while the strip should be translated into view (translateY(0)).
   * These two states drive the mount→animate→unmount lifecycle.
   */
  const [isPeeking, setIsPeeking] = useState(false);
  const [isPeekVisible, setIsPeekVisible] = useState(false);

  /** Handle for the inactivity interval so we can clear / reset it. */
  const peekIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Handle for in-flight peek animation timeouts so we can cancel them. */
  const peekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -------------------------------------------------------------------------
  // Peek animation logic
  // -------------------------------------------------------------------------

  /** Cancels any in-flight peek animation and unmounts the strip immediately. */
  const cancelPeek = useCallback(() => {
    if (peekTimeoutRef.current !== null) {
      clearTimeout(peekTimeoutRef.current);
      peekTimeoutRef.current = null;
    }
    setIsPeekVisible(false);
    setIsPeeking(false);
  }, []);

  /**
   * Fires the peek sequence:
   * 1. Mount the peek strip (isPeeking = true, strip sits off-screen at translateY(100%))
   * 2. Next animation frame: slide it in (isPeekVisible = true → translateY(0))
   * 3. After 1200ms: slide it out (isPeekVisible = false → translateY(100%))
   * 4. After another 300ms (transition done): unmount (isPeeking = false)
   */
  const triggerPeek = useCallback(() => {
    setIsPeeking(true);
    setIsPeekVisible(false);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsPeekVisible(true);

        peekTimeoutRef.current = setTimeout(() => {
          setIsPeekVisible(false);

          peekTimeoutRef.current = setTimeout(() => {
            setIsPeeking(false);
            peekTimeoutRef.current = null;
          }, 300);
        }, 1200);
      });
    });
  }, []);

  /**
   * (Re)starts the 5-second inactivity interval.
   * Called on mount, on every gesture, and whenever isPeekPaused goes false.
   */
  const resetPeekTimer = useCallback(() => {
    if (peekIntervalRef.current !== null) {
      clearInterval(peekIntervalRef.current);
      peekIntervalRef.current = null;
    }
    cancelPeek();
  }, [cancelPeek]);

  /** Set up (or tear down) the inactivity interval based on paused state and section position. */
  useEffect(() => {
    const isLastSection = activeSectionIndex === sections.length - 1;

    if (isPeekPaused || isLastSection || sections.length <= 1) {
      if (peekIntervalRef.current !== null) {
        clearInterval(peekIntervalRef.current);
        peekIntervalRef.current = null;
      }
      cancelPeek();
      return;
    }

    peekIntervalRef.current = setInterval(() => {
      triggerPeek();
    }, 5000);

    return () => {
      if (peekIntervalRef.current !== null) {
        clearInterval(peekIntervalRef.current);
        peekIntervalRef.current = null;
      }
    };
  }, [activeSectionIndex, sections.length, isPeekPaused, triggerPeek, cancelPeek]);

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
    resetPeekTimer();
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function onTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (touchStartY.current === null || touchStartX.current === null) return;

    const deltaY = e.touches[0].clientY - touchStartY.current;
    const deltaX = e.touches[0].clientX - touchStartX.current;

    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      e.preventDefault();
    }
  }

  function onTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    if (touchStartX.current === null || touchStartY.current === null) return;

    resetPeekTimer();

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
      className="relative w-full h-full overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
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

      {/* Peek strip — next-section hint that slides up from the bottom */}
      {isPeeking && (() => {
        const nextSection = sections[activeSectionIndex + 1];
        const firstItem = nextSection?.items[0];
        return (
          <div
            aria-hidden="true"
            className="fixed bottom-0 left-0 right-0 h-[90px] z-50 pointer-events-none overflow-hidden"
            style={{
              transform: isPeekVisible ? 'translateY(0)' : 'translateY(100%)',
              transition: 'transform 300ms ease-out',
            }}
          >
            {firstItem?.imageUrl && (
              <div className="absolute inset-0">
                <Image
                  src={firstItem.imageUrl}
                  alt=""
                  fill
                  className="object-cover"
                  style={{ filter: 'blur(8px)', transform: 'scale(1.1)' }}
                  sizes="100vw"
                />
              </div>
            )}

            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 100%)',
              }}
            />

            <div className="relative h-full flex flex-col items-center justify-center gap-0.5">
              <span
                className="text-white/80 text-xs font-medium tracking-wide"
                style={{ lineHeight: 1 }}
              >
                ↑
              </span>
              <span className="text-white text-sm font-semibold tracking-wide">
                Next: {nextSection?.name}
              </span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
