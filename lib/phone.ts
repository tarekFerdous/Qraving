// Canada +1 segmented phone input logic — pure functions, no side effects.

// Describes each segment of a Canadian phone number.
export const SEGMENTS = [
  { maxLength: 3, label: 'area' },
  { maxLength: 3, label: 'exchange' },
  { maxLength: 4, label: 'subscriber' },
] as const;

/**
 * Returns true when a segment is full and focus should automatically advance
 * to the next segment.
 */
export function autoAdvance(
  segmentIndex: number,
  value: string,
  segmentMaxLength: number,
): boolean {
  return value.length === segmentMaxLength;
}

/**
 * Returns true when the user pressed Backspace at cursor position 0 of a
 * non-first segment, signalling that focus should retreat to the previous
 * segment.
 */
export function shouldRetreat(
  segmentIndex: number,
  key: string,
  cursorPosition: number,
): boolean {
  return key === 'Backspace' && cursorPosition === 0 && segmentIndex > 0;
}

/**
 * Returns true when all three segments are filled with only digit characters.
 */
export function isPhoneComplete(segments: string[]): boolean {
  if (segments.length !== SEGMENTS.length) return false;
  return SEGMENTS.every(
    ({ maxLength }, i) =>
      segments[i].length === maxLength && /^\d+$/.test(segments[i]),
  );
}

/**
 * Assembles a "+1XXXXXXXXXX" E.164 string from the three segment values.
 * Assumes each segment has already been validated as digits.
 */
export function toE164(segments: string[]): string {
  return `+1${segments.join('')}`;
}
