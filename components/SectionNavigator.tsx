'use client';

import { useRef, useState, useCallback } from 'react';
import Image from 'next/image';
import { ChevronUp } from 'lucide-react';
import CardSwiper, { CardSwiperRef } from '@/components/CardSwiper';
import { resolveGesture, Point } from '@/lib/gesture';
import { resolveNextSection } from '@/lib/section-nav';
import { MenuSection, MenuItem } from '@/lib/menu';

interface SectionNavigatorProps {
  sections: MenuSection[];
  onAddToCart: (item: MenuItem) => void;
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
// The unified gesture engine. A single touch / mouse gesture is captured on the
// card viewport, passed once through the pure `resolveGesture` seam, and the
// resulting intent is applied exactly once:
//   - up   → next category (first card)
//   - down → previous category (first card)
//   - left → next card (or handoff to next category's first card)
//   - right→ previous card (or handoff to previous category's last card)
//
// When the active card is flipped to its back, the back owns its own vertical
// scroll (native pan-y), so vertical intents are ignored here — only horizontal
// card navigation still applies while flipped.
//
// A fixed 10vh strip at the bottom previews the next category (name + a squished
// peek of its cards); tapping it advances, and on the last category it becomes a
// "Back to top" control. The live category name is folded into each section's
// content so it snaps in with the category on a vertical swipe.
// ---------------------------------------------------------------------------

export default function SectionNavigator({
  sections,
  onAddToCart,
}: SectionNavigatorProps) {
  const swiperRefs = useRef<(CardSwiperRef | null)[]>([]);
  const [activeSection, setActiveSection] = useState(0);

  // Mirror the active index into a ref so navigation can reset the *outgoing*
  // section's flipped card regardless of render timing.
  const activeSectionRef = useRef(0);
  activeSectionRef.current = activeSection;

  /** Lock to prevent overlapping section animations. */
  const isAnimatingSection = useRef(false);

  // Gesture start coordinates for the in-flight touch / mouse gesture.
  const gestureStart = useRef<Point | null>(null);

  // -------------------------------------------------------------------------
  // Coordinator — maps a resolved intent to exactly one navigation action.
  // -------------------------------------------------------------------------

  const goToSection = useCallback(
    (index: number, opts?: { goToLast?: boolean }) => {
      // Hard edges: out-of-range is a no-op (no rubber-band / overscroll).
      if (index < 0 || index >= sections.length) return;
      if (isAnimatingSection.current) return;

      isAnimatingSection.current = true;

      // Animate the section being left back to front-face (flip-back feedback).
      swiperRefs.current[activeSectionRef.current]?.resetFlips();

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
      const activeSwiper = swiperRefs.current[activeSectionRef.current];

      // While the active card is flipped, its back face owns vertical scrolling,
      // so vertical intents must not change category. Horizontal still navigates.
      if (activeSwiper?.isActiveCardFlipped()) {
        if (intent === 'left') activeSwiper.next();
        else if (intent === 'right') activeSwiper.prev();
        return;
      }

      switch (intent) {
        case 'up':
          goToSection(activeSectionRef.current + 1);
          break;
        case 'down':
          goToSection(activeSectionRef.current - 1);
          break;
        case 'left':
          activeSwiper?.next();
          break;
        case 'right':
          activeSwiper?.prev();
          break;
        case 'none':
          break;
      }
    },
    [goToSection]
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

  const preview = resolveNextSection(
    sections.map((s) => s.name),
    activeSection
  );

  return (
    <div className="flex flex-col h-full select-none">
      {/* Card viewport — owns the gesture engine. touch-action: pan-y so a
          flipped card's back face can scroll natively; everywhere else there is
          nothing vertically scrollable, so vertical swipes still resolve to a
          category change on release. */}
      <div
        className="flex-1 overflow-hidden"
        style={{ touchAction: 'pan-y' }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      >
        {/*
          Vertical section track — sections stack in a column and the track is
          translated by exactly one viewport height per category change.
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
            <div
              key={section.name}
              className="h-full shrink-0 flex flex-col overflow-hidden"
            >
              {/* Live category name — folded into the section so it snaps in
                  with the content on a vertical swipe. */}
              <div className="px-4 pt-3 pb-2 shrink-0">
                <p className="text-qraving-text font-semibold text-base">
                  {section.name}
                </p>
              </div>

              {/* Cards fill the remaining height (taller cards, same width). */}
              <div className="flex-1 min-h-0">
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
            </div>
          ))}
        </div>
      </div>

      {/* Next-category preview strip — fixed 10vh. Tapping advances to the next
          category (same as a vertical swipe up); on the last category it returns
          to the first. */}
      {preview.kind === 'next' ? (
        <button
          type="button"
          onClick={() => goToSection(preview.index)}
          aria-label={`Next category: ${preview.name}`}
          className="h-[10vh] shrink-0 w-full flex items-center gap-3 px-4 text-left bg-qraving-card-border/40 active:opacity-80"
        >
          <div className="flex flex-col shrink-0 max-w-[42vw]">
            <span className="text-[10px] uppercase tracking-wider text-qraving-text/50 font-semibold">
              Up next
            </span>
            <span className="text-sm font-semibold text-qraving-text truncate">
              {preview.name}
            </span>
          </div>
          <div className="flex-1 flex items-center gap-2 overflow-hidden h-[7vh]">
            {sections[preview.index].items.slice(0, 6).map((it) => (
              <div
                key={it.id}
                className="relative h-full aspect-[0.76] shrink-0 rounded-lg overflow-hidden border border-qraving-card-border"
              >
                <Image
                  src={it.imageUrl}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="80px"
                />
              </div>
            ))}
          </div>
          <ChevronUp className="shrink-0 text-qraving-text/60" size={20} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => goToSection(0)}
          aria-label="Back to top"
          className="h-[10vh] shrink-0 w-full flex items-center justify-center gap-2 bg-qraving-card-border/40 text-qraving-text font-semibold text-sm active:opacity-80"
        >
          <ChevronUp size={18} />
          Back to top
        </button>
      )}
    </div>
  );
}
