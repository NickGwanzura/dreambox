export type AppNotificationType = 'info' | 'success' | 'error' | 'warning';

/** Dispatch a notification without coupling services to React context. */
export function notifyApp(message: string, type: AppNotificationType = 'info'): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('app:toast', { detail: { message, type } }));
}
