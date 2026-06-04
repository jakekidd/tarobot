// NameDialogue — the turtle's dialogue for the name step. It types the
// question once (the turtle "says" it), then, one line below, reflects the
// player's name live as they type it: "i'm sensing… a JAKE", the name in fancy
// serif caps, accent-colored, gently floating + glowing. This is the original
// relationship-sensing mechanic, moved into the dialogue where it belongs.

import { useState } from 'react';
import { useTypewriter } from '../dialogue/useTypewriter';
import { loadSettings } from '../../storage';

type Props = {
  question: string;
  name: string;
  color: string;
};

export function NameDialogue({ question, name, color }: Props) {
  const [settings] = useState(() => loadSettings());
  const { displayed, done } = useTypewriter(question, settings.charDelayMs);
  const n = name.trim();
  const article = /^[aeiou]/i.test(n) ? 'an' : 'a';

  return (
    <div className="dialogue-stage dialogue-stage--instant name-dialogue" role="region" aria-live="polite">
      <span className="dialogue-text name-dialogue__q">
        {displayed}
        {!done && <span className="dialogue-caret" aria-hidden>▍</span>}
      </span>
      {done && n.length > 0 && (
        <span className="name-dialogue__sensing">
          i'm sensing… {article}{' '}
          <span className="name-dialogue__name" style={{ color }}>{n.toUpperCase()}</span>
        </span>
      )}
    </div>
  );
}
