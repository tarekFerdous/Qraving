import { describe, it, expect } from 'vitest';

function isSessionExpired(expiresAtMs: number): boolean {
  return expiresAtMs < Date.now();
}

describe('isSessionExpired', () => {
  it('returns true when expiresAt is in the past', () => {
    expect(isSessionExpired(Date.now() - 1000)).toBe(true);
  });

  it('returns false when expiresAt is in the future', () => {
    expect(isSessionExpired(Date.now() + 1000)).toBe(false);
  });
});
