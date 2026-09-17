export interface StoredSession {
  id: string;
  name: string;
}

const USER_ID_KEY = 'pinchoParty.userId';
const USER_NAME_KEY = 'pinchoParty.userName';

export function loadStoredSession(): StoredSession | null {
  const id = localStorage.getItem(USER_ID_KEY);
  const name = localStorage.getItem(USER_NAME_KEY);
  if (!id || !name) return null;
  return { id, name };
}

export function saveStoredSession(session: StoredSession): void {
  localStorage.setItem(USER_ID_KEY, session.id);
  localStorage.setItem(USER_NAME_KEY, session.name);
}

export function clearStoredSession(): void {
  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(USER_NAME_KEY);
}

export function getStoredUserId(): string | null {
  return localStorage.getItem(USER_ID_KEY);
}
