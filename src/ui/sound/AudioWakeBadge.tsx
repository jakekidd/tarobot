// Small indicator showing audio is suspended (no user gesture yet).
// Shows '♪ tap anywhere' in muted color; fades on the first gesture.
//
// Browsers block both Web Audio and HTMLAudioElement.play() until the
// user interacts with the page. On hard-reload, that means the menu
// loads silent. This badge gives the user a visible reason to know
// audio is coming — they don't have to wonder if it's broken.

import { useEffect, useState } from 'react';
import { hasAudioWoken, subscribeAudioWakeState } from './audioWake';

export function AudioWakeBadge() {
  const [woken, setWoken] = useState<boolean>(() => hasAudioWoken());

  useEffect(() => {
    if (woken) return;
    return subscribeAudioWakeState((next) => setWoken(next));
  }, [woken]);

  if (woken) return null;
  return (
    <span
      className="audio-wake-badge"
      role="status"
      aria-label="audio paused — tap anywhere to enable"
      title="tap anywhere to enable sound"
    >
      ♪ <span className="audio-wake-badge__hint">tap to enable sound</span>
    </span>
  );
}
