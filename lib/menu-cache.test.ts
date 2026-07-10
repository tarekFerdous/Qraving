import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deriveCacheKey, readMenuCache, writeMenuCache, prefetchMenuImages } from '@/lib/menu-cache';
import type { MenuSection } from '@/lib/menu';

// ─── sessionStorage mock ────────────────────────────────────────────────────
// The vitest environment is 'node' (no jsdom), so we supply our own
// sessionStorage backed by an in-memory Map.
const store = new Map<string, string>();
const mockStorage = {
  getItem: (key: string): string | null => store.get(key) ?? null,
  setItem: (key: string, value: string): void => {
    store.set(key, value);
  },
  removeItem: (key: string): void => {
    store.delete(key);
  },
  clear: (): void => {
    store.clear();
  },
  get length() {
    return store.size;
  },
  key: (index: number): string | null => [...store.keys()][index] ?? null,
};
vi.stubGlobal('sessionStorage', mockStorage);

// ─── Shared fixture ──────────────────────────────────────────────────────────
const SECTION: MenuSection = {
  id: 'cat-1',
  name: 'Starters',
  description: 'Light bites',
  items: [
    {
      id: 'item-1',
      name: 'Soup',
      description: 'Hot soup',
      imageUrl: 'https://img/soup.jpg',
      price: 8,
      dietaryTags: [],
      allergens: [],
      isAvailable: true,
    },
  ],
};

beforeEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

// ─── deriveCacheKey ──────────────────────────────────────────────────────────
describe('deriveCacheKey', () => {
  it('returns the expected key format', () => {
    expect(deriveCacheKey('acme', 'downtown')).toBe('qraving:menu:acme:downtown');
  });

  it('keys for different branches do not collide', () => {
    expect(deriveCacheKey('acme', 'downtown')).not.toBe(deriveCacheKey('acme', 'uptown'));
  });
});

// ─── readMenuCache ───────────────────────────────────────────────────────────
describe('readMenuCache', () => {
  it('returns parsed sections on cache hit', () => {
    const key = deriveCacheKey('acme', 'downtown');
    sessionStorage.setItem(key, JSON.stringify([SECTION]));
    expect(readMenuCache(key)).toEqual([SECTION]);
  });

  it('returns null on cache miss', () => {
    expect(readMenuCache('qraving:menu:missing:key')).toBeNull();
  });

  it('returns null for malformed JSON without throwing', () => {
    const key = deriveCacheKey('acme', 'downtown');
    sessionStorage.setItem(key, '{invalid-json}');
    expect(readMenuCache(key)).toBeNull();
  });
});

// ─── writeMenuCache ──────────────────────────────────────────────────────────
describe('writeMenuCache', () => {
  it('does not throw when sessionStorage.setItem throws QuotaExceededError', () => {
    vi.spyOn(mockStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });
    expect(() => writeMenuCache('some-key', [SECTION])).not.toThrow();
  });
});

// ─── prefetchMenuImages ───────────────────────────────────────────────────────
describe('prefetchMenuImages', () => {
  it('fires Image() once per non-empty imageUrl, skips empty URLs', () => {
    const created: string[] = [];
    vi.stubGlobal('Image', class {
      set src(v: string) {
        created.push(v);
      }
    });

    const sections: MenuSection[] = [
      {
        id: 'cat-1',
        name: 'Starters',
        description: '',
        items: [
          {
            id: 'i1', name: 'A', description: '',
            imageUrl: 'https://img/a.jpg', price: 1,
            dietaryTags: [], allergens: [], isAvailable: true,
          },
          {
            id: 'i2', name: 'B', description: '',
            imageUrl: '', price: 2,
            dietaryTags: [], allergens: [], isAvailable: true,
          },
          {
            id: 'i3', name: 'C', description: '',
            imageUrl: 'https://img/c.jpg', price: 3,
            dietaryTags: [], allergens: [], isAvailable: true,
          },
        ],
      },
    ];

    prefetchMenuImages(sections);
    expect(created).toEqual(['https://img/a.jpg', 'https://img/c.jpg']);
  });
});
