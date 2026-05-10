import { useState } from 'react';
import { Reader } from './reader/Reader';
import { Dialogue } from './dialogue/Dialogue';
import type { DrawnCards, EnrichedProfile, Reading } from '../pipeline';

type Props = {
  profile: EnrichedProfile;
  reading: Reading;
  drawn?: DrawnCards;
  onDone: () => void;
};

export function Closing({ profile, reading, drawn, onDone }: Props) {
  const [speaking, setSpeaking] = useState(false);
  const text = reading.closing_text || 'go on now. i\'ll be here when the moon turns.';

  function exportTranscript() {
    const blob = {
      profile,
      drawn,
      reading,
      exported_at: new Date().toISOString(),
    };
    const data = JSON.stringify(blob, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.download = `tarobot-${profile.name || 'reading'}-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="screen screen--closing">
      <Reader isSpeaking={speaking} />
      <Dialogue text={text} onTypingChange={setSpeaking} charDelayMs={32} />
      <div className="closing__nav">
        <button className="btn btn--ghost" onClick={exportTranscript}>
          download transcript
        </button>
        <button className="btn btn--primary" onClick={onDone}>
          back to menu
        </button>
      </div>
    </div>
  );
}
