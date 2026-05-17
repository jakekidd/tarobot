// Persistence for the debug overlay visibility toggle. Split into its own
// module so Debug.tsx stays component-only (avoids the react-refresh
// "shared exports" warning).

const VISIBLE_KEY = 'tarobot:debug:visible';

export function loadDebugVisible(): boolean {
  try {
    return localStorage.getItem(VISIBLE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveDebugVisible(v: boolean): void {
  try {
    localStorage.setItem(VISIBLE_KEY, v ? '1' : '0');
  } catch {
    /* ignore */
  }
}
