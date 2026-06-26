'use client';

import { useRef, useEffect, useCallback } from 'react';
import CardSwiper, { CardSwiperRef } from '@/components/CardSwiper';
import { MenuSection, MenuItem } from '@/lib/menu';

interface SectionNavigatorProps {
  sections: MenuSection[];
  onAddToCart: (item: MenuItem) => void;
  onActiveSectionChange?: (name: string) => void;
}

export default function SectionNavigator({
  sections,
  onAddToCart,
  onActiveSectionChange,
}: SectionNavigatorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const swiperRefs = useRef<(CardSwiperRef | null)[]>([]);

  const scrollToSection = useCallback(
    (index: number, opts?: { goToLast?: boolean }) => {
      if (index < 0 || index >= sections.length) return;
      sectionRefs.current[index]?.scrollIntoView({
        behavior: 'instant',
        block: 'start',
      });
      if (opts?.goToLast) {
        swiperRefs.current[index]?.goToCard(sections[index].items.length - 1);
      }
    },
    [sections]
  );

  // Track active section via IntersectionObserver relative to the scroll container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observers: IntersectionObserver[] = [];

    sectionRefs.current.forEach((el, i) => {
      if (!el) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            onActiveSectionChange?.(sections[i].name);
          }
        },
        { threshold: 0.5, root: container }
      );
      observer.observe(el);
      observers.push(observer);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, [sections, onActiveSectionChange]);

  if (sections.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{
        overflowY: 'scroll',
        scrollSnapType: 'y mandatory',
        overscrollBehaviorY: 'contain',
        scrollbarWidth: 'none',
      }}
    >
      {sections.map((section, i) => (
        <div
          key={section.name}
          ref={(el) => {
            sectionRefs.current[i] = el;
          }}
          style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always', height: '100%' }}
        >
          <CardSwiper
            ref={(el) => {
              swiperRefs.current[i] = el;
            }}
            items={section.items}
            onNextSection={() => scrollToSection(i + 1)}
            onPrevSection={(opts) => scrollToSection(i - 1, opts)}
            onAddToCart={onAddToCart}
          />
        </div>
      ))}
    </div>
  );
}
