import { CatSprite } from './CatSprite';

type Mood = 'neutral' | 'thinking' | 'flipping' | 'reading' | 'sleeping';

type Props = {
  isSpeaking?: boolean;
  mood?: Mood;
  reaction?: 'happy' | 'surprised' | 'error' | 'interrupted' | null;
};

const MOOD_TO_STATE: Record<Mood, string> = {
  neutral: 'idle',
  thinking: 'thinking',
  flipping: 'cooking',
  reading: 'reading',
  sleeping: 'sleeping',
};

/**
 * Tarobot's avatar — animated unicode-block ASCII cat ported from claude-cat.
 */
export function Reader({ isSpeaking = false, mood = 'neutral', reaction = null }: Props) {
  return (
    <div className="reader">
      <div className="reader__box">
        <CatSprite
          state={MOOD_TO_STATE[mood]}
          reaction={reaction ?? undefined}
          speaking={isSpeaking}
        />
        <div className="reader__scanlines" aria-hidden />
      </div>
    </div>
  );
}
