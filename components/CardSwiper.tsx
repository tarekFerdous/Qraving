'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import MenuCard from '@/components/MenuCard';
import { MenuItem } from '@/lib/menu';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CardSwiperRef {
  /** Advance one card forward, or hand off to the next section at the last card. */
  next: () => void;
  /** Step one card back, or hand off to the previous section at the first card. */
  prev: () => void;
  /** Instantly jump to a card index (clamped). Used for cross-axis landings. */
  goToCard: (index: number) => void;
}

interface CardSwiperProps {
  items: MenuItem[];
  onNextSection: () => void;
  onPrevSection: (opts: { goToLast: boolean }) => void;
  onAddToCart: (item: MenuItem) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Card slide animation duration in milliseconds. */
const ANIMATION_DURATION = 250;

/** Each card occupies this fraction of the container width. */
const CARD_WIDTH_RATIO = 0.76;

/** Gap between adjacent cards in pixels. */
const CARD_GAP_PX = 12;

// ---------------------------------------------------------------------------
// Component
//
// CardSwiper owns only the horizontal card state and presentation. It no longer
// captures any gesture itself — the unified gesture engine in SectionNavigator
// resolves intent and drives this component through the imperative ref. This
// keeps both axes on one engine and the "one flick = one step" guarantee intact.
// ---------------------------------------------------------------------------

const CardSwiper = forwardRef<CardSwiperRef, CardSwiperProps>(
  function CardSwiper({ items, onNextSection, onPrevSection, onAddToCart }, ref) {
    const [currentIndex, setCurrentIndex] = useState(0);

    /**
     * When true, the track's CSS transition is active so the card slides
     * smoothly to the new position. Set to false for instant (programmatic) jumps.
     */
    const [isTransitioning, setIsTransitioning] = useState(false);

    /** Prevent overlapping card animations. */
    const isAnimating = useRef(false);

    // -----------------------------------------------------------------------
    // Container measurement — card widths are relative to the container, not
    // the viewport, so they stay correct inside a constrained 640px column.
    // -----------------------------------------------------------------------

    const containerRef = useRef<HTMLDivElement>(null);
    const [cardWidthPx, setCardWidthPx] = useState(0);

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) setCardWidthPx(entry.contentRect.width * CARD_WIDTH_RATIO);
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    // -----------------------------------------------------------------------
    // Track position — pure pixels once the container has been measured.
    // -----------------------------------------------------------------------

    const trackTranslateX =
      cardWidthPx > 0
        ? `${-currentIndex * (cardWidthPx + CARD_GAP_PX)}px`
        : `calc(-${currentIndex} * (${CARD_WIDTH_RATIO * 100}vw + ${CARD_GAP_PX}px))`;

    // -----------------------------------------------------------------------
    // Navigation
    // -----------------------------------------------------------------------

    function navigateTo(nextIndex: number) {
      if (isAnimating.current) return;
      isAnimating.current = true;

      setIsTransitioning(true);
      setCurrentIndex(nextIndex);

      setTimeout(() => {
        setIsTransitioning(false);
        isAnimating.current = false;
      }, ANIMATION_DURATION);
    }

    // -----------------------------------------------------------------------
    // Imperative handle — the gesture engine calls these.
    // -----------------------------------------------------------------------

    useImperativeHandle(ref, () => ({
      next() {
        if (isAnimating.current) return;
        if (currentIndex < items.length - 1) {
          navigateTo(currentIndex + 1);
        } else {
          // Cross-axis handoff: past the last card → next section's first card.
          onNextSection();
        }
      },
      prev() {
        if (isAnimating.current) return;
        if (currentIndex > 0) {
          navigateTo(currentIndex - 1);
        } else {
          // Cross-axis handoff: past the first card → previous section's last card.
          onPrevSection({ goToLast: true });
        }
      },
      goToCard(index: number) {
        const clamped = Math.max(0, Math.min(index, items.length - 1));
        // Instant jump — no animation.
        setIsTransitioning(false);
        setCurrentIndex(clamped);
        isAnimating.current = false;
      },
    }));

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    if (items.length === 0) return null;

    return (
      <div
        ref={containerRef}
        className="w-full h-[60vh] overflow-visible relative select-none px-[6px]"
      >
        {/*
          Card track — all cards sit side-by-side in a flex row.
          Translating the track centers the active card with breathing room.
          Adjacent cards peek in at the left and right edges at 50% opacity.
        */}
        <div
          className="flex h-full"
          style={{
            gap: `${CARD_GAP_PX}px`,
            transform: `translateX(${trackTranslateX})`,
            transition: isTransitioning
              ? `transform ${ANIMATION_DURATION}ms ease-out`
              : 'none',
            willChange: 'transform',
          }}
        >
          {items.map((item, i) => (
            <div
              key={item.id}
              className="h-full shrink-0 transition-opacity duration-200"
              style={{
                width: cardWidthPx > 0 ? `${cardWidthPx}px` : `${CARD_WIDTH_RATIO * 100}vw`,
                opacity: i === currentIndex ? 1 : 0.5,
              }}
            >
              <MenuCard item={item} onAddToCart={onAddToCart} />
            </div>
          ))}
        </div>
      </div>
    );
  }
);

export default CardSwiper;
