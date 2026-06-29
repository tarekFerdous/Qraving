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
import { computeCarouselOffset, resolveSnapIndex } from '@/lib/carousel';

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
  /** Animate any flipped card back to its front face. */
  resetFlips: () => void;
  /** Whether the currently-active card is showing its back face. */
  isActiveCardFlipped: () => boolean;
  /** Update live drag offset (px delta from gesture start). No-ops while animating. */
  drag: (dx: number) => void;
  /** Snap to the nearest card based on current drag offset; resets drag to 0. */
  snapToNearest: () => void;
}

interface CardSwiperProps {
  items: MenuItem[];
  onNextSection: () => void;
  onPrevSection: (opts: { goToLast: boolean }) => void;
  onAddToCart: (item: MenuItem) => void;
  /** True for the first section so its first card gets eager LCP image loading. */
  priorityLoad?: boolean;
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
// CardSwiper owns the horizontal card state and the per-card flip state. It no
// longer captures any gesture itself — the unified gesture engine in
// SectionNavigator resolves intent and drives this component through the
// imperative ref, keeping both axes on one engine and "one flick = one step".
//
// Flip state lives here (not in MenuCard) so navigation can reset it: moving to
// another card — or, via the parent, another category — animates the previously
// flipped card back to its front, and cards always (re)enter front-first.
// ---------------------------------------------------------------------------

const CardSwiper = forwardRef<CardSwiperRef, CardSwiperProps>(
  function CardSwiper({ items, onNextSection, onPrevSection, onAddToCart, priorityLoad = false }, ref) {
    const [currentIndex, setCurrentIndex] = useState(0);

    /** Index of the card currently flipped to its back, or null if all front. */
    const [flippedIndex, setFlippedIndex] = useState<number | null>(null);

    /**
     * When true, the track's CSS transition is active so the card slides
     * smoothly to the new position. Set to false for instant (programmatic) jumps.
     */
    const [isTransitioning, setIsTransitioning] = useState(false);

    /** Live drag offset in pixels (delta from gesture start). */
    const [dragOffsetPx, setDragOffsetPx] = useState(0);

    /** Prevent overlapping card animations. */
    const isAnimating = useRef(false);

    // Mirror current/flip/drag state into refs so the imperative handle reads
    // fresh values regardless of when the gesture engine calls it.
    const currentIndexRef = useRef(currentIndex);
    currentIndexRef.current = currentIndex;
    const flippedIndexRef = useRef(flippedIndex);
    flippedIndexRef.current = flippedIndex;
    const dragOffsetPxRef = useRef(dragOffsetPx);
    dragOffsetPxRef.current = dragOffsetPx;

    // -----------------------------------------------------------------------
    // Container measurement — card widths are relative to the container, not
    // the viewport, so they stay correct inside a constrained 640px column.
    // -----------------------------------------------------------------------

    const containerRef = useRef<HTMLDivElement>(null);
    const [cardWidthPx, setCardWidthPx] = useState(0);
    const [contentWidthPx, setContentWidthPx] = useState(0);
    const cardWidthPxRef = useRef(0);
    cardWidthPxRef.current = cardWidthPx;

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          const { width } = entry.contentRect;
          setContentWidthPx(width);
          setCardWidthPx(width * CARD_WIDTH_RATIO);
        }
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    // -----------------------------------------------------------------------
    // Track position — pure pixels once the container has been measured.
    // Falls back to a CSS calc() before the ResizeObserver fires.
    // -----------------------------------------------------------------------

    const trackTranslateX =
      cardWidthPx > 0
        ? computeCarouselOffset(currentIndex, dragOffsetPx, cardWidthPx, CARD_GAP_PX, contentWidthPx)
        : `calc(-${currentIndex} * (${CARD_WIDTH_RATIO * 100}vw + ${CARD_GAP_PX}px))`;

    // -----------------------------------------------------------------------
    // Navigation
    // -----------------------------------------------------------------------

    function navigateTo(nextIndex: number) {
      if (isAnimating.current) return;
      isAnimating.current = true;

      // Leaving the current card → flip any flipped card back to front (animated).
      setFlippedIndex(null);
      setDragOffsetPx(0);
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
        // Instant jump — no animation. Always lands front-first with no drag state.
        setFlippedIndex(null);
        setDragOffsetPx(0);
        setIsTransitioning(false);
        setCurrentIndex(clamped);
        isAnimating.current = false;
      },
      resetFlips() {
        // Animated flip-back (state change drives MenuCard's 3D flip transition).
        setFlippedIndex(null);
      },
      isActiveCardFlipped() {
        return flippedIndexRef.current === currentIndexRef.current;
      },
      drag(dx: number) {
        if (isAnimating.current) return;
        setDragOffsetPx(dx);
      },
      snapToNearest() {
        if (isAnimating.current) return;
        const nearest = resolveSnapIndex(
          currentIndexRef.current,
          dragOffsetPxRef.current,
          cardWidthPxRef.current,
          CARD_GAP_PX,
          items.length
        );
        navigateTo(nearest);
      },
    }));

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    if (items.length === 0) return null;

    return (
      <div
        ref={containerRef}
        className="w-full h-full overflow-visible relative select-none px-[6px]"
      >
        {/*
          Card track — all cards sit side-by-side in a flex row.
          Translating the track centers the active card with breathing room.
          Adjacent cards peek in at the edges, dimmed by a scrim overlay so the
          active card's own content (name, price, description, buttons) is never
          touched by the slide transition and stays fully visible mid-swipe.
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
          {items.map((item, i) => {
            const isActive = i === currentIndex;
            return (
              <div
                key={item.id}
                className="h-full shrink-0 relative"
                style={{
                  width: cardWidthPx > 0 ? `${cardWidthPx}px` : `${CARD_WIDTH_RATIO * 100}vw`,
                }}
              >
                <MenuCard
                  item={item}
                  onAddToCart={onAddToCart}
                  flipped={flippedIndex === i}
                  onFlipChange={(f) => setFlippedIndex(f ? i : null)}
                  priority={priorityLoad && i === 0}
                />
                {/* Peek dimming — only the inactive (side) cards read as secondary. */}
                {!isActive && (
                  <div
                    aria-hidden
                    className="absolute inset-0 rounded-3xl pointer-events-none"
                    style={{ backgroundColor: 'rgba(232,240,215,0.55)' }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);

export default CardSwiper;
