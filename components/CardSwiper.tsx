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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const CardSwiper = forwardRef<CardSwiperRef, CardSwiperProps>(
  function CardSwiper({ items, onNextSection, onPrevSection, onAddToCart }, ref) {
    const [currentIndex, setCurrentIndex] = useState(0);

    /**
     * Animation state:
     *  - null   → no animation running, card at translateX(0)
     *  - 'exit-left'  → current card slides out to the left (next card incoming)
     *  - 'exit-right' → current card slides out to the right (prev card incoming)
     */
    const [animationPhase, setAnimationPhase] = useState<
      'exit-left' | 'exit-right' | null
    >(null);

    /** Prevent overlapping swipe gestures while animating. */
    const isAnimating = useRef(false);

    // -----------------------------------------------------------------------
    // Touch / mouse drag tracking
    // -----------------------------------------------------------------------

    const touchStartX = useRef<number | null>(null);
    const mouseStartX = useRef<number | null>(null);
    const isDragging = useRef(false);

    // -----------------------------------------------------------------------
    // Navigation helpers
    // -----------------------------------------------------------------------

    function navigateTo(nextIndex: number, direction: 'exit-left' | 'exit-right') {
      if (isAnimating.current) return;
      isAnimating.current = true;

      setAnimationPhase(direction);

      setTimeout(() => {
        setCurrentIndex(nextIndex);
        setAnimationPhase(null);
        isAnimating.current = false;
      }, ANIMATION_DURATION);
    }

    function handleSwipeLeft() {
      if (isAnimating.current) return;

      if (currentIndex < items.length - 1) {
        navigateTo(currentIndex + 1, 'exit-left');
      } else {
        // Last card — advance to the next section.
        onNextSection();
      }
    }

    function handleSwipeRight() {
      if (isAnimating.current) return;

      if (currentIndex > 0) {
        navigateTo(currentIndex - 1, 'exit-right');
      } else {
        // First card — go back to the previous section (at its last card).
        onPrevSection({ goToLast: true });
      }
    }

    // -----------------------------------------------------------------------
    // Imperative handle
    // -----------------------------------------------------------------------

    useImperativeHandle(ref, () => ({
      goToCard(index: number) {
        const clamped = Math.max(0, Math.min(index, items.length - 1));
        setCurrentIndex(clamped);
        setAnimationPhase(null);
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
      // Prevent text selection while dragging.
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
      // Cancel drag if pointer leaves the container without releasing.
      mouseStartX.current = null;
      isDragging.current = false;
    }

    // -----------------------------------------------------------------------
    // Derived transform for the sliding animation
    // -----------------------------------------------------------------------

    let cardTransform = 'translateX(0)';
    if (animationPhase === 'exit-left') {
      cardTransform = 'translateX(-100%)';
    } else if (animationPhase === 'exit-right') {
      cardTransform = 'translateX(100%)';
    }

    const cardTransition =
      animationPhase !== null
        ? `transform ${ANIMATION_DURATION}ms ease-out`
        : 'none';

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    if (items.length === 0) return null;

    return (
      <div
        className="w-full h-full overflow-hidden relative select-none"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      >
        {/* Card area — slides on swipe */}
        <div
          className="absolute inset-0"
          style={{
            transform: cardTransform,
            transition: cardTransition,
          }}
        >
          <MenuCard
            item={items[currentIndex]}
            onAddToCart={onAddToCart}
          />
        </div>

        {/* Dot indicator */}
        {items.length > 1 && (
          <div
            className="absolute bottom-3 left-0 right-0 flex justify-center items-center gap-1.5 pointer-events-none"
            aria-label={`Card ${currentIndex + 1} of ${items.length}`}
          >
            {items.map((_, i) => (
              <span
                key={i}
                className="rounded-full transition-all duration-200"
                style={{
                  width: i === currentIndex ? 8 : 6,
                  height: i === currentIndex ? 8 : 6,
                  backgroundColor:
                    i === currentIndex
                      ? '#E3000F'
                      : 'rgba(0, 0, 0, 0.25)',
                  flexShrink: 0,
                }}
              />
            ))}
          </div>
        )}
      </div>
    );
  }
);

export default CardSwiper;
