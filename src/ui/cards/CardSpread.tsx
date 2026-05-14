// Four-card diamond layout. Positions match FOUR_CARD_DIAMOND from
// src/pipeline/spreads.ts (top / left / right / bottom). The spread
// container is fixed-aspect so layout never reflows.

import type { DrawnCards } from '../../pipeline';
import { Card } from './Card';

type Props = {
  drawn: DrawnCards;
  /** Position ids that have been revealed (face-up). */
  revealed: string[];
  /** Optional: which position is currently flipping (gets a CSS hook for emphasis). */
  active?: string | null;
};

export function CardSpread({ drawn, revealed, active }: Props) {
  return (
    <div className="card-spread" aria-label="four-card diamond spread">
      {drawn.cards.map((dc) => {
        const slot = dc.position.id;
        const isRevealed = revealed.includes(slot);
        const isActive = active === slot;
        return (
          <div
            key={slot}
            className={`card-spread__slot card-spread__slot--${slot} ${
              isActive ? 'card-spread__slot--active' : ''
            }`}
            aria-label={dc.position.role}
          >
            <Card card={dc.card} revealed={isRevealed} />
          </div>
        );
      })}
    </div>
  );
}
