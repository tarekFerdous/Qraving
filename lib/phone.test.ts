import { describe, it, expect } from 'vitest';
import {
  SEGMENTS,
  autoAdvance,
  shouldRetreat,
  isPhoneComplete,
  toE164,
} from './phone';

describe('SEGMENTS', () => {
  it('has three segments with the correct maxLengths', () => {
    expect(SEGMENTS).toHaveLength(3);
    expect(SEGMENTS[0]).toMatchObject({ maxLength: 3, label: 'area' });
    expect(SEGMENTS[1]).toMatchObject({ maxLength: 3, label: 'exchange' });
    expect(SEGMENTS[2]).toMatchObject({ maxLength: 4, label: 'subscriber' });
  });
});

describe('autoAdvance', () => {
  it('returns true when value.length equals segmentMaxLength', () => {
    expect(autoAdvance(0, '416', 3)).toBe(true);
    expect(autoAdvance(1, '555', 3)).toBe(true);
    expect(autoAdvance(2, '1234', 4)).toBe(true);
  });

  it('returns false when value.length is less than segmentMaxLength', () => {
    expect(autoAdvance(0, '41', 3)).toBe(false);
    expect(autoAdvance(0, '', 3)).toBe(false);
    expect(autoAdvance(2, '123', 4)).toBe(false);
  });

  it('returns false when value.length exceeds segmentMaxLength', () => {
    // Callers should not allow this, but the function is purely length-based.
    expect(autoAdvance(0, '4169', 3)).toBe(false);
  });
});

describe('shouldRetreat', () => {
  it('returns true on Backspace at cursorPosition 0 for non-first segments', () => {
    expect(shouldRetreat(1, 'Backspace', 0)).toBe(true);
    expect(shouldRetreat(2, 'Backspace', 0)).toBe(true);
  });

  it('returns false for the first segment regardless of key or cursor', () => {
    expect(shouldRetreat(0, 'Backspace', 0)).toBe(false);
  });

  it('returns false when cursorPosition is not 0', () => {
    expect(shouldRetreat(1, 'Backspace', 1)).toBe(false);
    expect(shouldRetreat(2, 'Backspace', 2)).toBe(false);
  });

  it('returns false for non-Backspace keys even at position 0 on non-first segment', () => {
    expect(shouldRetreat(1, 'Delete', 0)).toBe(false);
    expect(shouldRetreat(1, 'ArrowLeft', 0)).toBe(false);
    expect(shouldRetreat(2, 'a', 0)).toBe(false);
  });
});

describe('isPhoneComplete', () => {
  it('returns true when all segments are filled with digits', () => {
    expect(isPhoneComplete(['416', '555', '1234'])).toBe(true);
    expect(isPhoneComplete(['000', '000', '0000'])).toBe(true);
  });

  it('returns false when any segment is shorter than its required length', () => {
    expect(isPhoneComplete(['41', '555', '1234'])).toBe(false);
    expect(isPhoneComplete(['416', '55', '1234'])).toBe(false);
    expect(isPhoneComplete(['416', '555', '123'])).toBe(false);
    expect(isPhoneComplete(['', '', ''])).toBe(false);
  });

  it('returns false when any segment contains non-digit characters', () => {
    expect(isPhoneComplete(['4X6', '555', '1234'])).toBe(false);
    expect(isPhoneComplete(['416', '5 5', '1234'])).toBe(false);
    expect(isPhoneComplete(['416', '555', '12-4'])).toBe(false);
  });

  it('returns false when the segments array does not have exactly three entries', () => {
    expect(isPhoneComplete(['416', '555'])).toBe(false);
    expect(isPhoneComplete(['416', '555', '1234', '5678'])).toBe(false);
    expect(isPhoneComplete([])).toBe(false);
  });
});

describe('toE164', () => {
  it('returns a string matching /^\\+1\\d{10}$/', () => {
    const result = toE164(['416', '555', '1234']);
    expect(result).toMatch(/^\+1\d{10}$/);
  });

  it('concatenates segments in order after the +1 prefix', () => {
    expect(toE164(['416', '555', '1234'])).toBe('+14165551234');
    expect(toE164(['800', '867', '5309'])).toBe('+18008675309');
  });
});
