import { useEffect, useRef, useState } from 'react';

export type TypewriterState = {
  displayed: string;
  done: boolean;
  skip: () => void;
};

/**
 * Emit `text` one character at a time with speech-shaped cadence.
 *
 * The naturalistic feel comes from layering five things on top of a
 * constant base char-delay:
 *
 *   1. Per-char class delay
 *        ellipsis (… ...)  → long thoughtful pause   (+700-1100 ms)
 *        sentence end .?!  → big pause                (+260-520 ms)
 *        em-/en-dash —–    → mid pause                (+180-320 ms)
 *        comma / colon ,;: → small pause              (+95-200 ms)
 *        word boundary ' ' → micro pause              (+18-44 ms)
 *   2. Multi-char run for "…" or "..." treated as a SINGLE ellipsis
 *      pause (charged on the last char of the run) instead of three
 *      sentence-end pauses stacked.
 *   3. Phrase-breath: after ~9-13 words of unbroken prose, an extra
 *      ~70-160 ms breath pause regardless of punctuation. (No real
 *      speaker can run a whole line without inhaling.)
 *   4. Per-char random jitter: ±25% of base delay so the rhythm
 *      doesn't read as a metronome.
 *   5. Slight base-delay slowdown after a sentence end (≈1.08×) for
 *      the next ~8 chars — picking the next thought up takes a beat.
 *
 * No speech-to-text. No phoneme duration. This is rule-based cadence,
 * and it lands surprisingly close to a real reader's rhythm for the
 * cost of a few regexes.
 *
 * Consumers should remount via `key` to retype a new line.
 */
export function useTypewriter(
  text: string,
  charDelayMs: number,
  onChar?: (charCode: number) => void,
  onDone?: () => void,
): TypewriterState {
  const empty = text.length === 0;
  const [displayed, setDisplayed] = useState<string>(empty ? text : '');
  const [done, setDone] = useState<boolean>(empty);
  const indexRef = useRef(0);
  const onCharRef = useRef(onChar);
  const onDoneRef = useRef(onDone);

  useEffect(() => { onCharRef.current = onChar; }, [onChar]);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    if (empty) {
      onDoneRef.current?.();
      return;
    }
    let stopped = false;
    let timeoutId = 0;
    let wordsSinceBreath = 0;
    let postSentenceCarry = 0;          // chars remaining of slowdown window

    const tick = () => {
      if (stopped) return;
      indexRef.current += 1;
      const next = text.slice(0, indexRef.current);
      setDisplayed(next);
      const ch = text[indexRef.current - 1] ?? '';
      onCharRef.current?.(ch.charCodeAt(0));

      if (indexRef.current >= text.length) {
        setDone(true);
        onDoneRef.current?.();
        return;
      }

      // Base delay + post-sentence slowdown window
      const postSlow = postSentenceCarry > 0 ? 1.08 : 1.0;
      if (postSentenceCarry > 0) postSentenceCarry -= 1;
      let delay = charDelayMs * postSlow;

      // Per-char jitter (±25%) — keeps rhythm out of metronome territory
      delay *= 0.75 + Math.random() * 0.50;

      // Char-class pauses
      const peekPrev = text[indexRef.current - 2] ?? '';
      const peekPrev2 = text[indexRef.current - 3] ?? '';
      const next1 = text[indexRef.current] ?? '';

      // Ellipsis handling — sanitize converts every ellipsis form to
      // SPACED ". . ." so the dots type one at a time with the right
      // rhythm. We need to detect this pattern so each dot doesn't
      // trigger a full sentence-end pause.
      //
      // Patterns inside ". . .":
      //   first  . — char='.', next1=' ', nextNext='.'
      //   middle . — char='.', peekPrev2='.', peekPrev=' '
      //   last   . — char='.', peekPrev2='.', peekPrev=' ', next1≠'.'
      const nextNext = text[indexRef.current + 1] ?? '';
      const isFirstSpacedDot = ch === '.' && next1 === ' ' && nextNext === '.';
      const isMidSpacedDot = ch === '.' && peekPrev === ' ' && peekPrev2 === '.' && nextNext === '.';
      const isLastSpacedDot = ch === '.' && peekPrev === ' ' && peekPrev2 === '.' && nextNext !== '.';
      const isEllipsisChar = ch === '…';
      const isThirdDotOfRun = ch === '.' && peekPrev === '.' && peekPrev2 === '.';
      const isMidDotOfRun = ch === '.' && (next1 === '.' || peekPrev === '.');

      if (isLastSpacedDot) {
        // Final dot of ". . ." — full thoughtful pause + reset state
        delay += 600 + Math.random() * 350;
        postSentenceCarry = 8;
        wordsSinceBreath = 0;
      } else if (isFirstSpacedDot || isMidSpacedDot) {
        // Mid-ellipsis dot — moderate pause, NOT a sentence-end
        delay += 180 + Math.random() * 140;
      } else if (isEllipsisChar || isThirdDotOfRun) {
        delay += 700 + Math.random() * 400;
        postSentenceCarry = 8;
        wordsSinceBreath = 0;
      } else if (isMidDotOfRun) {
        // Don't stack sentence-end pauses on every dot of "..."
        delay += 8;
      } else if (/[.?!]/.test(ch)) {
        delay += 260 + Math.random() * 260;
        postSentenceCarry = 8;
        wordsSinceBreath = 0;
      } else if (/[—–]/.test(ch)) {
        delay += 180 + Math.random() * 140;
      } else if (/[,;:]/.test(ch)) {
        delay += 95 + Math.random() * 105;
      } else if (ch === ' ') {
        delay += 18 + Math.random() * 26;
        wordsSinceBreath += 1;
        // Phrase-breath every ~9-13 words
        if (wordsSinceBreath >= 9 + Math.random() * 4) {
          delay += 70 + Math.random() * 90;
          wordsSinceBreath = 0;
        }
      }

      timeoutId = window.setTimeout(tick, delay);
    };

    timeoutId = window.setTimeout(tick, charDelayMs);
    return () => {
      stopped = true;
      window.clearTimeout(timeoutId);
    };
  }, [text, charDelayMs, empty]);

  const skip = () => {
    if (done) return;
    setDisplayed(text);
    setDone(true);
    indexRef.current = text.length;
    onDoneRef.current?.();
  };

  return { displayed, done, skip };
}
