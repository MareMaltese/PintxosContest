import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from './relativeTime';

const NOW = new Date('2026-09-17T12:00:00.000Z');

describe('formatRelativeTime', () => {
  it('shows "en línea" for activity within the last 30 seconds', () => {
    expect(formatRelativeTime('2026-09-17T11:59:45.000Z', NOW)).toBe('en línea');
  });

  it('shows seconds for activity under a minute ago', () => {
    expect(formatRelativeTime('2026-09-17T11:59:15.000Z', NOW)).toBe('hace 45 s');
  });

  it('shows minutes for activity under an hour ago', () => {
    expect(formatRelativeTime('2026-09-17T11:53:00.000Z', NOW)).toBe('hace 7 min');
  });

  it('shows hours for activity an hour or more ago', () => {
    expect(formatRelativeTime('2026-09-17T09:30:00.000Z', NOW)).toBe('hace 2 h');
  });

  it('never shows a negative duration for clock-skewed timestamps', () => {
    expect(formatRelativeTime('2026-09-17T12:00:05.000Z', NOW)).toBe('en línea');
  });
});
