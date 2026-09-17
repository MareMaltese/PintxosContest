import { describe, it, expect, beforeEach } from 'vitest';
import { loadStoredSession, saveStoredSession, clearStoredSession, getStoredUserId } from './sessionStorage';

beforeEach(() => localStorage.clear());

describe('sessionStorage', () => {
  it('returns null when nothing is stored', () => {
    expect(loadStoredSession()).toBeNull();
    expect(getStoredUserId()).toBeNull();
  });

  it('round-trips a saved session', () => {
    saveStoredSession({ id: 'u1', name: 'Laura' });
    expect(loadStoredSession()).toEqual({ id: 'u1', name: 'Laura' });
    expect(getStoredUserId()).toBe('u1');
  });

  it('clears a stored session', () => {
    saveStoredSession({ id: 'u1', name: 'Laura' });
    clearStoredSession();
    expect(loadStoredSession()).toBeNull();
    expect(getStoredUserId()).toBeNull();
  });

  it('treats a partially-stored session as absent', () => {
    localStorage.setItem('pinchoParty.userId', 'u1');
    expect(loadStoredSession()).toBeNull();
  });
});
