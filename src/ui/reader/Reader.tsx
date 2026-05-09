type Mood = 'neutral' | 'thinking' | 'flipping';

type Props = {
  isSpeaking?: boolean;
  mood?: Mood;
};

/**
 * Tarobot's avatar — a recolored cat from the catacombs/quarry sprite.
 * No sprite frames; "speaking" = subtle scale/brightness pulse synced to
 * the dialogue typewriter.
 */
export function Reader({ isSpeaking = false, mood = 'neutral' }: Props) {
  const cls = [
    'reader',
    `reader--${mood}`,
    isSpeaking ? 'reader--speaking' : 'reader--idle',
  ].join(' ');

  return (
    <div className={cls}>
      <div className="reader__box">
        <img src="/cat.png" alt="" className="reader__img" />
        <div className="reader__scanlines" aria-hidden />
      </div>
    </div>
  );
}
