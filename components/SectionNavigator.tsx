'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
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

/** Minimum horizontal movement (px) before entering live drag mode. */
const DRAG_JITTER_THRESHOLD = 4;


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

  // True while the current gesture has been identified as horizontal-dominant,
  // meaning live drag is in flight and release should call snapToNearest().
  const isDraggingHorizontally = useRef(false);

  // Axis lock for the current gesture — set once the first movement clears the
  // jitter threshold. Null means undetermined (gesture just started or gesture
  // was purely sub-threshold). Locked on the first significant movement and
  // cleared on every gesture start, so a vertical swipe that starts with a tiny
  // horizontal wobble is never misclassified as a drag.
  const gestureAxis = useRef<'horizontal' | 'vertical' | null>(null);

  // Card viewport element — host for the non-passive touchmove listener and
  // the ResizeObserver that measures section height for pixel-based translation.
  const viewportRef = useRef<HTMLDivElement>(null);

  // Pixel height of one section slot. Kept as a px value so the vertical
  // translate is pixel-exact on iOS Safari, where translateY(-100%) on a
  // flex-1 child can resolve to the wrong height (flex-determined vs explicit).
  const [sectionHeightPx, setSectionHeightPx] = useState(0);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setSectionHeightPx(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // -------------------------------------------------------------------------
  // Non-passive touchmove guard.
  //
  // React's `onTouchMove` is passive and cannot call `preventDefault()`.
  // iOS WebKit claims any un-prevented vertical touchmove for pull-to-refresh
  // on the very first event — before any threshold or axis check can fire.
  // The fix: prevent every touchmove unconditionally, UNLESS the active card
  // is flipped (its back face owns native pan-y scroll via overflow-y: auto +
  // overscroll-behavior-y: contain). No start-coord dependency, no threshold,
  // no gap for iOS to sneak into.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onTouchMove = (e: TouchEvent) => {
      const activeSwiper = swiperRefs.current[activeSectionRef.current];
      const flipped = activeSwiper?.isActiveCardFlipped() ?? false;
      if (!flipped) e.preventDefault();

      const start = gestureStart.current;
      if (!start || flipped) return;

      const touch = e.touches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // Lock the gesture axis once movement clears the jitter threshold.
      // After this point the axis cannot change — a gesture is either a
      // horizontal drag or a vertical swipe, never both.
      if (!gestureAxis.current) {
        if (absDx > DRAG_JITTER_THRESHOLD || absDy > DRAG_JITTER_THRESHOLD) {
          gestureAxis.current = absDx >= absDy ? 'horizontal' : 'vertical';
        }
        return; // Wait for axis to be determined before acting
      }

      if (gestureAxis.current === 'horizontal') {
        isDraggingHorizontally.current = true;
        activeSwiper?.drag(dx);
      }
    };

    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, []);

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
    gestureAxis.current = null;
  }

  function onTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    const start = gestureStart.current;
    gestureStart.current = null;
    gestureAxis.current = null;

    if (isDraggingHorizontally.current) {
      isDraggingHorizontally.current = false;
      swiperRefs.current[activeSectionRef.current]?.snapToNearest();
      return;
    }

    if (!start) return;
    const t = e.changedTouches[0];
    applyIntent(start, { x: t.clientX, y: t.clientY });
  }

  function onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    gestureStart.current = { x: e.clientX, y: e.clientY };
    gestureAxis.current = null;
  }

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const start = gestureStart.current;
    if (!start) return;

    const activeSwiper = swiperRefs.current[activeSectionRef.current];
    if (activeSwiper?.isActiveCardFlipped()) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (!gestureAxis.current) {
      if (absDx > DRAG_JITTER_THRESHOLD || absDy > DRAG_JITTER_THRESHOLD) {
        gestureAxis.current = absDx >= absDy ? 'horizontal' : 'vertical';
      }
      return;
    }

    if (gestureAxis.current === 'horizontal') {
      isDraggingHorizontally.current = true;
      activeSwiper?.drag(dx);
    }
  }

  function onMouseUp(e: React.MouseEvent<HTMLDivElement>) {
    const start = gestureStart.current;
    gestureStart.current = null;
    gestureAxis.current = null;

    if (isDraggingHorizontally.current) {
      isDraggingHorizontally.current = false;
      swiperRefs.current[activeSectionRef.current]?.snapToNearest();
      return;
    }

    if (!start) return;
    applyIntent(start, { x: e.clientX, y: e.clientY });
  }

  function onMouseLeave() {
    gestureStart.current = null;
    gestureAxis.current = null;
    if (isDraggingHorizontally.current) {
      isDraggingHorizontally.current = false;
      swiperRefs.current[activeSectionRef.current]?.snapToNearest();
    }
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
        ref={viewportRef}
        className="flex-1 overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
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
            transform: sectionHeightPx > 0
              ? `translate3d(0, -${activeSection * sectionHeightPx}px, 0)`
              : `translate3d(0, -${activeSection * 100}%, 0)`,
            transition: `transform ${SECTION_ANIMATION_DURATION}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
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
                <div data-testid="category-pill" className="w-full bg-qraving-button rounded-xl py-2 px-4 text-center">
                  <span className="font-semibold text-base text-qraving-text">
                    {section.name}
                  </span>
                </div>
              </div>

              {/* Cards fill the remaining height (taller cards, same width).
                  Only mount the active section and its immediate neighbours —
                  off-screen sections are empty divs so their card images and
                  blur textures are not held in GPU memory. The target section
                  is always already within this ±1 window before navigation
                  fires, so there is no visible blank flash during the slide. */}
              <div className="flex-1 min-h-0">
                {Math.abs(i - activeSection) <= 1 && (
                  <CardSwiper
                    ref={(el) => {
                      swiperRefs.current[i] = el;
                    }}
                    items={section.items}
                    onNextSection={() => goToSection(i + 1)}
                    onPrevSection={(opts) => goToSection(i - 1, opts)}
                    onAddToCart={onAddToCart}
                    priorityLoad={i === 0}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Next-category preview strip — fixed 10vh. Tapping advances to the next
          category (same as a vertical swipe up); on the last category it returns
          to the first. */}
      <div className="pt-2 shrink-0">
      {preview.kind === 'next' ? (
        <button
          type="button"
          onClick={() => goToSection(preview.index)}
          aria-label={`Next category: ${preview.name}`}
          className="h-[10vh] w-full flex items-center gap-3 px-4 text-left bg-gray-100 active:opacity-80"
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
            {sections[preview.index].items.slice(0, 6).filter((it) => it.imageUrl).map((it) => (
              <div
                key={it.id}
                className="relative h-full aspect-[0.76] shrink-0 rounded-lg overflow-hidden border border-qraving-card-border"
              >
                <Image
                  src={it.imageUrl}
                  alt=""
                  fill
                  unoptimized
                  className="object-cover"
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
          className="h-[10vh] w-full flex items-center justify-center gap-2 bg-gray-100 text-qraving-text font-semibold text-sm active:opacity-80"
        >
          <ChevronUp size={18} />
          Back to top
        </button>
      )}
      </div>
    </div>
  );
}
