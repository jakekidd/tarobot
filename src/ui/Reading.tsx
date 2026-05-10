import { useMemo, useState } from 'react';
import { Reader } from './reader/Reader';
import { Dialogue } from './dialogue/Dialogue';
import { Spread3D } from './cards3d/Spread3D';
import type {
  Chapter,
  DrawnCards,
  EnrichedProfile,
  Reading as ReadingT,
} from '../pipeline';

type Props = {
  profile: EnrichedProfile;
  drawn: DrawnCards;
  reading: ReadingT;
  onComplete: () => void;
  onCancel: () => void;
};

export function Reading({ drawn, reading, onComplete, onCancel }: Props) {
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [activeChapter, setActiveChapter] = useState<Chapter | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [showAllChapters, setShowAllChapters] = useState(false);

  // Map position_id -> chapter for quick lookup.
  const chaptersByPosition = useMemo(() => {
    const m = new Map<string, Chapter>();
    for (const c of reading.chapters) m.set(c.position_id, c);
    return m;
  }, [reading]);

  const onCardClick = (positionId: string) => {
    if (revealed.has(positionId)) {
      // Re-show its chapter if user clicks again.
      const ch = chaptersByPosition.get(positionId);
      if (ch) setActiveChapter(ch);
      return;
    }
    const ch = chaptersByPosition.get(positionId);
    if (!ch) return;
    setRevealed((prev) => {
      const next = new Set(prev);
      next.add(positionId);
      return next;
    });
    setActiveChapter(ch);
  };

  const allRevealed = revealed.size === drawn.spread.positions.length;

  const promptText = activeChapter
    ? activeChapter.spoken_text
    : revealed.size === 0
      ? 'they wait. choose one. turn it over.'
      : `four cards in front of you. ${drawn.spread.positions.length - revealed.size} still face-down.`;

  return (
    <div className="screen screen--reading">
      <header className="reading__header">
        <Reader isSpeaking={speaking} />
        <Dialogue
          key={activeChapter?.position_id ?? `none-${revealed.size}`}
          text={promptText}
          onTypingChange={setSpeaking}
          charDelayMs={28}
        />
      </header>

      <div className="reading__board">
        <Spread3D
          drawn={drawn}
          flippedIds={revealed}
          onCardClick={onCardClick}
        />
      </div>

      <aside className="reading__theme">
        <div className="reading__theme-label">theme</div>
        <div className="reading__theme-text">{reading.theme}</div>
      </aside>

      <div className="reading__nav">
        <button className="btn btn--quiet" onClick={onCancel}>quit</button>
        <button
          className="btn btn--ghost"
          onClick={() => setShowAllChapters((v) => !v)}
        >
          {showAllChapters ? 'hide read' : 'see what was read'}
        </button>
        {allRevealed && (
          <button className="btn btn--primary" onClick={onComplete}>
            close the reading
          </button>
        )}
      </div>

      {showAllChapters && (
        <div className="reading__transcript">
          <div className="reading__arc">{reading.arc}</div>
          {drawn.spread.positions.map((p) => {
            const ch = chaptersByPosition.get(p.id);
            const card = drawn.cards.find((c) => c.position.id === p.id)?.card;
            const seen = revealed.has(p.id);
            return (
              <div
                key={p.id}
                className={`reading__chapter ${seen ? '' : 'reading__chapter--hidden'}`}
              >
                <div className="reading__chapter-head">
                  <span className="reading__chapter-pos">{p.id}</span>
                  <span className="reading__chapter-card">{seen ? card?.name : '?'}</span>
                </div>
                <div className="reading__chapter-text">
                  {seen ? ch?.spoken_text : '— still face-down —'}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
