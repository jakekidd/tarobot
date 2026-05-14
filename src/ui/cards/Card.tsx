// Single tarot card. Two faces (back + front) inside a CSS-3D wrapper.
// `revealed` flips the wrapper around its Y axis to bring the front into
// view. Cards are sized once via CSS and never reflow.

import type { Card as TarotCard } from '../../pipeline';
import { glyphFor, labelFor, numeralFor } from './glyphs';

type Props = {
  card: TarotCard;
  revealed: boolean;
  /** Optional click handler — only meaningful while face-down. */
  onClick?: () => void;
};

export function Card({ card, revealed, onClick }: Props) {
  return (
    <button
      type="button"
      className={`tarot-card ${revealed ? 'tarot-card--revealed' : ''}`}
      onClick={revealed ? undefined : onClick}
      aria-label={revealed ? card.name : 'face-down card'}
    >
      <div className="tarot-card__inner">
        <div className="tarot-card__face tarot-card__face--back" aria-hidden>
          <div className="tarot-card__back-pattern" />
        </div>
        <div className="tarot-card__face tarot-card__face--front" aria-hidden={!revealed}>
          <div className="tarot-card__numeral">{numeralFor(card)}</div>
          <div className="tarot-card__glyph">{glyphFor(card)}</div>
          <div className="tarot-card__label">{labelFor(card)}</div>
        </div>
      </div>
    </button>
  );
}
