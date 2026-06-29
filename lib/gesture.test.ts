import { describe, it, expect } from 'vitest';
import { resolveGesture, shouldPreventTouchMove } from './gesture';

const THRESHOLD = 50;

describe('resolveGesture', () => {
  it('resolves a horizontal-dominant swipe past the threshold to left/right by sign', () => {
    expect(resolveGesture({ x: 100, y: 0 }, { x: 0, y: 0 }, THRESHOLD)).toBe('left');
    expect(resolveGesture({ x: 0, y: 0 }, { x: 100, y: 0 }, THRESHOLD)).toBe('right');
  });

  it('resolves a vertical-dominant swipe past the threshold to up/down by sign', () => {
    expect(resolveGesture({ x: 0, y: 100 }, { x: 0, y: 0 }, THRESHOLD)).toBe('up');
    expect(resolveGesture({ x: 0, y: 0 }, { x: 0, y: 100 }, THRESHOLD)).toBe('down');
  });

  it('returns none when the dominant-axis magnitude is below the threshold', () => {
    expect(resolveGesture({ x: 0, y: 0 }, { x: 20, y: 5 }, THRESHOLD)).toBe('none');
    expect(resolveGesture({ x: 0, y: 0 }, { x: 5, y: 20 }, THRESHOLD)).toBe('none');
  });

  it('resolves a diagonal swipe to exactly one axis (the larger delta), never two', () => {
    // Larger horizontal component → horizontal intent only.
    expect(resolveGesture({ x: 0, y: 0 }, { x: 120, y: 60 }, THRESHOLD)).toBe('right');
    // Larger vertical component → vertical intent only.
    expect(resolveGesture({ x: 0, y: 0 }, { x: 60, y: 120 }, THRESHOLD)).toBe('down');
  });

  it('resolves a near-equal diagonal deterministically via the pinned tie-break (horizontal)', () => {
    // |dx| === |dy| → horizontal wins by the pinned tie-break.
    expect(resolveGesture({ x: 0, y: 0 }, { x: 80, y: 80 }, THRESHOLD)).toBe('right');
    expect(resolveGesture({ x: 0, y: 0 }, { x: -80, y: 80 }, THRESHOLD)).toBe('left');
  });

  it('returns none for zero / no-movement input', () => {
    expect(resolveGesture({ x: 42, y: 42 }, { x: 42, y: 42 }, THRESHOLD)).toBe('none');
  });

  it('respects an exact-threshold boundary (magnitude must reach the threshold)', () => {
    // Just below threshold → none; exactly at threshold → registers.
    expect(resolveGesture({ x: 0, y: 0 }, { x: 49, y: 0 }, THRESHOLD)).toBe('none');
    expect(resolveGesture({ x: 0, y: 0 }, { x: 50, y: 0 }, THRESHOLD)).toBe('right');
  });
});

describe('shouldPreventTouchMove', () => {
  const MOVE = 10;

  it('prevents a vertical-dominant move when the card is not flipped', () => {
    expect(
      shouldPreventTouchMove({ x: 0, y: 0 }, { x: 0, y: 40 }, false, MOVE)
    ).toBe(true);
    expect(
      shouldPreventTouchMove({ x: 0, y: 40 }, { x: 0, y: 0 }, false, MOVE)
    ).toBe(true);
  });

  it('allows a vertical-dominant move when the card is flipped (back-face scroll)', () => {
    expect(
      shouldPreventTouchMove({ x: 0, y: 0 }, { x: 0, y: 40 }, true, MOVE)
    ).toBe(false);
  });

  it('allows a horizontal-dominant move whether or not the card is flipped', () => {
    expect(
      shouldPreventTouchMove({ x: 0, y: 0 }, { x: 40, y: 0 }, false, MOVE)
    ).toBe(false);
    expect(
      shouldPreventTouchMove({ x: 0, y: 0 }, { x: 40, y: 0 }, true, MOVE)
    ).toBe(false);
  });

  it('allows near-zero / sub-threshold movement so taps and jitter are never blocked', () => {
    expect(
      shouldPreventTouchMove({ x: 0, y: 0 }, { x: 0, y: 0 }, false, MOVE)
    ).toBe(false);
    expect(
      shouldPreventTouchMove({ x: 0, y: 0 }, { x: 2, y: 5 }, false, MOVE)
    ).toBe(false);
  });

  it('resolves a near-equal diagonal tie to allow, matching the horizontal tie-break', () => {
    // |dx| === |dy| → horizontal wins by the pinned convention → allow.
    expect(
      shouldPreventTouchMove({ x: 0, y: 0 }, { x: 30, y: 30 }, false, MOVE)
    ).toBe(false);
  });

  it('prevents only once vertical movement reaches the threshold boundary', () => {
    expect(
      shouldPreventTouchMove({ x: 0, y: 0 }, { x: 0, y: 9 }, false, MOVE)
    ).toBe(false);
    expect(
      shouldPreventTouchMove({ x: 0, y: 0 }, { x: 0, y: 10 }, false, MOVE)
    ).toBe(true);
  });
});
