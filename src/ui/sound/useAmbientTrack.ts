// Looping ambient audio layer. Multiple instances can stack (different
// component mounts can each register a track) — each owns its own
// HTMLAudioElement so they play independently.
//
// Wake handling is delegated to audioWake.ts (single source of truth for
// "has the user gestured yet"). If the page hasn't been interacted with
// when this mounts, the audio element exists but stays paused; on first
// gesture anywhere in the app, all pending tracks start together.
//
// soundOn: read once at mount via loadSettings(). Toggling the setting
// while a mounted component is using this hook won't take effect until
// next mount — Settings is reached BY leaving whatever mounted the audio.

import { useEffect } from 'react';
import { loadSettings } from '../../storage';
import { hasAudioWoken, onAudioWake } from './audioWake';

export function useAmbientTrack(src: string, volume = 0.3): void {
  useEffect(() => {
    if (!loadSettings().soundOn) return;
    const audio = new Audio(src);
    audio.loop = true;
    audio.volume = volume;
    audio.preload = 'auto';

    let cancelled = false;
    const startPlay = (): void => {
      if (cancelled) return;
      audio.play().catch(() => { /* still blocked or stopped — silent */ });
    };

    let unsubWake: (() => void) | null = null;
    if (hasAudioWoken()) {
      // Page already had a user gesture earlier in the session — safe to
      // start immediately. This is the common case for second+ mounts.
      startPlay();
    } else {
      // First mount before any gesture. Wait for the wake signal.
      unsubWake = onAudioWake(startPlay);
    }

    return () => {
      cancelled = true;
      if (unsubWake) unsubWake();
      audio.pause();
      audio.src = '';
    };
  }, [src, volume]);
}
