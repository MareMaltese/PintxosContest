const ADMIN_PIN_KEY = 'pinchoParty.adminPin';

export function getStoredAdminPin(): string | null {
  return localStorage.getItem(ADMIN_PIN_KEY);
}

export function saveAdminPin(pin: string): void {
  localStorage.setItem(ADMIN_PIN_KEY, pin);
}

export function clearAdminPin(): void {
  localStorage.removeItem(ADMIN_PIN_KEY);
}
