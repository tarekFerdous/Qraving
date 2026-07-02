'use client';

import {
  forwardRef,
  useCallback,
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
  next: () => void;
  prev: () => void;
  goToCard: (index: number) => void;
  resetFlips: () => void;
  isActiveCardFlipped: () => boolean;
  drag: (dx: number) => void;
  snapToNearest: () => void;
}

interface CardSwiperProps {
  items: MenuItem[];
  onNextSection: () => void;
  onPrevSection: (opts: { goToLast: boolean }) => void;
  onAddToCart: (item: MenuItem) => void;
  priorityLoad?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ANIMATION_DURATION = 250;
const CARD_WIDTH_RATIO = 0.76;
const CARD_GAP_PX = 12;

// ---------------------------------------------------------------------------
// Component
//
// Re-render budget:
//   - Drag: ZERO re-renders (transform via DOM ref, drag offset via ref)
//   - Navigation: ZERO re-renders when no card is flipped (setFlippedIndex(null)
//     is a React bail-out when flippedIndex is already null). ONE re-render only
//     when a flip is being reset — and only the previously-flipped MenuCard
//     re-renders (React.memo + stable onFlipChange via useCallback).
//   - currentIndex is a ref-only value; it is never needed in the render output.
// ---------------------------------------------------------------------------

const CardSwiper = forwardRef<CardSwiperRef, CardSwiperProps>(
  function CardSwiper({ items, onNextSection, onPrevSection, onAddToCart, priorityLoad = false }, ref) {
    const [flippedIndex, setFlippedIndex] = useState<number | null>(null);

    // cardWidthPx stays in state so card wrapper widths re-render on resize.
    const [cardWidthPx, setCardWidthPx] = useState(0);

    const isAnimating = useRef(false);

    // currentIndex is ref-only — it's never read in the render output, so
    // there's no reason to pay the re-render cost of useState.
    const currentIndexRef = useRef(0);
    const flippedIndexRef = useRef(flippedIndex);
    flippedIndexRef.current = flippedIndex;

    const dragOffsetPxRef = useRef(0);
    const cardWidthPxRef = useRef(0);
    const contentWidthPxRef = useRef(0);

    const containerRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);

    // -----------------------------------------------------------------------
    // Container measurement
    // -----------------------------------------------------------------------

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          const { width } = entry.contentRect;
          contentWidthPxRef.current = width;
          cardWidthPxRef.current = width * CARD_WIDTH_RATIO;
          setCardWidthPx(width * CARD_WIDTH_RATIO);
          applyTrackTransform(currentIndexRef.current, dragOffsetPxRef.current);
        }
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    // -----------------------------------------------------------------------
    // Track transform — DOM only, never React state.
    // -----------------------------------------------------------------------

    function applyTrackTransform(index: number, dragOffset: number) {
      const track = trackRef.current;
      const cw = cardWidthPxRef.current;
      const vw = contentWidthPxRef.current;
      if (!track || cw === 0) return;
      const offset = computeCarouselOffset(index, dragOffset, cw, CARD_GAP_PX, vw);
      track.style.transform = `translate3d(${offset}, 0, 0)`;
    }

    // -----------------------------------------------------------------------
    // Navigation
    // -----------------------------------------------------------------------

    function navigateTo(nextIndex: number) {
      if (isAnimating.current) return;
      isAnimating.current = true;

      const track = trackRef.current;
      if (track) {
        track.style.transition = `transform ${ANIMATION_DURATION}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
      }

      dragOffsetPxRef.current = 0;
      currentIndexRef.current = nextIndex;
      applyTrackTransform(nextIndex, 0);

      // setFlippedIndex(null) is a React no-op when flippedIndex is already
      // null (the common case), so navigation normally causes zero re-renders.
      setFlippedIndex(null);

      setTimeout(() => {
        if (track) track.style.transition = 'none';
        isAnimating.current = false;
      }, ANIMATION_DURATION);
    }

    // -----------------------------------------------------------------------
    // Stable flip handler — useCallback so React.memo on MenuCard works.
    // -----------------------------------------------------------------------

    const handleFlipChange = useCallback((cardIndex: number, flipped: boolean) => {
      setFlippedIndex(flipped ? cardIndex : null);
    }, []);

    // -----------------------------------------------------------------------
    // Imperative handle
    // -----------------------------------------------------------------------

    useImperativeHandle(ref, () => ({
      next() {
        if (isAnimating.current) return;
        if (currentIndexRef.current < items.length - 1) {
          navigateTo(currentIndexRef.current + 1);
        } else {
          onNextSection();
        }
      },
      prev() {
        if (isAnimating.current) return;
        if (currentIndexRef.current > 0) {
          navigateTo(currentIndexRef.current - 1);
        } else {
          onPrevSection({ goToLast: true });
        }
      },
      goToCard(index: number) {
        const clamped = Math.max(0, Math.min(index, items.length - 1));
        const track = trackRef.current;
        if (track) track.style.transition = 'none';
        dragOffsetPxRef.current = 0;
        currentIndexRef.current = clamped;
        applyTrackTransform(clamped, 0);
        setFlippedIndex(null);
        isAnimating.current = false;
      },
      resetFlips() {
        setFlippedIndex(null);
      },
      isActiveCardFlipped() {
        return flippedIndexRef.current === currentIndexRef.current;
      },
      drag(dx: number) {
        if (isAnimating.current) return;
        dragOffsetPxRef.current = dx;
        applyTrackTransform(currentIndexRef.current, dx);
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
        <div
          ref={trackRef}
          className="flex h-full"
          style={{ gap: `${CARD_GAP_PX}px`, willChange: 'transform' }}
        >
          {items.map((item, i) => (
            <div
              key={item.id}
              className="h-full shrink-0 relative"
              style={{
                width: cardWidthPx > 0 ? `${cardWidthPx}px` : `${CARD_WIDTH_RATIO * 100}vw`,
              }}
            >
              <MenuCard
                item={item}
                cardIndex={i}
                onAddToCart={onAddToCart}
                flipped={flippedIndex === i}
                onFlipChange={handleFlipChange}
                priority={priorityLoad && i === 0}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }
);

export default CardSwiper;
