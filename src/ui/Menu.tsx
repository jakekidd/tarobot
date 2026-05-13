import { useEffect, useState } from 'react';
import { Reader } from './reader/Reader';
import { Dialogue } from './dialogue/Dialogue';
import { chime } from './sound/sound';
import { listResumable } from '../storage';

type Props = {
  onBegin: () => void;
  onOpenResume: () => void;
  onSettings: () => void;
};

const GREETING = 'come in. tell me you want to know.';

export function Menu({ onBegin, onOpenResume, onSettings }: Props) {
  const [resumeCount] = useState(() => listResumable().length);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => { chime(); }, []);

  return (
    <div className="screen screen--menu">
      <div className="menu__stage">
        <Reader isSpeaking={speaking} />
        <Dialogue text={GREETING} onTypingChange={setSpeaking} />
      </div>

      <div className="menu__choices">
        <button className="btn btn--primary btn--menu" onClick={onBegin}>
          BEGIN
        </button>
        {resumeCount > 0 && (
          <button className="btn btn--primary btn--menu" onClick={onOpenResume}>
            RESUME
          </button>
        )}
        <button className="btn btn--ghost btn--menu" onClick={onSettings}>
          SETTINGS
        </button>
      </div>
    </div>
  );
}
