import { CatScene } from './CatScene';

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
 * The cat in 3D — floating in the void, no box, no scanlines.
 * Screen-level CRT layers handle the rest.
 */
export function Reader({ isSpeaking = false, mood = 'neutral', reaction = null }: Props) {
  return (
    <div className="reader">
      <CatScene
        state={MOOD_TO_STATE[mood]}
        reaction={reaction ?? undefined}
        speaking={isSpeaking}
      />
    </div>
  );
}
