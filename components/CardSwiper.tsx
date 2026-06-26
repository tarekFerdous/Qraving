'use client';

import {
  forwardRef,
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

/** Minimum horizontal pixel movement to register a swipe. */
const SWIPE_THRESHOLD = 50;

/** Card slide animation duration in milliseconds. */
const ANIMATION_DURATION = 250;

/**
 * Each card occupies 76vw of the viewport width.
 * The first card starts with a left padding equal to the gap (12 px).
 * A 12px gap separates adjacent cards in the track.
 */
const CARD_WIDTH_VW = 76;
const CARD_GAP_PX = 12;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const CardSwiper = forwardRef<CardSwiperRef, CardSwiperProps>(
  function CardSwiper({ items, onNextSection, onPrevSection, onAddToCart }, ref) {
    const [currentIndex, setCurrentIndex] = useState(0);

    /**
     * When true, the track's CSS transition is active so the card slides
     * smoothly to the new position. Set to false for instant (programmatic) jumps.
     */
    const [isTransitioning, setIsTransitioning] = useState(false);

    /** Prevent overlapping swipe gestures while animating. */
    const isAnimating = useRef(false);

    // -----------------------------------------------------------------------
    // Touch / mouse drag tracking
    // -----------------------------------------------------------------------

    const touchStartX = useRef<number | null>(null);
    const mouseStartX = useRef<number | null>(null);
    const isDragging = useRef(false);

    // -----------------------------------------------------------------------
    // Track position
    // Each step moves by one card width (in vw) + the inter-card gap (in px).
    // This places the active card's left edge at CARD_LEFT_PADDING_VW from the container.
    // -----------------------------------------------------------------------

    const trackTranslateX = `calc(-${currentIndex} * (${CARD_WIDTH_VW}vw + ${CARD_GAP_PX}px))`;

    // -----------------------------------------------------------------------
    // Navigation helpers
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

    function handleSwipeLeft() {
      if (isAnimating.current) return;

      if (currentIndex < items.length - 1) {
        navigateTo(currentIndex + 1);
      } else {
        onNextSection();
      }
    }

    function handleSwipeRight() {
      if (isAnimating.current) return;

      if (currentIndex > 0) {
        navigateTo(currentIndex - 1);
      } else {
        onPrevSection({ goToLast: true });
      }
    }

    // -----------------------------------------------------------------------
    // Imperative handle
    // -----------------------------------------------------------------------

    useImperativeHandle(ref, () => ({
      goToCard(index: number) {
        const clamped = Math.max(0, Math.min(index, items.length - 1));
        // Instant jump — no animation
        setIsTransitioning(false);
        setCurrentIndex(clamped);
        isAnimating.current = false;
      },
    }));

    // -----------------------------------------------------------------------
    // Touch event handlers
    // -----------------------------------------------------------------------

    function onTouchStart(e: React.TouchEvent<HTMLDivElement>) {
      touchStartX.current = e.touches[0].clientX;
    }

    function onTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
      if (touchStartX.current === null) return;
      const deltaX = e.changedTouches[0].clientX - touchStartX.current;
      touchStartX.current = null;

      if (Math.abs(deltaX) < SWIPE_THRESHOLD) return;

      if (deltaX < 0) {
        handleSwipeLeft();
      } else {
        handleSwipeRight();
      }
    }

    // -----------------------------------------------------------------------
    // Mouse drag event handlers (for dev / desktop testing)
    // -----------------------------------------------------------------------

    function onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
      mouseStartX.current = e.clientX;
      isDragging.current = true;
    }

    function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
      if (isDragging.current) {
        e.preventDefault();
      }
    }

    function onMouseUp(e: React.MouseEvent<HTMLDivElement>) {
      if (!isDragging.current || mouseStartX.current === null) return;
      const deltaX = e.clientX - mouseStartX.current;
      mouseStartX.current = null;
      isDragging.current = false;

      if (Math.abs(deltaX) < SWIPE_THRESHOLD) return;

      if (deltaX < 0) {
        handleSwipeLeft();
      } else {
        handleSwipeRight();
      }
    }

    function onMouseLeave() {
      mouseStartX.current = null;
      isDragging.current = false;
    }

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    if (items.length === 0) return null;

    return (
      <div
        className="w-full h-[60vh] overflow-hidden relative select-none"
        style={{ touchAction: 'pan-y' }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      >
        {/*
          Card track — all cards sit side-by-side in a flex row.
          Translating the track centers the active card with 2vw left breathing room.
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
                width: `${CARD_WIDTH_VW}vw`,
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
