'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import CardSwiper, { CardSwiperRef } from '@/components/CardSwiper';
import { resolveGesture, Point } from '@/lib/gesture';
import { MenuSection, MenuItem } from '@/lib/menu';

interface SectionNavigatorProps {
  sections: MenuSection[];
  onAddToCart: (item: MenuItem) => void;
  onActiveSectionChange?: (name: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum dominant-axis movement (px) for a gesture to register. */
const SWIPE_THRESHOLD = 50;

/** Vertical section slide animation duration in milliseconds. */
const SECTION_ANIMATION_DURATION = 250;

// ---------------------------------------------------------------------------
// Component
//
// The unified gesture engine. A single touch / mouse gesture is captured here
// (start on press, end on release), passed once through the pure `resolveGesture`
// seam, and the resulting intent is applied exactly once:
//   - up   → next category (first card)
//   - down → previous category (first card)
//   - left → next card (or handoff to next category's first card)
//   - right→ previous card (or handoff to previous category's last card)
// Native vertical scroll-snap is gone; both axes are JS-driven, so a fast flick
// can never skip more than one unit.
// ---------------------------------------------------------------------------

export default function SectionNavigator({
  sections,
  onAddToCart,
  onActiveSectionChange,
}: SectionNavigatorProps) {
  const swiperRefs = useRef<(CardSwiperRef | null)[]>([]);
  const [activeSection, setActiveSection] = useState(0);

  /** Lock to prevent overlapping section animations. */
  const isAnimatingSection = useRef(false);

  // Gesture start coordinates for the in-flight touch / mouse gesture.
  const gestureStart = useRef<Point | null>(null);

  // Report the active category name upward to the page header.
  useEffect(() => {
    const name = sections[activeSection]?.name;
    if (name) onActiveSectionChange?.(name);
  }, [activeSection, sections, onActiveSectionChange]);

  // -------------------------------------------------------------------------
  // Coordinator — maps a resolved intent to exactly one navigation action.
  // -------------------------------------------------------------------------

  const goToSection = useCallback(
    (index: number, opts?: { goToLast?: boolean }) => {
      // Hard edges: out-of-range is a no-op (no rubber-band / overscroll).
      if (index < 0 || index >= sections.length) return;
      if (isAnimatingSection.current) return;

      isAnimatingSection.current = true;
      setActiveSection(index);

      // Entering a category lands on its first card; a backward cross-axis
      // handoff lands on the previous category's last card.
      const lastIndex = sections[index].items.length - 1;
      swiperRefs.current[index]?.goToCard(opts?.goToLast ? lastIndex : 0);

      setTimeout(() => {
        isAnimatingSection.current = false;
      }, SECTION_ANIMATION_DURATION);
    },
    [sections]
  );

  const applyIntent = useCallback(
    (start: Point, end: Point) => {
      const intent = resolveGesture(start, end, SWIPE_THRESHOLD);
      switch (intent) {
        case 'up':
          goToSection(activeSection + 1);
          break;
        case 'down':
          goToSection(activeSection - 1);
          break;
        case 'left':
          swiperRefs.current[activeSection]?.next();
          break;
        case 'right':
          swiperRefs.current[activeSection]?.prev();
          break;
        case 'none':
          break;
      }
    },
    [activeSection, goToSection]
  );

  // -------------------------------------------------------------------------
  // Gesture capture — no live tracking; intent applied once, on release.
  // -------------------------------------------------------------------------

  function onTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    const t = e.touches[0];
    gestureStart.current = { x: t.clientX, y: t.clientY };
  }

  function onTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    const start = gestureStart.current;
    gestureStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    applyIntent(start, { x: t.clientX, y: t.clientY });
  }

  function onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    gestureStart.current = { x: e.clientX, y: e.clientY };
  }

  function onMouseUp(e: React.MouseEvent<HTMLDivElement>) {
    const start = gestureStart.current;
    gestureStart.current = null;
    if (!start) return;
    applyIntent(start, { x: e.clientX, y: e.clientY });
  }

  function onMouseLeave() {
    gestureStart.current = null;
  }

  if (sections.length === 0) return null;

  return (
    <div
      className="w-full h-full overflow-hidden select-none"
      style={{ touchAction: 'none' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
    >
      {/*
        Vertical section track — sections stack in a column and the track is
        translated by exactly one section height per category change. The same
        deliberate, JS-driven snap as the horizontal axis (no scroll, no momentum).
      */}
      <div
        className="flex flex-col h-full"
        style={{
          transform: `translateY(-${activeSection * 100}%)`,
          transition: `transform ${SECTION_ANIMATION_DURATION}ms ease-out`,
          willChange: 'transform',
        }}
      >
        {sections.map((section, i) => (
          <div key={section.name} className="h-full shrink-0">
            <CardSwiper
              ref={(el) => {
                swiperRefs.current[i] = el;
              }}
              items={section.items}
              onNextSection={() => goToSection(i + 1)}
              onPrevSection={(opts) => goToSection(i - 1, opts)}
              onAddToCart={onAddToCart}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
