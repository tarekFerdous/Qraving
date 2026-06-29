import { describe, it, expect } from 'vitest';
import { computeCarouselOffset, resolveSnapIndex } from './carousel';

const CARD_WIDTH = 296;
const GAP = 12;
const CONTENT_WIDTH = 390;
const STEP = CARD_WIDTH + GAP; // 308

describe('computeCarouselOffset', () => {
  it('returns dragOffsetPx as a px string for index 0 (no centering)', () => {
    expect(computeCarouselOffset(0, 0, CARD_WIDTH, GAP, CONTENT_WIDTH)).toBe('0px');
    expect(computeCarouselOffset(0, 30, CARD_WIDTH, GAP, CONTENT_WIDTH)).toBe('30px');
    expect(computeCarouselOffset(0, -20, CARD_WIDTH, GAP, CONTENT_WIDTH)).toBe('-20px');
  });

  it('centers the card for index > 0 with dragOffsetPx = 0', () => {
    const centeringOffset = (CONTENT_WIDTH - CARD_WIDTH) / 2; // 47
    expect(computeCarouselOffset(1, 0, CARD_WIDTH, GAP, CONTENT_WIDTH)).toBe(
      `${-1 * STEP + centeringOffset}px`
    );
    expect(computeCarouselOffset(2, 0, CARD_WIDTH, GAP, CONTENT_WIDTH)).toBe(
      `${-2 * STEP + centeringOffset}px`
    );
  });

  it('adds dragOffsetPx on top of the centered offset for index > 0', () => {
    const base = -1 * STEP + (CONTENT_WIDTH - CARD_WIDTH) / 2;
    expect(computeCarouselOffset(1, -50, CARD_WIDTH, GAP, CONTENT_WIDTH)).toBe(`${base - 50}px`);
    expect(computeCarouselOffset(1, 50, CARD_WIDTH, GAP, CONTENT_WIDTH)).toBe(`${base + 50}px`);
  });

  it('places the active card center at contentWidth / 2 for index > 0 with no drag', () => {
    const offset = -1 * STEP + (CONTENT_WIDTH - CARD_WIDTH) / 2;
    // card left edge after transform = 1 * STEP + offset = centering offset = (contentWidth - cardWidth)/2
    // card center = (contentWidth - cardWidth)/2 + cardWidth/2 = contentWidth/2
    const cardLeftEdge = STEP + offset;
    const cardCenter = cardLeftEdge + CARD_WIDTH / 2;
    expect(cardCenter).toBe(CONTENT_WIDTH / 2);
  });
});

describe('resolveSnapIndex', () => {
  it('returns currentIndex when drag is near zero', () => {
    expect(resolveSnapIndex(1, 0, CARD_WIDTH, GAP, 5)).toBe(1);
    expect(resolveSnapIndex(1, -10, CARD_WIDTH, GAP, 5)).toBe(1);
    expect(resolveSnapIndex(1, 10, CARD_WIDTH, GAP, 5)).toBe(1);
  });

  it('snaps forward when drag exceeds half a step in the negative direction (swipe left)', () => {
    expect(resolveSnapIndex(1, -(STEP / 2 + 1), CARD_WIDTH, GAP, 5)).toBe(2);
  });

  it('snaps back when drag is less than half a step in the negative direction', () => {
    expect(resolveSnapIndex(1, -(STEP / 2 - 1), CARD_WIDTH, GAP, 5)).toBe(1);
  });

  it('snaps backward when drag exceeds half a step in the positive direction (swipe right)', () => {
    expect(resolveSnapIndex(2, STEP / 2 + 1, CARD_WIDTH, GAP, 5)).toBe(1);
  });

  it('clamps to 0 at the left boundary', () => {
    expect(resolveSnapIndex(0, STEP, CARD_WIDTH, GAP, 5)).toBe(0);
    expect(resolveSnapIndex(0, STEP * 3, CARD_WIDTH, GAP, 5)).toBe(0);
  });

  it('clamps to totalCards - 1 at the right boundary', () => {
    expect(resolveSnapIndex(4, -STEP, CARD_WIDTH, GAP, 5)).toBe(4);
    expect(resolveSnapIndex(4, -STEP * 3, CARD_WIDTH, GAP, 5)).toBe(4);
  });

  it('never returns a value outside [0, totalCards - 1]', () => {
    const result1 = resolveSnapIndex(0, 9999, CARD_WIDTH, GAP, 3);
    const result2 = resolveSnapIndex(2, -9999, CARD_WIDTH, GAP, 3);
    expect(result1).toBeGreaterThanOrEqual(0);
    expect(result1).toBeLessThanOrEqual(2);
    expect(result2).toBeGreaterThanOrEqual(0);
    expect(result2).toBeLessThanOrEqual(2);
  });
});
