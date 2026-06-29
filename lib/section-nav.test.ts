import { describe, it, expect } from 'vitest';
import { resolveNextSection } from './section-nav';

const SECTIONS = ['Italian', 'Greek', 'Japanese', 'Mexican'];

describe('resolveNextSection', () => {
  it('returns the following category (index + name) when one exists', () => {
    expect(resolveNextSection(SECTIONS, 0)).toEqual({
      kind: 'next',
      index: 1,
      name: 'Greek',
    });
    expect(resolveNextSection(SECTIONS, 2)).toEqual({
      kind: 'next',
      index: 3,
      name: 'Mexican',
    });
  });

  it('returns back-to-top on the last category', () => {
    expect(resolveNextSection(SECTIONS, SECTIONS.length - 1)).toEqual({
      kind: 'back-to-top',
    });
  });

  it('returns back-to-top for an empty section list', () => {
    expect(resolveNextSection([], 0)).toEqual({ kind: 'back-to-top' });
  });

  it('returns back-to-top for an out-of-range active index', () => {
    expect(resolveNextSection(SECTIONS, 99)).toEqual({ kind: 'back-to-top' });
    expect(resolveNextSection(SECTIONS, -5)).toEqual({ kind: 'back-to-top' });
  });
});
