import { describe, it, expect, beforeEach } from 'vitest';
import { getStoredAdminPin, saveAdminPin, clearAdminPin } from './adminAuth';

beforeEach(() => localStorage.clear());

describe('adminAuth storage', () => {
  it('returns null when nothing is stored', () => {
    expect(getStoredAdminPin()).toBeNull();
  });

  it('round-trips a saved pin', () => {
    saveAdminPin('1234');
    expect(getStoredAdminPin()).toBe('1234');
  });

  it('clears a stored pin', () => {
    saveAdminPin('1234');
    clearAdminPin();
    expect(getStoredAdminPin()).toBeNull();
  });
});
