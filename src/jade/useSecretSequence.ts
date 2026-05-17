// Listen for the literal letter sequence 'j','a','d','e' typed anywhere
// in the page (modifier keys ignored, character-only). On match, unlock
// the Jade editor entrance and persist that unlock across reloads. No
// visible feedback while typing — discovery is half the trick.

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'tarobot:jade:unlocked';
const SEQUENCE = ['j', 'a', 'd', 'e'];

function loadUnlocked(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function persistUnlocked(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function useSecretSequence(): { unlocked: boolean } {
  const [unlocked, setUnlocked] = useState<boolean>(() => loadUnlocked());

  useEffect(() => {
    if (unlocked) return;
    let pos = 0;
    const onKey = (e: KeyboardEvent) => {
      // Skip if the user is mid-edit (typing into a normal input/textarea).
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === SEQUENCE[pos]) {
        pos += 1;
        if (pos >= SEQUENCE.length) {
          persistUnlocked();
          setUnlocked(true);
          pos = 0;
        }
      } else if (k === SEQUENCE[0]) {
        pos = 1;
      } else {
        pos = 0;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [unlocked]);

  return { unlocked };
}
