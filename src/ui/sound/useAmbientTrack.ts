// Looping ambient audio layer for menu screens. Multiple instances can
// stack (kalimba + celeste together) — each owns its own HTMLAudioElement
// so they play independently and at independent volumes.
//
// Autoplay: browsers block audio.play() before any user gesture. When the
// first attempt rejects, we wire a one-shot listener that retries on the
// next interaction anywhere on the page (capture phase). Cleanup detaches
// the listener if the component unmounts before any gesture fires.
//
// soundOn: read once at mount via loadSettings(). Toggling the setting
// while a Menu is mounted won't take effect until the next mount — this
// is fine because Settings is reached BY leaving the menu.

import { useEffect } from 'react';
import { loadSettings } from '../../storage';

export function useAmbientTrack(src: string, volume = 0.3): void {
  useEffect(() => {
    if (!loadSettings().soundOn) return;
    const audio = new Audio(src);
    audio.loop = true;
    audio.volume = volume;
    audio.preload = 'auto';

    let wakeListener: ((e: Event) => void) | null = null;
    const detachWake = (): void => {
      if (!wakeListener) return;
      window.removeEventListener('pointerdown', wakeListener, true);
      window.removeEventListener('keydown', wakeListener, true);
      wakeListener = null;
    };

    const tryPlay = (): void => {
      audio.play().catch(() => {
        if (wakeListener) return;       // already armed
        wakeListener = () => {
          detachWake();
          audio.play().catch(() => { /* still blocked — give up quietly */ });
        };
        window.addEventListener('pointerdown', wakeListener, { capture: true, once: true });
        window.addEventListener('keydown', wakeListener, { capture: true, once: true });
      });
    };
    tryPlay();

    return () => {
      detachWake();
      audio.pause();
      audio.src = '';
    };
  }, [src, volume]);
}
