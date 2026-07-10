import type { MenuSection } from '@/lib/menu';

export function deriveCacheKey(company: string, branch: string): string {
  return `qraving:menu:${company}:${branch}`;
}

export function readMenuCache(cacheKey: string): MenuSection[] | null {
  try {
    const raw = sessionStorage.getItem(cacheKey);
    if (raw === null) return null;
    return JSON.parse(raw) as MenuSection[];
  } catch {
    return null;
  }
}

export function writeMenuCache(cacheKey: string, sections: MenuSection[]): void {
  try {
    sessionStorage.setItem(cacheKey, JSON.stringify(sections));
  } catch {
    // silently swallow QuotaExceededError and any other storage exception
  }
}

export function prefetchMenuImages(sections: MenuSection[]): void {
  for (const section of sections) {
    for (const item of section.items) {
      if (item.imageUrl) {
        new Image().src = item.imageUrl;
      }
    }
  }
}
